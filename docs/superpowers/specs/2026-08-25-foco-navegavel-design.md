# Foco navegável — dock durante o ciclo, tela cheia por ociosidade e pílula de segundo plano

Data: 2026-08-25
Status: aprovado (aguardando implementação)

## Problema

Hoje, clicar em "Iniciar" no Foco esconde o dock lateral imediatamente e, 2,8s depois,
joga o app em tela cheia. O resultado prático é que **não dá para ir mexer nas Tarefas
com um ciclo rodando** — a única porta de saída (o dock) some junto com o resto.

Três defeitos concretos:

1. `.app.is-running .dock` (`global.css:355`) zera opacidade e `pointer-events`, e o
   dock **não tem escape** na regra de `.is-revealed` (`global.css:376`), diferente de
   `.focus-actions` e `.account-menu`. Ou seja: some e não volta nem mexendo o mouse.
2. O auto-expand (`App.jsx:1915`) dispara por **tempo desde o Iniciar**, não por
   ociosidade. Quem está interagindo com a tela é levado pra tela cheia do mesmo jeito.
3. `autoExpandSuppressed` é zerada no topo do efeito, cujas deps são
   `[isRunning, section]` (`App.jsx:1917`). Voltar pra seção Foco re-arma o fullscreen
   mesmo depois de o usuário ter minimizado na mão.

Não falta motor: `useTimer` vive no `AppShell`, acima do switch de seções, e nunca
desmonta. `isRunning` já é `section === "foco" && timer.running`, então sair do Foco já
derruba o modo imersivo sozinho. O ciclo **já** conta em segundo plano — falta acesso e
falta feedback.

## Comportamento desejado

| Situação | O que acontece |
|---|---|
| Parado, sem ciclo | Tudo visível. Sem mudança. |
| Clicou em "Iniciar" | Ciclo conta. **Dock continua visível.** Ambiente escurece. |
| Mexendo o mouse | Continua tudo visível. **Não** entra em tela cheia. |
| Mouse parado ~2,5s | Controles somem **e a tela cheia entra junto**, no mesmo instante. |
| Dentro da tela cheia, mexendo o mouse | Continua em tela cheia. Só revela o ícone de minimizar. |
| Sai da tela cheia (ícone ou Esc) | Volta ao normal e **ganha a folga cheia** (contagem de ociosidade do zero). |
| Fica parado de novo | Entra em tela cheia outra vez. Repete indefinidamente. |
| Vai pras Tarefas com ciclo rodando | Seção normal. Pílula no canto inferior esquerdo mostrando o ciclo. |
| Volta pro Foco | Modo normal contando. Parou ⇒ tela cheia de novo. |

A regra central: **tela cheia é função de ociosidade, não de tempo decorrido.** Entra
sozinha sempre que o usuário para; sai apenas por ação explícita.

## Arquitetura

### 1. Dock revelável durante o ciclo — `global.css`

`.dock` entra na regra de reveal existente, ao lado de `.focus-actions` e
`.account-menu`, com `transform: translateX(0)` e `pointer-events: auto`. A regra de
esconder (`:355`) fica intacta — só ganha escape.

Não há conflito de especificidade com a tela cheia: `.app.is-expanded .dock`
(`global.css:727`) usa `!important`, que vence o reveal independentemente. Tela cheia
continua sendo o único estado que mata o dock de vez.

Clicar num item do dock troca a seção, `isRunning` cai sozinho e a UI volta ao normal
com o timer intacto. Nenhum código extra necessário.

### 2. Ociosidade como gatilho único — `App.jsx`

O timer de ociosidade que hoje só controla `revealed` passa a controlar **as duas
coisas**: esconder os controles e entrar em tela cheia.

- Extrair o timer para um ref + `scheduleIdle()` estável, em vez do `let hideTimer`
  fechado dentro do efeito. Isso permite reiniciá-lo de fora.
- Ao disparar: `setRevealed(false)` e, se `isRunning && !expanded`, `setExpanded(true)`.
  A guarda `!expanded` evita re-expandir quem já está em tela cheia (o timer continua
  rodando lá, só para apagar o ícone de minimizar).
- Sinais de atividade: `pointermove`, `pointerdown` e `keydown`. Só `mousemove` deixaria
  de fora quem navega por teclado e o toque.
- `toggleExpanded` e o handler de Esc chamam `scheduleIdle()` depois de minimizar,
  entregando a folga cheia decidida no design.
- O efeito `F3` de auto-expand por tempo (`:1915`) e o ref `autoExpandSuppressed` são
  **removidos** — a ociosidade substitui os dois.

**Gate de plataforma:** o auto-expand por ociosidade só vale onde existe ponteiro fino
(`matchMedia("(hover: hover) and (pointer: fine)")`). O modelo mental inteiro —
"mexendo o mouse" vs "mouse parado" — não existe no toque: sem hover não há sinal
passivo de presença, então um gatilho que repete viraria armadilha (minimizou, 2,5s
depois volta, sem forma natural de segurar). No mobile a tela cheia continua manual pelo
ícone. Isso substitui o auto-expand por tempo que existia lá.

`MobileNav` passa de `hidden={isRunning || focoExpanded}` para `hidden={focoExpanded}`,
pelo mesmo motivo do dock: navegar durante o ciclo tem que ser possível.

### 3. Pílula de ciclo — `CyclePill.jsx` (novo)

Componente sem estado próprio, renderizado **fora do `.app`**, irmão do `MobileNav` —
mesma razão já documentada no CONTEXTO: `position: fixed` dentro do `.app` flutuava no
launch do PWA iOS por causa dos recálculos de layout do container.

- **Condição de exibição:** `timer.running && section !== "foco"`. Dentro do Foco o
  relógio já é o feedback; em tela cheia nada aparece mesmo.
- **Conteúdo:** ponto colorido pela fase, `Foco`/`Pausa`, tempo restante, `Ciclo X/Y`,
  e uma barra fina de progresso na base.
- **Progresso** exige a duração da fase corrente, que `useTimer` calcula internamente
  (`durationFor(mode, cycle - 1)`) mas não expõe. Adicionar `duration` ao retorno do
  hook — uma linha, e o valor já é derivado, sem estado novo.
- **Interação:** é um `<button>`; clicar volta pra seção Foco.
- **Acessibilidade:** `aria-label` descritivo e **sem** `aria-live` — uma região viva
  atualizando a cada segundo viraria ruído em leitor de tela.
- **Visual:** vocabulário do `.alarm-toast` (blur + fundo escuro translúcido),
  `border-radius: 999px`, cores por token nos dois temas. Ponto usa `--accent` no Foco e
  um tom apagado na Pausa.
- **Animação:** GSAP, entrada deslizando da esquerda, em `useLayoutEffect`, com guarda
  de `prefers-reduced-motion`. Os segundos só trocam texto; nada re-anima por tick.
- **Mobile:** mesmo canto, ancorada acima da bottom nav (`bottom: 90px` — a barra tem
  altura fechada de 78px, `nav.css:44`), num bloco do `mobile/layout.css`.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/styles/global.css` | `.dock` no reveal; estilos da `.cycle-pill` + tokens |
| `src/App.jsx` | timer de ociosidade unificado; remoção do auto-expand por tempo; `MobileNav`; render da pílula |
| `src/hooks/useTimer.js` | expor `duration` |
| `src/components/CyclePill.jsx` | novo |
| `src/styles/mobile/layout.css` | pílula acima da bottom nav |

## Fora de escopo

- Botão de pausar dentro da pílula (mantém a pílula informativa, não um segundo painel).
- Pílula para o Cronômetro (motor separado, `useStopwatch`).
- Som e notificação na virada de fase — já existem e não mudam.
- Animação de saída da pílula: só entrada, por simplicidade.

## Validação

Sem testes automatizados no projeto; validação é visual + `npm run build` limpo.

Roteiro manual no browser (desktop):

1. Iniciar ⇒ dock permanece; mexer o mouse ⇒ segue visível, sem tela cheia.
2. Parar o mouse ⇒ controles somem e a tela cheia entra no mesmo instante.
3. Mexer o mouse na tela cheia ⇒ continua em tela cheia; ícone de minimizar acende.
4. Esc ⇒ volta ao normal; parar de novo ⇒ tela cheia outra vez.
5. Durante o ciclo, clicar em Tarefas ⇒ navega, timer segue, pílula aparece à esquerda.
6. Clicar na pílula ⇒ volta ao Foco no estado normal, contando.
7. Mobile (DevTools): nav visível com ciclo rodando; sem tela cheia automática.

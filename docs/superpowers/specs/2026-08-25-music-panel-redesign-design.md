# Painel de música — barra compacta com seletor de faixa única

Data: 2026-08-25
Status: implementado e validado

## Revisão visual final

A primeira implementação compacta ainda parecia pequena e visualmente solta: pílula,
switch e volume tinham escalas diferentes, e o switch usava vocabulário de preferência
para uma ação de transporte de mídia. A revisão final consolidou tudo numa cápsula de
mini player, substituiu o switch por play/pause circular e removeu o rótulo externo
`Música`. O seletor de faixa deixou de ser um popover ancorado e virou modal central,
seguindo o padrão de acessibilidade do `SettingsModal`.

## Problema

O painel de música atual (`MusicPanel.jsx`) mostra as 6 faixas como um grid 2×6 de
toggles individuais, mais uma coluna vertical de volume — pesado visualmente, só cabe
no desktop, e cada faixa é um controle isolado. O usuário quer um controle central:
liga/desliga, escolher faixa (num seletor que abre por cima), e volume — os três juntos
numa barra fina.

Motivação de fundo (sessão anterior): as faixas vão passar a vir de vídeos baixados
manualmente (potencialmente 1h+ cada, já viável depois da troca de `preload="auto"`
para `"metadata"` em `music.js`). Um grid de N toggles não escala para uma biblioteca
maior — um seletor com lista é o formato certo daqui pra frente.

## Mudança de modelo: rotação (várias faixas) → seleção única

Hoje `musicEnabled` é um array de ids; várias faixas ligadas tocam em sequência com
crossfade (rotação). Isso vira **seleção única**: uma faixa selecionada por vez, toca em
loop (crossfade no próprio fim — o motor já suporta isso quando `playlist.length === 1`,
não muda). Trocar de faixa no seletor faz um crossfade imediato para a nova, não espera
o fim da atual.

O liga/desliga também muda de natureza: hoje é implícito (ter ≥1 faixa marcada = tocando
desde o "Iniciar"; mexer nos toggles em sessão só atualiza a rotação, nunca dá play
sozinho). Vira um **play/pause explícito**: clicar liga/desliga a música na hora, com o
ciclo rodando ou não. A regra antiga existia para evitar som surpresa por efeito
colateral de marcar uma caixinha — deixa de fazer sentido quando o próprio clique é a
intenção.

O que **não muda**: com um ciclo ativo, a música ainda reinicia do zero a cada virada de
fase (foco→pausa) e ainda faz o duck nos últimos 7s. Sair da seção Foco ainda para a
música (mesmo comportamento de hoje — decisão deliberada de não estender isso agora,
ver Fora de escopo).

## Arquitetura

### Estado — `App.jsx`

Substituir `musicEnabled` (array) por dois estados independentes:

- `musicTrackId` (string) — faixa selecionada. Default `MUSIC_TRACKS[0].id`.
  localStorage `fluxtime.music.track`.
- `musicOn` (bool) — liga/desliga explícito. Default `false`.
  localStorage `fluxtime.music.on`.

`musicSrc` deriva de `musicTrackId` via `useMemo`.

Três efeitos, adaptados dos três que já existem (start/stop, virada de ciclo, duck),
todos referenciando `musicSrc`/`musicOn` no lugar do array:

1. **Liga/desliga** — dispara em `[musicOn]` (não em mudança de faixa, pra não colidir
   com a troca ao vivo abaixo): `musicOn === true` chama `startMusic(musicSrc)`;
   `false` chama `stopMusic()`. Lê a faixa atual por ref no momento do disparo.
2. **Troca de faixa ao vivo** — função separada (`pickTrack(id)`), chamada pelo
   seletor: atualiza `musicTrackId` e, se `musicOn` já é `true`, chama
   `switchTrackNow(src)` (crossfade imediato). Se `musicOn` é `false`, só guarda a
   escolha — sem efeito no motor até o próximo play.
3. **Virada de ciclo e duck** — mesma lógica de hoje, só trocando a leitura da faixa
   atual para o singular.

### Motor — `music.js`

- `startCrossfade()` (loop automático por proximidade do fim) e o novo crossfade sob
  demanda compartilham a mesma rotina interna `crossfadeTo(nextSrc)` — extraída do
  corpo que hoje só existe dentro de `startCrossfade`.
- Novo export `switchTrackNow(src)`: atualiza `playlist = [src]`; se não está tocando ou
  já é a faixa ativa, só guarda; senão chama `crossfadeTo(src)`.
- `startMusic` passa a receber uma **string** (não mais array) — não há mais rotação de
  múltiplas faixas para justificar o array.
- `setMusicPlaylist` é removido (fica sem uso — a troca ao vivo assume o papel dela).
- `nextSrcOf` não muda: com `playlist.length === 1` já retorna a própria faixa (loop),
  comportamento que o motor já tinha antes desta mudança.

### Componentes

**`MusicPanel.jsx`** (reescrito) — mini player em cápsula, mesma posição/mesmo
fade-com-os-controles que o painel atual já tem (`.app.is-running`/`.is-revealed`/
`.is-expanded`, sem mudança nessas regras):

**play/pause circular** · **área da faixa atual** (abre o seletor) · **ícone de volume**
(abre popover com o slider). A superfície única dá escala e alinhamento ao conjunto sem
competir com os controles principais do timer.

**`MusicTrackPicker.jsx`** (novo) — modal central com as 6 faixas, seleção única e
indicador visual na ativa. Usa duas colunas no desktop e uma no mobile. Escape, foco
preso, fundo `inert` e retorno de foco seguem o contrato do `SettingsModal`.

**Volume**: popover pequeno com o slider horizontal + botão de mudo, reaproveitando a
lógica de `lastVolRef` que já existe hoje (guarda o último volume audível pra restaurar
ao desmutar) — só reembalada num popover em vez de sempre visível.

Somente o volume usa o `Popover.jsx` já existente (o mesmo das faixas/etiquetas do
Kanban). Abrir o modal de faixa fecha o volume e vice-versa.

**Melhoria pontual no `Popover.jsx` compartilhado**: adicionar fechar por Esc. Antes
nenhum consumidor (`AlarmsPopover`, `LabelsPopover`) tem isso — como o componente é
compartilhado, a mudança beneficia todos. O volume continua sendo popover leve; o seletor
de faixa, que virou diálogo bloqueante, recebe o tratamento completo de modal.

### CSS

- Remove `@media (max-width: 768px) { .music-panel { display: none !important; } }`
  (`global.css:4589`) — a barra compacta cabe no mobile.
- Reestrutura `.music-panel` como cápsula única: botão circular 52px, área flexível da
  faixa e alvo de volume 44px; no mobile o player ocupa até 360px sem overflow.
- `.music-pick` vira a área central do player e `.music-track-item[data-active]` destaca
  a faixa selecionada no modal com o acento vermelho.
- Volume: slider horizontal dentro do popover reaproveitando os tokens de
  `.music-vol__range` (troca `writing-mode: vertical-lr` por horizontal padrão).
- `.mtoggle`, `.mtoggle__track`, `.mtoggle__knob` são removidos; play/pause usa botão.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/music.js` | `crossfadeTo` interna; `switchTrackNow` novo; `startMusic(src)` vira string; remove `setMusicPlaylist` |
| `src/App.jsx` | `musicTrackId`/`musicOn` no lugar de `musicEnabled`; efeitos adaptados; `pickTrack` |
| `src/components/MusicPanel.jsx` | reescrito — mini player em cápsula |
| `src/components/MusicTrackPicker.jsx` | novo modal central acessível |
| `src/components/Kanban/Popover.jsx` | fechar por Esc |
| `src/styles/global.css` | mini player; modal de faixa; popover de volume |
| `src/styles/mobile/timer.css` | dimensões touch e lista de faixa em uma coluna |

## Fora de escopo

- Música persistir tocando ao navegar pra fora da seção Foco (hoje para; não muda agora
  — é decisão de produto separada, não pedida nesta rodada).
- Focus trap / `inert` no popover de volume (continua sendo menu leve, não modal).
- Migração do localStorage antigo (`fluxtime.music.enabled`) — chave antiga fica órfã e
  sem uso; app de uso pessoal, sem necessidade de migração.
- Biblioteca maior de faixas / upload — assunto da conversa sobre hospedagem, não desta.

## Validação

`npm run build` limpo. Validação visual feita em desktop (1280×720) e mobile
(390×844), com o fluxo de autenticação restaurado ao final:

1. Mini player aparece como cápsula centralizada, visível no desktop **e** mobile, sem
   overflow horizontal e com alvos de toque de 44–52px.
2. Clicar na área da faixa abre o modal com as 6 opções; selecionar troca o título,
   fecha o modal e devolve o foco ao gatilho. Escape também fecha.
3. Botão circular liga/desliga a música na hora, com o ciclo rodando ou parado.
4. Ícone de volume abre o mini popover; slider e mudo funcionam.
5. Abrir o modal de faixa fecha o volume e vice-versa.
6. Ciclo virando fase (foco→pausa) com música ligada: reinicia do zero, como hoje.
7. Duck nos últimos 7s ainda ocorre.

Os itens 3, 4, 6 e 7 dependem de audição manual no navegador autenticado; a estrutura,
os eventos e o build foram verificados nesta rodada.

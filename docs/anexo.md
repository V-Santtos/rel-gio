# Guia de PWA Mobile App-Like

Este anexo registra o conhecimento combinado para criar PWAs com experiencia de aplicativo mobile real, evitando interfaces que sejam apenas sites responsivos espremidos no celular.

## Ideia central

A palavra-chave principal e:

```text
PWA mobile-first com experiencia nativa/app-like, nao apenas site responsivo.
```

Quando pedir para uma LLM criar uma interface mobile, nao basta dizer "faca um PWA" ou "faca responsivo". Isso pode ser interpretado como uma pagina web que cabe no celular.

O pedido precisa deixar claro que a experiencia deve parecer um aplicativo instalado, com padroes reais de UX mobile, interacoes de toque, estados visuais e fluxo pensado para celular.

## Diferenca entre site mobile e app mobile

### Site mobile generico

- Botoes posicionados sem criterio de uso com uma mao.
- Cards grandes ou soltos demais.
- Layout com cara de landing page ou dashboard adaptado.
- Pouca hierarquia visual.
- Feedback fraco depois de acoes.
- Interacoes baseadas em clique/hover, nao em toque.
- Tela pensada primeiro para desktop e depois comprimida.

### PWA mobile app-like

- Interface mobile-first desde o inicio.
- App bar compacta.
- Navegacao inferior quando fizer sentido.
- CTAs dentro da zona do polegar.
- Bottom sheets para acoes, filtros, confirmacoes e detalhes contextuais.
- Snackbars/toasts para feedback rapido.
- Estados de loading, empty, error, success, concluido e cadastrado.
- Tap targets confortaveis, idealmente com no minimo 44px.
- Inputs otimizados para teclado mobile.
- Safe area para notch e home indicator.
- Comportamento pensado para modo standalone.
- Layout testado em viewports reais de celular.

## Prompt-base recomendado

Use este prompt quando quiser orientar uma LLM ou o Codex a construir uma experiencia mobile correta:

```text
Construa isso como um PWA mobile-first com experiencia nativa/app-like, nao como uma pagina web responsiva.

Pense como designer de produto mobile antes de codar: defina o fluxo principal, os estados da tela, os feedbacks de acao e os componentes de interacao mobile.

Use viewport principal 390x844, simulando um iPhone moderno, e teste tambem 360x800, 375x812 e 430x932.

A interface deve usar padroes reais de app mobile: app bar compacta, navegacao inferior quando fizer sentido, botoes na zona do polegar, bottom sheets para acoes/contextos, snackbars/toasts para feedback, estados de loading/empty/error/success, tap targets de no minimo 44px, safe-area para notch/home indicator, microinteracoes de toque e layout sem depender de hover.

Neste momento, quero pre-validacao mobile em mockup/visualizador. Nao preciso validar o PWA instalado agora; quero primeiro acertar a experiencia visual e interativa no viewport mobile.
```

## Palavra-chave curta

Quando quiser resumir a direcao, use:

```text
Mobile-first app-like PWA com padroes nativos de UX mobile.
```

Outra frase importante:

```text
Pre-validacao mobile em viewport fixa 390x844.
```

Essa frase indica que o trabalho inicial deve ser feito pensando em um canvas de celular, nao em desktop.

## Fluxo recomendado de criacao

### 1. Criar primeiro para mobile

A base deve nascer em mobile, usando um viewport principal:

```text
390x844
```

Esse tamanho representa bem iPhones modernos e funciona como um bom canvas principal de design.

Tambem testar:

```text
360x800  - Android menor
375x812  - iPhone X / 11 Pro
430x932  - iPhone grande
```

### 2. Usar mockup ou visualizador do VS Code como mesa de montagem

O mockup/visualizador serve para o ciclo rapido:

```text
alterar -> salvar -> olhar no preview mobile -> ajustar
```

Ele e ideal para acertar:

- Hierarquia visual.
- Tamanho dos botoes.
- Espacamento.
- App bar.
- Bottom navigation.
- Cards.
- Bottom sheets.
- Estados de sucesso, erro, vazio e carregando.
- Sensacao geral de aplicativo.
- Altura da tela e scroll.

### 3. Nao tratar mockup como validacao final

O mockup e uma pre-validacao visual/interativa, nao uma prova final de fidelidade tecnica.

Ele pode nao representar perfeitamente:

- Teclado real do celular.
- Modo standalone do PWA.
- Safe area real.
- Barra inferior do sistema.
- Comportamento real de scroll.
- Instalacao na tela inicial.
- Sensacao de toque em dispositivo fisico.

### 4. Validar PWA instalado apenas no fim

A validacao em celular real/PWA instalado entra depois que a base ja estiver boa.

Essa etapa final confirma:

- Modo standalone.
- Safe area.
- Teclado real.
- Scroll real.
- Barra inferior.
- Icone.
- Splash screen.
- Sensacao instalada.

## Regra de validacao

Regra principal:

```text
Durante a criacao, validar em mockup/visualizador iPhone com viewport fixa. Para aprovacao final, validar em PWA instalado no celular real.
```

Outra forma:

```text
Mockup serve para pre-validacao e apresentacao. Celular real/PWA instalado serve para validacao final.
```

## Checklist de UX mobile

Antes de considerar uma tela mobile boa, verificar:

- A tela parece um app instalado, nao uma pagina web adaptada?
- O fluxo principal esta claro sem explicacoes longas?
- Os botoes principais estao ao alcance do polegar?
- Tap targets tem tamanho confortavel?
- Existe feedback visual apos cada acao importante?
- Existem estados de loading, empty, error e success?
- Formularios usam inputs adequados para mobile?
- A navegacao inferior ou app bar faz sentido para o fluxo?
- Bottom sheets sao usados para acoes contextuais quando apropriado?
- O layout funciona em 360x800, 375x812, 390x844 e 430x932?
- Nada importante fica colado na area do notch ou home indicator?
- A tela nao depende de hover?
- Textos e botoes nao quebram de forma feia?
- Cards e secoes nao parecem dashboard desktop comprimido?
- O usuario consegue entender o proximo passo sem esforco?

## Checklist tecnico

Verificar no projeto:

- Meta viewport com `viewport-fit=cover`.
- Uso de `env(safe-area-inset-*)` em areas fixas.
- Bottom navigation com padding inferior seguro.
- Elementos fixos sem cobrir conteudo.
- Scroll vertical natural.
- Sem overflow horizontal.
- Layout mobile-first antes dos breakpoints de tablet/desktop.
- Estados visuais implementados, nao apenas tela estatica.
- Componentes interativos funcionando por toque.

Exemplo de meta viewport:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Exemplo de safe area para navegacao inferior:

```css
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

## Instrucao curta para o Codex

Use esta versao quando quiser pedir direto:

```text
Cha, implemente usando fluxo de pre-validacao mobile. Use viewport principal 390x844, simulando iPhone moderno no VS Code/mockup. Ajuste a interface para parecer app mobile real: app bar compacta, bottom nav quando fizer sentido, CTAs acessiveis, cards compactos, bottom sheets, snackbars/toasts, feedbacks de acao, estados visuais e safe-area. Neste momento nao valide PWA instalado; quero primeiro acertar a experiencia visual e interativa no mockup.
```

## Instrucao para evitar resultado generico

Adicionar sempre que a interface estiver ficando com cara de web generica:

```text
Nao quero uma landing page responsiva nem um dashboard comprimido. Quero uma experiencia mobile app-like, com fluxo de aplicativo, componentes de toque, estados de produto e interacoes esperadas em PWA instalado.
```

## Ordem ideal de trabalho

1. Definir o fluxo principal da tela.
2. Definir estados: normal, carregando, vazio, erro, sucesso/concluido.
3. Montar layout em 390x844.
4. Ajustar app bar, area de conteudo e acao principal.
5. Adicionar bottom navigation ou acoes inferiores se fizer sentido.
6. Adicionar bottom sheets, toasts/snackbars e feedbacks.
7. Testar em 360x800, 375x812 e 430x932.
8. Corrigir overflow, cortes, textos apertados e areas inseguras.
9. Usar mockup apenas para pre-validacao/apresentacao.
10. Validar PWA instalado no celular real somente na etapa final.


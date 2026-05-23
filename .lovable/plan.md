## Problemas atuais do modo Performance

1. **Visual quase igual ao modo normal** — só aparece um PlayerHud + QuestsBar discretos no topo, sem mudar a "atmosfera" do painel.
2. **Lista de associados encolheu** — o HUD + Quests empurram conteúdo para baixo e o `CaptureLeadList` perde espaço vertical.
3. **Feed "Conversa ao Vivo" também encolhe** pelo mesmo motivo (área central perde ~80px).
4. Falta sensação de "modo ligado" — nenhum brilho dourado real, nenhuma diferença forte de borda/fundo, animações sutis demais.

## O que vou fazer

### 1. Identidade visual forte quando `gameOn = true`
- Borda externa do painel em **gradiente dourado animado** (verde→âmbar→verde) ao invés do `border-primary/30` atual.
- Fundo do painel com **vinheta dourada sutil** (radial top-center, opacity baixa) + grade fina diagonal só no modo Performance.
- Header com **brasão de rank** (medalha animada do PlayerHud) integrado à esquerda, título "PAINEL DE CAPTAÇÃO" em uppercase com tracking maior + subtítulo dourado "MODO PERFORMANCE · NÍVEL X · RANK".
- Linha decorativa horizontal do GameShell mais intensa (de `0.3` para `0.6` opacity, com pulse sutil).

### 2. HUD compacto e horizontal (não rouba altura)
- Fundir **PlayerHud + QuestsBar em uma única faixa horizontal** de ~44px de altura (hoje ocupa ~96px somados).
- Layout: `[Medalha+Nv] [Rank · barra XP] [3 metas inline com mini-progress] [Hoje · Sequência]`.
- Em telas <md, vira accordion colapsável ("Performance ▾") que abre por cima sem empurrar.
- Resultado: lista de leads e feed central recuperam ~50px de altura útil → ficam **maiores que no modo normal**, não menores.

### 3. Lista de leads valorizada (associados)
- No modo Performance, cada item da lista ganha:
  - Pequeno **medalhão** ao lado do nome (cor por progresso: bronze/prata/ouro/diamante baseado em `sentStepsCount`).
  - Nome em **font-weight maior** (semibold→bold) e size +1px.
  - Quando o lead está em "streak" (>3 passos enviados hoje), animação `exec-energy` sutil no card.
- Header da lista "Em Captação · 100" vira "ASSOCIADOS · 100" em dourado, com contador animado.

### 4. Feed "Conversa ao Vivo" destacado
- Bloco do feed ganha **borda dourada fina + selo "AO VIVO"** pulsante no topo direito (já tem badge, mas é discreto).
- Título "CONVERSA AO VIVO" em uppercase dourado, font-bold, tamanho maior (+2px) só no modo performance.
- Última mensagem com leve glow âmbar quando chega nova.

### 5. Microanimações executivas
- Toggle do Performance dispara **flash dourado** de 600ms cobrindo o painel (já existe `LevelUpOverlay`, vou reutilizar a animação).
- Botão GameModeToggle quando ativo: glow dourado pulsante constante (não só hover).
- XP ganho ao enviar passo: floater dourado mais visível subindo do botão clicado.

### 6. Tokens de design (sem cores hardcoded fora do tema)
- Adiciono no `index.css`: `--exec-gold`, `--exec-gold-glow`, `--exec-radial` e classes utilitárias `exec-border-gold`, `exec-radial-bg`, `exec-rank-pulse` — todas em HSL, dark+light.

## Arquivos a editar

- `src/components/captacao/CaptacaoPanel.tsx` — borda/fundo condicional, header reformulado, integração do HUD único.
- `src/components/captacao/game/GameShell.tsx` — vinheta + grade decorativa.
- `src/components/captacao/game/PlayerHud.tsx` + `QuestsBar.tsx` — fundir em **`ExecHudBar.tsx`** (novo) horizontal.
- `src/components/captacao/CaptureLeadList.tsx` — medalhão, peso de fonte e cabeçalho "ASSOCIADOS" no modo performance (recebe prop `gameOn`).
- `src/components/captacao/CaptureConversationFeed.tsx` — borda + selo "AO VIVO" + título destacado no modo performance (recebe prop `gameOn`).
- `src/components/captacao/game/GameModeToggle.tsx` — glow pulsante quando ativo.
- `src/index.css` — tokens `--exec-gold*` e classes utilitárias.

## O que NÃO vou mudar
- Lógica de XP, level, streak, quests, sons.
- A/B/C, fluxo de envio, ficha do lead, kanban.
- Modo normal (não-performance) continua exatamente como está.

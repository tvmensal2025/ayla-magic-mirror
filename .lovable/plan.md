# Captação dentro do chat (mobile-first)

Hoje a Captação vive numa aba separada (`/admin` → Captação) com 3 colunas (lista + passos + ficha). No celular fica apertado, e o consultor precisa pular entre WhatsApp e Captação. Vamos colidir os dois.

## O que muda

### 1. Botão único no header do chat

- Em `ChatView.tsx`, adicionar botão **🎮 Captação** ao lado de Cliente/CRM/Zerar.
- Estados:
  - **Desligada** (default): botão neutro "Captação".
  - **Ligada**: botão verde-pulsante mostrando `**{filled}/10**` (ex.: `🎮 4/10`).
- Clique:
  - Liga: faz `update customers set capture_mode='manual', capture_started_at=now()` e abre a tela de Captação.
  - Re-clique enquanto ligada: só reabre a tela (não desliga). Para desligar há um link "sair do modo captação" dentro da tela.

### 2. Tela Captação como fullscreen no mobile

- Componente novo `CaptureSheet.tsx` (usa `Sheet` shadcn com `side="bottom"`, `h-[100dvh]`).
- Header fixo:
  - Avatar + nome + telefone (mesmo do chat)
  - **Barra XP grande** (`CaptureProgressBar`) + contador `4/10`
  - Botão fechar (volta pro chat)
- Conteúdo em **2 abas mobile** (sem coluna lateral):
  - **Passos** (default): grid 2 colunas (ou lista vertical) com os 10 templates — ver §3
  - **Ficha**: lista vertical full-width dos 10 campos + sugestões da IA + uploads dos documentos
- Footer fixo:
  - Quando `filled < 10`: chip motivacional ("Faltam 6 dados 💪")
  - Quando `filled === 10`: botão gigante **CADASTRAR TUDO 🏆** (confete + envia ao portal)

### 3. Templates / Mensagem rápida — redesenho mobile

Hoje é uma grid 2×5 de cards densos com 4 ícones de mídia e 2 botões pequenos. Em 514px o toque é ruim. Proposta:

- **Lista vertical de "linhas-passo"**, cada linha grandona (~64px de altura):
  ```
  ┌──────────────────────────────────────────────┐
  │ ① Saudação                       ✓ enviado  │
  │ "Olá! Sou a Ayla…"  🎵🖼️         [Enviar →] │
  └──────────────────────────────────────────────┘
  ```
  - **Tap rápido** no card inteiro = envia (1-clique, modo híbrido — já implementado).
  - **Tap longo** (ou ícone ✏ pequeno no canto) = abre composer pré-preenchido pra editar antes.
  - Badge de mídia (🎵/🖼️/🎬) só aparece quando o passo tem aquele tipo configurado, sem ícone vazio.
  - Passo enviado fica esmaecido + ✓ verde, sobe pro topo do histórico de "enviados hoje".
- **Linha pinada no topo**: campo de busca/filtro `/` (digite pra achar template) + chip "Só não enviados".
- **Templates avulsos** (não vindos do fluxo, ex.: `message_templates` que o consultor tem): aba secundária dentro de "Passos" → "Meus rápidos".

### 4. Captação ocupa o chat inteiro (sem perder mensagens)

- A `Sheet` cobre tela toda, mas o **WhatsApp continua rodando atrás** — quando o lead responde, o card da ficha pulsa (sugestão IA aparece) e o chip de XP sobe automaticamente.
- Botão flutuante no canto sup. dir. da Sheet: **💬 ver chat** → minimiza pra 40% da altura (split horizontal: chat em cima, captação embaixo), pra ler/responder o que o lead mandou sem fechar.

### 5. Aba "Captação" do `/admin` continua existindo

- Vira **modo desktop** (3 colunas como hoje, bom pra atendentes em PC).
- No mobile, o link "Captação" do menu admin abre direto a lista de leads em captação e ao tocar num lead, leva pro chat já com a Sheet aberta.

### 6. Fullscreen do chat no mobile (independente da captação)

- `Admin.tsx` (ou wrapper do WhatsApp): quando viewport < 768px **e** uma conversa está aberta, esconder a top-nav de abas (`Dashboard / CRM / Captação / ...`) e o header verde do iGreen → chat usa `h-[100dvh]`.
- Botão "voltar" no header do chat retorna a top-nav.

## Arquivos

Novos:

- `src/components/captacao/CaptureSheet.tsx` (drawer mobile com 2 tabs + XP + ficha + CADASTRAR)
- `src/components/captacao/CaptureStepsList.tsx` (substitui o uso da grid no mobile — lista grandona)

Editados:

- `src/components/whatsapp/ChatView.tsx` → botão 🎮 Captação + abrir/ativar Sheet
- `src/components/captacao/CaptacaoPanel.tsx` → no mobile, redireciona pro chat do lead com Sheet aberta
- `src/pages/Admin.tsx` (ou layout) → esconder top-nav quando chat aberto em mobile
- `src/components/captacao/CaptureStepsGrid.tsx` → mantido pra desktop

Sem mudança de banco. Sem mudança em edge functions. Tudo é UI.

## Perguntas pra você

1. Quando ligar a Captação (botão 🎮), você quer que a Sheet abra **automaticamente** ou só fique com o contador no botão e abra só no segundo clique? Segundo clique
2. **Tap rápido = enviar direto** ou prefere sempre confirmar com um modalzinho ("Enviar passo Saudação?") pra evitar erro de toque? Sim
3. Quer manter a aba "Captação" no menu do `/admin` ou remover, já que tudo passa a viver dentro do chat? Remover 
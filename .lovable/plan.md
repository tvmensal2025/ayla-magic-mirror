# Captação no chat: 1 clique, painel-game completo e passos 1-10 visíveis

Hoje o botão **Captação** no header do chat depende de `capture_mode='manual'` no banco. O primeiro clique só liga o modo, e o painel só abre no segundo clique — e como a UI espera o realtime do `customers` voltar, o botão parece "sempre desligado". Além disso, a aba **Passos** do `CaptureSheet` busca em `bot_flow_steps` do `bot_flows` ativo do consultor: se o fluxo não está marcado `is_active`, a lista vem vazia e o consultor não vê os templates 1–10.

A proposta abaixo resolve os 3 pedidos: 1 clique abre o game, dados são capturados de verdade (campos reais do `customers`), e os passos do fluxo aparecem como templates clicáveis com preview antes de enviar.

## 1. Botão "Captação" → 1 clique abre o painel

Arquivo: `src/components/whatsapp/ChatView.tsx`

- `toggleCapture` passa a fazer 2 coisas de uma vez:
  1. `setCaptureOpen(true)` imediatamente.
  2. Se `captureOn` for `false`, dispara `update capture_mode='manual'` em paralelo (sem await bloqueando a abertura).
- Atualiza estado otimista local (`captureCustomer.capture_mode = 'manual'`) para o badge piscar/contar na hora, sem esperar o realtime.
- Texto do botão: sempre `Captação` + badge `filledCount/totalFields` quando há dados, para parar de parecer "desligado". Estado visual baseado em `captureOpen || captureOn`, não só no banco.

## 2. Painel `CaptureSheet` — mais "game" e mostra status real

Arquivo: `src/components/captacao/CaptureSheet.tsx`

- No `useEffect` de abertura: se `customer.capture_mode !== 'manual'`, força `update` para `'manual'` (garante consistência se entrou direto).
- Header já mostra XP (`progress`) + frase motivacional. Adicionar destaque do **próximo dado faltante** (ex.: "🎯 Próximo: CPF") logo abaixo da barra para guiar o consultor.
- Aba **Ficha** continua editável (CaptureLeadCard `embedded`) — os dados vão pro `customers` em tempo real, o que já é "captura real" (não simulação).

## 3. Aba "Passos" 1–10 — sempre carrega o fluxo do consultor

Arquivo: `src/components/captacao/CaptureStepsList.tsx`

- Query atual: `bot_flows where is_active=true`. Trocar para **fallback**:
  1. Tenta `is_active=true` mais recente.
  2. Se vazio, pega o `bot_flows` mais recente do consultor (independente de active).
  3. Se ainda vazio, mostra mensagem com link `/admin/fluxos`.
- Mantém `limit 10` na ordem de `position`.
- Cada item do `<ul>` mostra:
  - `#N` + título do passo (`title || step_key`).
  - **Preview** das 2 primeiras linhas de `message_text` (já existe, manter).
  - Badges de mídia (áudio/imagem/vídeo) a partir de `media_order` (já existe).
  - Botão `Enviar` à direita → abre `AlertDialog` com preview completo do template e botão `Enviar agora` (já existe, manter).
- Adicionar contador no header da aba: "Passo 4 de 10 enviado" baseado em `sentSteps.size` para sensação de progresso/jogo.

## 4. Diagnóstico do "sempre desligado"

Atualizar o cálculo do estado visual em `ChatView.tsx`:

```ts
const captureActive = captureOpen || captureCustomer?.capture_mode === 'manual';
```

Isso elimina a janela entre o clique e o retorno do realtime que faz o botão parecer não responder.

## Fora de escopo

- Não mexer no `manual-step-send` (já envia áudio→imagem→vídeo→texto sequencial).
- Não mexer em RLS, edge functions ou IA `capture-extract`.
- Não criar novos templates: vamos só **expor** os `bot_flow_steps` que já existem em `/admin/fluxos`.

## Validação

1. Abrir um chat com cliente cadastrado → clicar **Captação** uma vez → painel abre em fullscreen mobile + modo manual ativa no banco.
2. Aba **Passos** mostra de 1 a 10 com preview do texto e ícones de mídia.
3. Tocar em um passo → modal de confirmação → `Enviar agora` dispara `manual-step-send` e marca como enviado.
4. Aba **Ficha** edita campos reais; XP sobe (1/10 → 10/10) e CTA "CADASTRAR TUDO" libera.
5. Botão no header pisca "X/10" enquanto há captação ativa, mesmo recarregando a página.


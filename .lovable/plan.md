# Simulador de Fluxo "100% Real"

Substituir o simulador atual (mock client-side) por um que executa o **mesmo motor** do `whapi-webhook` em modo dry-run e renderiza tudo no painel: áudio tocável, vídeo tocável, imagem visível, e IA respondendo de verdade. Botão "Zerar" reseta a conversa.

## O que muda

### 1. Nova edge function `flow-simulate` (dry-run)
Reaproveita os helpers do `whapi-webhook/handlers/bot-flow.ts`:
- Resolve `bot_flow_steps` (texto, slot, transitions, captures, fallback, AI).
- Resolve `ai_media_library` por `(consultant_id, slot_key)` para áudio/imagem/vídeo reais (URLs do MinIO).
- Quando o passo dispara IA livre (FAQ, dúvida), chama `ai-faq-answerer` / `ai-gateway` de verdade — IA responde com o mesmo prompt e custo real.
- **Nunca** chama Whapi/Evolution. Em vez de mandar, devolve um array de eventos:
  ```json
  [
    { "kind": "text",  "body": "..." },
    { "kind": "audio", "url": "https://...mp3", "duration": 7 },
    { "kind": "image", "url": "https://...jpg", "caption": "..." },
    { "kind": "video", "url": "https://...mp4" },
    { "kind": "ai_thinking" },
    { "kind": "ai_reply", "body": "..." },
    { "kind": "transition", "to_step": "como_funciona", "via": "botão sim" },
    { "kind": "capture", "field": "valor_conta", "value": "450" }
  ]
  ```
- Estado da sessão fica em memória (sem persistir): cada chamada recebe `session_id`, `consultant_id`, `flow_id`, `variant`, `current_step_id`, `lead_input` (texto ou botão) e devolve eventos + novo `current_step_id`.

### 2. Reescrita do `FlowSimulator.tsx`
- Chat-style igual WhatsApp (já é o look). Envia mensagem → loading → renderiza eventos na ordem com delays naturais (humanPace 2,2s + 55ms/char) como no real.
- **Áudio**: `<audio controls>` apontando direto para o MinIO.
- **Imagem**: `<img>` com lightbox onClick.
- **Vídeo**: `<video controls playsInline>`.
- **IA "digitando…"**: bubble animada antes da resposta IA aparecer.
- Botões inline aparecem como no WhatsApp Business.
- Inputs do lead: texto livre + presets + botão "📷 Enviar foto fake" (envia URL de conta-luz exemplo p/ testar OCR).
- **Botão "Zerar"** descarta a sessão e começa de novo no primeiro passo do flow ativo.

### 3. Variante / Consultor / Lead fake
- Dropdown no topo do modal: **Variante** (A/B/C/D — já existe round-robin) — assim você testa cada uma.
- Lead fake configurável (nome, valor_conta) — já tem defaults.
- Toggle **"IA real (consome créditos)"** — default ligado; se desligar, IA volta a ser mock.

### 4. Limitações honestas (que vão estar visíveis no modal)
- Não envia pelo WhatsApp (nem para você nem para ninguém) — toca a mídia no navegador.
- Não dispara cron de reaquecimento/follow-up (são jobs de tempo, não fazem sentido em teste interativo).
- OCR de conta usa imagem fake que você anexar (ou um preset).

## Detalhes técnicos

- Edge function nova: `supabase/functions/flow-simulate/index.ts` (verify_jwt=false; auth via Bearer do usuário pra checar role consultor/super_admin).
- Refatoração mínima em `whapi-webhook/handlers/bot-flow.ts`: extrair a parte "resolve passo → produz mensagens" para `_shared/flow-runner.ts` exportando `runStep({ consultantId, flowId, variant, stepId, leadInput, dryRun: true })`. O `whapi-webhook` passa a chamar essa função (sem mudança de comportamento, dryRun=false). O simulador passa `dryRun=true`.
- UI: arquivo `FlowSimulator.tsx` reescrito (modal já abre via "Testar fluxo"). Engine client-side antiga (`src/lib/flow-simulator/engine.ts`) é removida.

## Riscos

- Refator do `bot-flow.ts` é o ponto sensível — toda a regressão precisa de cobertura. Já existem `bot-flow_test.ts`; vou adicionar testes específicos para `runStep({ dryRun: true })`.
- IA livre real consome créditos do Gemini a cada teste. Toggle resolve.

## Cronograma

1 entrega — assim que aprovar, eu implemento tudo e te aviso.

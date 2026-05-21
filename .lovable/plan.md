# Por que o fluxo travou depois do passo 1

No log do Whapi:

1. Consultor clicou em enviar o passo `boas_vindas` (áudio) para o Lucas.
2. `manual-step-send` foi chamado com `continueFlow: false` (é o que todos os botões da UI passam hoje).
3. Resultado: o áudio foi enviado, mas `customers.conversation_step` continuou em `novo_lead`.
4. Cliente respondeu “OI” e depois “FERNANDO”.
5. Como `novo_lead` NÃO está na lista `ACTIVE_CAPTURE_STEPS` do `whapi-webhook`, o gate `global-off-silent` apenas salvou as mensagens em silêncio (`🛑 [global-off-silent] IA manual — inbound texto/áudio salvo sem resposta step="novo_lead"`).

Ou seja, o backend já tem o motor de “seguir fluxo” pronto (`buildContinuationPatch`), mas **nenhum botão da UI manda `continueFlow: true`** — só o cartão de confirmação de dados (SIM/Editar/Não). Por isso clicar em qualquer passo na lista equivale a “apenas este passo”, mesmo quando o usuário acha que está mandando “seguir”.

## O que muda

### 1. UI: dois botões claros em cada passo

Arquivos: `CaptureStepsList.tsx`, `CaptureStepsGrid.tsx`, `SendSequenceDialog.tsx`.

- Botão primário: **“Seguir fluxo”** → chama `manual-step-send` com `continueFlow: true, part: "all"`.
- Botão secundário discreto: **“Só este passo”** → mantém `continueFlow: false`.
- Confirmação atual continua, só troca o rótulo do botão principal.
- Toast de sucesso mostra `next_step` retornado (“Lead posicionado em: ask_name”).

### 2. Backend: nada de mudança funcional pesada

`manual-step-send` já faz tudo que precisa quando `continueFlow=true`:
- Envia o passo escolhido.
- Encadeia até `MAX_CHAIN=6` passos `message` seguintes.
- Ao encontrar `capture_*`, mapeia para chave legada (`ask_name`, `aguardando_conta`, etc.), grava em `conversation_step` e envia o prompt.

Pequenos ajustes só pra fechar buracos:

- `mapCaptureStepToLegacy` hoje não cobre `capture_name`/`ask_name`. Adicionar: `case "capture_name": return "ask_name";` e garantir fallback quando `step_key` já é `ask_name`/`aguardando_nome`.
- Quando o passo de origem **é** o boas-vindas e o próximo step custom é `ask_name`, garantir que `patch.conversation_step = "ask_name"` (não o UUID do step custom) — assim o `whapi-webhook` reconhece em `ACTIVE_CAPTURE_STEPS` quando a IA global está manual.

### 3. whapi-webhook: confirmar bypass

`ACTIVE_CAPTURE_STEPS` já contém `ask_name, ask_email, ask_cpf, ask_cep, ask_bill_value, aguardando_conta, aguardando_doc_auto, ask_finalizar, finalizando, portal_submitting, aguardando_otp, validando_otp`. Nenhuma mudança — só validar com Lucas: depois do clique em “Seguir fluxo”, o lead vai pra `ask_name`, a resposta `FERNANDO` cai no caminho `[manual-capture-active]`, a IA grava o nome e o pipeline nativo segue até o portal sozinho.

## Resultado esperado no caso do Lucas

1. Consultor clica **Seguir fluxo** no passo `boas_vindas`.
2. Áudio é enviado, `conversation_step` vira `ask_name` e o prompt “Qual é seu nome?” é disparado automaticamente.
3. Cliente responde “FERNANDO” → webhook reconhece passo ativo, grava nome, segue para `ask_email` → `ask_cpf` → `ask_cep` → `aguardando_conta` → OCR → confirmação → `aguardando_doc_auto` → `submit-lead` no portal → `aguardando_otp` → `validando_otp` → cadastro fechado.
4. Consultor só interfere se quiser editar dados (cartão SIM/Editar/Não continua funcionando igual).

## Arquivos tocados

- `src/components/captacao/CaptureStepsList.tsx`
- `src/components/captacao/CaptureStepsGrid.tsx`
- `src/components/captacao/SendSequenceDialog.tsx`
- `supabase/functions/manual-step-send/index.ts` (apenas `mapCaptureStepToLegacy` + normalização do `conversation_step` final)

Sem migração de banco. Sem mudança no `whapi-webhook`.

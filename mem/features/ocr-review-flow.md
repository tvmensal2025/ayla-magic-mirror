---
name: OCR Review Card sempre abre
description: Após OCR de conta/doc, sempre marca ocr_review_pending para card aparecer no painel; presença do consultor não influencia mais; cron de 5 min libera fallback; lógica pós-confirmação centralizada em postBillConfirm.ts
type: feature
---
Tanto whapi-webhook quanto evolution-webhook (handlers/bot-flow.ts) NÃO usam mais `is_consultant_online` no passo de OCR. Após extrair os dados:

- `updates.ocr_review_pending = "bill" | "doc"`
- `updates.ocr_review_started_at = now`
- `reply = ""` (bot fica em standby, não manda SIM/NÃO pro cliente)

O OcrReviewBanner + OcrReviewCard mostra os dados extraídos + foto e o consultor escolhe "Eu confirmo" ou "Pedir ao cliente".

Se o consultor não decidir em 5 min, `ocr-review-timeout` cron libera automaticamente o lead para o caminho "manda pro cliente confirmar".

## Pós-confirmação (helper compartilhado)

Quando o consultor clica "Eu confirmo" em `OcrReviewCard` OU `CaptureDataConfirmCard`, ambos chamam `dispatchPostBillConfirm({ customer, kind, continueFlowOnNextCapture: true })` em `src/lib/captacao/postBillConfirm.ts`. O helper:

1. Busca `bot_flows` ativo por `consultant_id + variant` (A/B/C).
2. Pega passos `message` entre o capture atual e o próximo capture (`capture_documento` / `capture_email` / `confirm_phone` / `finalizar_cadastro`) e despacha cada um via `manual-step-send` com gap de 1,8s.
3. **Fallback** (só para `kind="bill"` quando NÃO há nenhum passo intermediário no fluxo): envia simulação hardcoded seguindo `mem://copy/discount-rate-20` — "Economia: *até R$ {valor*0.20} todo mês* (até 20%)". Threshold `electricity_bill_value > 30`.
4. Despacha o próximo capture (`continueFlow=true` por padrão).

NÃO duplicar essa lógica em outros componentes — sempre importar o helper.

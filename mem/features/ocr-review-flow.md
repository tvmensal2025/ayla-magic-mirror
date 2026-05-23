---
name: OCR Review Card sempre abre
description: Após OCR de conta/doc, sempre marca ocr_review_pending para card aparecer no painel; presença do consultor não influencia mais; cron de 5 min libera fallback
type: feature
---
Tanto whapi-webhook quanto evolution-webhook (handlers/bot-flow.ts) NÃO usam mais `is_consultant_online` no passo de OCR. Após extrair os dados:

- `updates.ocr_review_pending = "bill" | "doc"`
- `updates.ocr_review_started_at = now`
- `reply = ""` (bot fica em standby, não manda SIM/NÃO pro cliente)

O OcrReviewBanner + OcrReviewCard mostra os dados extraídos + foto e o consultor escolhe "Eu confirmo" ou "Pedir ao cliente".

Se o consultor não decidir em 5 min, `ocr-review-timeout` cron libera automaticamente o lead para o caminho "manda pro cliente confirmar".

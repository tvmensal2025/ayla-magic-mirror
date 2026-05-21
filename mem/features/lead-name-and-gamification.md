---
name: Lead name capture + auto gamification
description: Bloqueio name_source=unknown no manual-step-send + botão "Pedir nome" + triggers que populam capture_field_events
type: feature
---
- `manual-step-send` retorna `name_not_captured_yet` (409) quando `customers.name_source='unknown'` e o passo escolhido não é "pedir nome". Bypass via `skipNameGuard:true`.
- `isNameAskingStep`: detecta via captures[].field='name' ou regex em message_text.
- Wrapper `src/lib/whatsapp/send.ts`: `sendStepWithFeedback` traduz `code` em toast PT-BR; `askLeadName` localiza o passo de nome no fluxo da variante e dispara com skipNameGuard.
- `CaptureSheet`: botão "Pedir nome do lead" no header quando `name_source==='unknown'`.
- Triggers `customers_gamify_on_insert/update` + `log_capture_event_if_new` populam `capture_field_events` automaticamente para `lead_entrou`, `name`, `electricity_bill_value`, `cadastro_finalizado` — não importa se a captura veio do bot, OCR ou consultor.
- Códigos de erro padronizados em manual-step-send: `lead_sem_whatsapp`, `customer_no_phone`, `phone_invalid_format`, `no_active_flow`, `step_not_found`, `name_not_captured_yet`, `nothing_to_send`, `whapi_token_missing`, `phone_not_on_whatsapp`, `instance_disconnected`, `whapi_send_failed`, `partial_send`.

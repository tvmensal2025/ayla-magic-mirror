---
name: Per-Lead Bot Toggle
description: Botão IA ON/OFF por lead no chat header + bypass do global-off quando reset é usado
type: feature
---

## Coluna e tabela

- `customers.bot_force_enabled boolean default false` — quando true, webhooks ignoram `ai_agent_config.enabled=false` (IA global off) só para este lead.
- `force_bot_phones (consultant_id, phone_digits)` — guarda a intenção entre `reset_lead_conversation` (que deleta o customer) e a próxima INSERT do mesmo telefone.
- Trigger `apply_force_bot_on_customer_insert` lê `force_bot_phones` no BEFORE INSERT, seta `bot_force_enabled=true` e remove a linha.

## Webhooks

- `whapi-webhook/index.ts` no gate `global-off-silent`: bypass quando `customer.bot_force_enabled===true`. Mesmo bypass aplicado ao `silentMode` de arquivos.
- `evolution-webhook/index.ts`: antes de retornar `global_ai_disabled_silent`, faz lookup por phone em `force_bot_phones` E `customers.bot_force_enabled=true`.

## UI (`src/components/whatsapp/ChatView.tsx`)

- Botão `IA ON / IA OFF` no header do chat (ao lado de Captação/Zerar).
- Liga: `bot_paused=false, assigned_human_id=null`; se `globalAiEnabled` falso, também seta `bot_force_enabled=true`.
- Desliga: `bot_paused=true` (não toca em force).
- Estado `botActive = !bot_paused && (globalAiEnabled || bot_force_enabled)`.

## reset_lead_conversation

Antes de deletar o customer, faz `INSERT ON CONFLICT DO UPDATE` em `force_bot_phones` para o telefone, garantindo que o próximo customer criado pela próxima mensagem nasça com `bot_force_enabled=true`.

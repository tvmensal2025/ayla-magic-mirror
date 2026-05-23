---
name: Re-Welcome Rule
description: whapi-webhook reseta conversation_step + capture_mode + dispatch_log quando lead volta após ≥4h (saudação) ou ≥24h, evitando travamento mudo e bloqueio de mídia repetida
type: feature
---
Em `whapi-webhook/index.ts` (~linha 510), quando `hoursSinceBot ≥ 4` (com saudação/msg curta) OU `≥ 24h`, o handler reseta o customer:
- `conversation_step = null`
- `capture_mode = 'auto'`
- `custom_step_retries = 0`
- `last_custom_prompt_at = null`
- `ai_followups_count = 0`
- Guarda `previous_conversation_step`
- **DELETE em `ai_slot_dispatch_log` para esse customer_id** — libera reenvio de áudio/vídeo ignorando `ai_agent_slots.min_interval_minutes` (evita caso onde lead volta no mesmo slot e recebe só texto sem mídia).

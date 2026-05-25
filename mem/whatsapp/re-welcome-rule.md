---
name: Re-Welcome Rule
description: whapi-webhook só reseta conversation_step se NÃO estiver em flow custom E sem transições nos últimos 30 min; relaxada constraint message_type para logar áudio/vídeo/botão
type: feature
---
Em `whapi-webhook/index.ts` (~L588), o re-welcome dispara apenas quando:
- mensagem é texto plano (não botão, não mídia);
- `hoursSinceBot ≥ 4` com saudação/curta OU `≥ 24h`;
- **conversation_step NÃO** começa com `flow:`, `passo_` ou é UUID puro;
- **zero transições em `bot_step_transitions` nos últimos 30 min** (lead engajado nunca é resetado).

Ao resetar: zera `conversation_step`, `custom_step_retries`, `last_custom_prompt_at`, `ai_followups_count`; guarda `previous_conversation_step`; deleta `ai_slot_dispatch_log` para liberar áudio/vídeo; só reseta `capture_mode` para `auto` se já estava em `auto`.

`conversations.message_type` aceita `text|image|audio|video|document|sticker|location|contact|buttons|button|list|interactive|template|reaction|*_failed|system` — antes só `text/image`, o que silenciava logs de mídia e fazia `hoursSinceBot` ficar infinito (causando loop de re-welcome).

---
name: Human Takeover Silence
description: Quando humano assume (bot_paused OU assigned_human_id), IA fica 100% muda em webhook, crons e ai-sales-agent
type: feature
---

# Regra

Quando QUALQUER um destes for verdade, a IA não dispara nada:
- `customers.bot_paused = true`
- `customers.assigned_human_id IS NOT NULL`
- `customers.bot_paused_until > now()`

Helper único: `supabase/functions/_shared/bot/paused.ts` → `isCustomerPausedByHuman(customer)`.

## Pontos de enforcement

- `whapi-webhook/index.ts` — early-return logo após carregar o customer.
- `ai-sales-agent/index.ts` — early-return no `Deno.serve` antes de qualquer chamada Gemini.
- `whapi-webhook/handlers/bot-flow.ts` — auto-resume de `lead_nao_pronto`/`lead_quer_pensar` só dispara se `assigned_human_id` for NULL.
- Crons (`bot-followup-checker`, `bot-stuck-recovery`, `ai-followup-cron`, `send-scheduled-messages`) — filtram `bot_paused=false` AND `assigned_human_id IS NULL`.

## Auto-takeover (frontend → DB)

Helper único: `src/lib/whatsapp/auto-takeover.ts` (`autoTakeoverByPhone` / `autoTakeoverByCustomerId`). Setam `bot_paused=true`, `assigned_human_id=userId`, `bot_paused_reason="humano_assumiu*"`. Fallback para edge `customer-takeover` se RLS bloquear.

Chamado em:
- `useMessages.sendMessage` (texto)
- `ChatView.onSendAudio/onSendAudioUrl` (áudio)
- `ChatView.onSendMedia` (imagem/vídeo/documento)
- `whapi-webhook` quando detecta `outboundHuman` (consultor digitou pelo WhatsApp app/web) — usa coluna correta `phone_whatsapp` (NÃO `phone_digits`, que não existe).

## Panic stop

`/admin` → aba IA → painel "🛑 Parar IA de todos os meus leads": pausa em massa por `consultant_id` com reason=`manual_global_pause`. Botão "Religar IA" reverte só os que tinham essa reason específica (não toca em pauses individuais).

Backfill rodado em 2026-05-19: leads com `assigned_human_id` setado mas `bot_paused=false` foram corrigidos.

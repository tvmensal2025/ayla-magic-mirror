-- Saneamento: leads com humano vinculado mas bot_paused=false → pausar imediatamente.
-- Garante a regra "quando humano assume, IA fica muda".
UPDATE public.customers
SET
  bot_paused = true,
  bot_paused_reason = COALESCE(bot_paused_reason, 'humano_assumiu_backfill'),
  bot_paused_at = COALESCE(bot_paused_at, now()),
  updated_at = now()
WHERE assigned_human_id IS NOT NULL
  AND bot_paused = false;
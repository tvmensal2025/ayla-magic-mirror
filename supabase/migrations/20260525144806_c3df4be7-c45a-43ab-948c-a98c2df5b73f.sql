UPDATE public.customers
SET bot_paused = false,
    bot_paused_reason = NULL,
    bot_paused_until = NULL,
    bot_paused_at = NULL,
    updated_at = now()
WHERE bot_paused = true
  AND assigned_human_id IS NULL
  AND bot_paused_reason ILIKE 'lead_travado_recovery%';
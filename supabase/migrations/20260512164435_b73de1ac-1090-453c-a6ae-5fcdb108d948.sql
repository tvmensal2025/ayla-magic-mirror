UPDATE public.customers
SET bot_paused = true,
    bot_paused_at = COALESCE(bot_paused_at, now()),
    bot_paused_reason = COALESCE(bot_paused_reason, 'manual_global_pause'),
    assigned_human_id = COALESCE(assigned_human_id, consultant_id)
WHERE bot_paused IS DISTINCT FROM true;
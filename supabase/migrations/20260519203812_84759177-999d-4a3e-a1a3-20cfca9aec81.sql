UPDATE public.customers
SET bot_paused = true,
    bot_paused_reason = COALESCE(bot_paused_reason, 'manual_global_pause'),
    bot_paused_at = COALESCE(bot_paused_at, now()),
    assigned_human_id = COALESCE(assigned_human_id, consultant_id),
    updated_at = now()
WHERE consultant_id IN (
  SELECT consultant_id FROM public.ai_agent_config
  WHERE consultant_id IS NOT NULL AND enabled = false
)
AND (bot_paused IS DISTINCT FROM true OR assigned_human_id IS NULL);
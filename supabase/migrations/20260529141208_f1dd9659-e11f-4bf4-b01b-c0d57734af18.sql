
UPDATE public.customers
   SET assigned_human_id = COALESCE(assigned_human_id, consultant_id),
       bot_paused = true,
       bot_paused_reason = COALESCE(NULLIF(bot_paused_reason,''), 'humano_assumiu_backfill'),
       bot_paused_at = COALESCE(bot_paused_at, now()),
       updated_at = now()
 WHERE customer_origin IS DISTINCT FROM 'igreen_sync'
   AND consultant_id IS NOT NULL
   AND bot_paused IS NOT TRUE;


UPDATE public.customers
   SET bot_paused = true,
       bot_paused_reason = COALESCE(NULLIF(bot_paused_reason,''), 'orphan_no_consultant'),
       bot_paused_at = COALESCE(bot_paused_at, now()),
       updated_at = now()
 WHERE customer_origin IS DISTINCT FROM 'igreen_sync'
   AND consultant_id IS NULL
   AND bot_paused IS NOT TRUE;

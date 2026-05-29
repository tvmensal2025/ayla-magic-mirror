
UPDATE public.customers
   SET assigned_human_id = COALESCE(assigned_human_id, consultant_id),
       bot_paused = true,
       bot_paused_reason = COALESCE(bot_paused_reason, 'humano_assumiu_backfill'),
       bot_paused_at = COALESCE(bot_paused_at, now()),
       updated_at = now()
 WHERE (customer_origin IS NULL OR customer_origin <> 'igreen_sync')
   AND consultant_id IS NOT NULL
   AND (assigned_human_id IS NULL OR bot_paused IS NOT TRUE);

UPDATE public.app_settings
   SET bot_global_enabled = true,
       updated_at = now()
 WHERE id = 'global'
   AND bot_global_enabled IS DISTINCT FROM true;

UPDATE public.consultants
   SET notification_phone = phone
 WHERE notification_phone IS NULL
   AND phone IS NOT NULL
   AND length(regexp_replace(phone, '\D', '', 'g')) >= 10;

UPDATE public.bot_handoff_alerts
   SET resolved_at = now(),
       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
         'auto_resolved', true,
         'auto_resolved_reason', 'lead_in_human_handoff_backfill_2026_05_29',
         'auto_resolved_at', now()
       )
 WHERE resolved_at IS NULL
   AND reason IN ('flow_d_stuck','flow_d_ocr_failed_doc','flow_d_ocr_failed_bill');

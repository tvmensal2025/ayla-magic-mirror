UPDATE public.consultants c
SET conversational_flow_enabled = true
WHERE EXISTS (
  SELECT 1 FROM public.bot_flows bf
  WHERE bf.consultant_id = c.id AND bf.is_active = true
)
AND COALESCE(c.conversational_flow_enabled, false) = false;

UPDATE public.customers
SET conversation_step = null
WHERE conversation_step = 'welcome'
  AND COALESCE(bot_paused, false) = false
  AND consultant_id IN (
    SELECT consultant_id FROM public.bot_flows WHERE is_active = true
  );
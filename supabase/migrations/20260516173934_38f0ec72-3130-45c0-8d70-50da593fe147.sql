UPDATE public.bot_flow_steps s
SET position = 9 - s.position
FROM public.bot_flows f
WHERE f.id = s.flow_id
  AND f.consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
  AND f.is_active = true
  AND s.position BETWEEN 1 AND 8;
WITH ranked AS (
  SELECT s.id, ROW_NUMBER() OVER (ORDER BY s.position) AS new_pos
  FROM public.bot_flow_steps s
  JOIN public.bot_flows f ON f.id = s.flow_id
  WHERE f.consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
    AND f.is_active = true
)
UPDATE public.bot_flow_steps s
SET position = -ranked.new_pos
FROM ranked
WHERE s.id = ranked.id;

WITH ranked AS (
  SELECT s.id, ROW_NUMBER() OVER (ORDER BY s.position) AS new_pos
  FROM public.bot_flow_steps s
  JOIN public.bot_flows f ON f.id = s.flow_id
  WHERE f.consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
    AND f.is_active = true
)
UPDATE public.bot_flow_steps s
SET position = ranked.new_pos
FROM ranked
WHERE s.id = ranked.id;
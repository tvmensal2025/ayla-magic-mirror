UPDATE public.bot_flow_steps s
   SET media_order = '["text","audio","video","image"]'::jsonb
  FROM public.bot_flows f
 WHERE s.flow_id = f.id
   AND f.consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
   AND f.is_active = true;
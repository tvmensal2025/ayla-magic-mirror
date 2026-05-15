CREATE OR REPLACE FUNCTION public.lint_bot_flow_consistency(_consultant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(category text, severity text, detail text, consultant_id uuid, customer_id uuid, step text, occurrences bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'unprefixed_flow_id'::text, 'high'::text,
         'UUID ou passo_<ts> sem prefixo flow: — risco de colisão',
         c.consultant_id, c.id, c.conversation_step, 1::bigint
    FROM public.customers c
   WHERE c.conversation_step IS NOT NULL
     AND c.conversation_step NOT LIKE 'flow:%'
     AND (
       c.conversation_step ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR c.conversation_step LIKE 'passo_%'
     )
     AND (_consultant_id IS NULL OR c.consultant_id = _consultant_id)
  UNION ALL
  SELECT 'orphan_flow_step'::text, 'high'::text,
         'flow:<id> não existe em bot_flow_steps',
         c.consultant_id, c.id, c.conversation_step, 1::bigint
    FROM public.customers c
   WHERE c.conversation_step LIKE 'flow:%'
     AND NOT EXISTS (
       SELECT 1 FROM public.bot_flow_steps s
        WHERE s.id::text = substring(c.conversation_step from 6)
     )
     AND (_consultant_id IS NULL OR c.consultant_id = _consultant_id)
  UNION ALL
  SELECT 'possible_loop'::text, 'medium'::text,
         'mais de 5 mensagens no mesmo step em 24h',
         c.consultant_id, c.id, c.conversation_step,
         (SELECT count(*) FROM public.conversations cv
           WHERE cv.customer_id = c.id
             AND cv.conversation_step = c.conversation_step
             AND cv.created_at > now() - interval '24 hours')
    FROM public.customers c
   WHERE c.conversation_step IS NOT NULL
     AND (_consultant_id IS NULL OR c.consultant_id = _consultant_id)
     AND (
       SELECT count(*) FROM public.conversations cv
        WHERE cv.customer_id = c.id
          AND cv.conversation_step = c.conversation_step
          AND cv.created_at > now() - interval '24 hours'
     ) > 5;
$function$;
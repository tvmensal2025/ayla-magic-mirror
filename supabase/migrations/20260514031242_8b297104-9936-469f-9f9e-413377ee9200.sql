UPDATE public.ai_media_library
SET step_tags = ARRAY['abertura','descoberta','pitch','objecao','any']::text[],
    intent_tags = ARRAY['any','informacao','objecao_confianca','objecao_custo','duvida']::text[],
    priority = 100,
    updated_at = now()
WHERE id = '6f22c84f-8d13-4769-83c6-c7c534fb03ab';
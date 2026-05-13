UPDATE public.ai_agent_config
SET handoff_rules = COALESCE(handoff_rules, '{}'::jsonb) || jsonb_build_object('use_sales_ai', true),
    enabled = true,
    updated_at = now()
WHERE consultant_id IS NULL;
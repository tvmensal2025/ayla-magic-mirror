
-- 1) DROP dead rules tables (Sprint 2.5 removed the engine; 0 rows on prod)
DROP TABLE IF EXISTS public.bot_flow_rule_fires CASCADE;
DROP TABLE IF EXISTS public.bot_flow_rules CASCADE;

-- 2) Auto-feedback: handoff insert → mark last ai_decisions as 'down'
CREATE OR REPLACE FUNCTION public.auto_feedback_on_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_decision_id uuid;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_decision_id
    FROM public.ai_decisions
   WHERE customer_id = NEW.customer_id
     AND (feedback IS NULL OR NOT (feedback ? 'rating'))
     AND created_at > now() - interval '6 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_decision_id IS NOT NULL THEN
    UPDATE public.ai_decisions
       SET feedback = jsonb_build_object(
             'rating', 'down',
             'source', 'auto_handoff',
             'reason', COALESCE(NEW.reason, 'handoff_triggered'),
             'handoff_id', NEW.id,
             'at', now()
           )
     WHERE id = v_decision_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_feedback_on_handoff ON public.bot_handoff_alerts;
CREATE TRIGGER trg_auto_feedback_on_handoff
AFTER INSERT ON public.bot_handoff_alerts
FOR EACH ROW
EXECUTE FUNCTION public.auto_feedback_on_handoff();

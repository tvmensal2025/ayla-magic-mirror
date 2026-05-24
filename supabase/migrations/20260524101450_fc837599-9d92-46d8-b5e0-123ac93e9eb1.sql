
-- 1. Backfill
INSERT INTO public.customer_flow_state (
  customer_id, current_step_id, status, entered_step_at,
  last_outbound_at
)
SELECT
  c.id,
  c.conversation_step,
  'delegated_legacy',
  COALESCE(c.updated_at, c.created_at, now()),
  c.last_bot_reply_at
FROM public.customers c
ON CONFLICT (customer_id) DO NOTHING;

-- 2. Trigger de criação on-demand
CREATE OR REPLACE FUNCTION public.create_customer_flow_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customer_flow_state (
    customer_id, current_step_id, status, entered_step_at, last_outbound_at
  )
  VALUES (
    NEW.id, NEW.conversation_step, 'delegated_legacy',
    COALESCE(NEW.created_at, now()), NEW.last_bot_reply_at
  )
  ON CONFLICT (customer_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_customer_flow_state ON public.customers;
CREATE TRIGGER trg_create_customer_flow_state
AFTER INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.create_customer_flow_state();

-- 3. Trigger de sync em UPDATE
CREATE OR REPLACE FUNCTION public.sync_customer_flow_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customer_flow_state
  SET
    current_step_id  = COALESCE(NEW.conversation_step, current_step_id),
    last_outbound_at = COALESCE(NEW.last_bot_reply_at, last_outbound_at),
    last_inbound_at  = COALESCE(NEW.last_bot_interaction_at, last_inbound_at),
    updated_at       = now()
  WHERE customer_id = NEW.id
    AND (
      NEW.conversation_step       IS DISTINCT FROM OLD.conversation_step OR
      NEW.last_bot_reply_at       IS DISTINCT FROM OLD.last_bot_reply_at OR
      NEW.last_bot_interaction_at IS DISTINCT FROM OLD.last_bot_interaction_at
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_flow_state ON public.customers;
CREATE TRIGGER trg_sync_customer_flow_state
AFTER UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_flow_state();

-- engine v3 state mirror
--
-- Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.4 (state shape)
-- + complement of migration `20260526013928_engine_v3_schema.sql` and
-- legacy trigger `sync_customer_flow_state` (which only mirrors
-- customers→customer_flow_state).
--
-- Problem fixed: when engine v3 writes to `customer_flow_state.current_step_id`,
-- nothing mirrors it back to `customers.conversation_step`. As a result:
--   - ChatView and admin panels keep showing the old step
--   - `stuck_leads_grouped_by_step` cron groups by stale value
--   - Reactivation templates target the wrong step
--   - Next webhook turn re-enters the engine with stale state if reading
--     `customers.conversation_step` (the legacy webhook still does for
--     compatibility queries)
--
-- Solution: AFTER UPDATE trigger on customer_flow_state that mirrors
-- current_step_id back to customers.conversation_step (UUID-as-text,
-- consistent with legacy convention) and forwards last_outbound_at +
-- last_inbound_at + status (delegated_legacy → translates to bot_paused).
--
-- Idempotent: trigger is replaced if exists; function uses CREATE OR REPLACE.
-- Non-destructive: only ADDs a trigger; doesn't touch existing data or
-- the legacy `sync_customer_flow_state` trigger.

CREATE OR REPLACE FUNCTION public.mirror_customer_flow_state_to_customers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  step_text text;
BEGIN
  -- Only act when something interesting changed.
  IF NEW.current_step_id IS NOT DISTINCT FROM OLD.current_step_id
     AND NEW.last_outbound_at IS NOT DISTINCT FROM OLD.last_outbound_at
     AND NEW.last_inbound_at IS NOT DISTINCT FROM OLD.last_inbound_at
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.pause_reason IS NOT DISTINCT FROM OLD.pause_reason
  THEN
    RETURN NEW;
  END IF;

  -- current_step_id is uuid in customer_flow_state; customers.conversation_step
  -- is text and is currently used in 3 formats (legacy literal, "flow:<uuid>",
  -- and bare "<uuid>"). The migrate-engine-v3 backfill already pushed leads to
  -- bare uuid for v3 customers. We mirror as bare uuid.
  step_text := NULLIF(NEW.current_step_id::text, '');

  UPDATE public.customers
  SET
    conversation_step      = COALESCE(step_text, conversation_step),
    last_bot_reply_at      = COALESCE(NEW.last_outbound_at, last_bot_reply_at),
    last_bot_interaction_at= COALESCE(NEW.last_inbound_at, last_bot_interaction_at),
    bot_paused             = CASE
                               WHEN NEW.status = 'paused' THEN true
                               WHEN NEW.status = 'in_flow' OR NEW.status = 'completed' THEN false
                               ELSE COALESCE(bot_paused, false)
                             END,
    bot_paused_reason      = CASE
                               WHEN NEW.status = 'paused' THEN COALESCE(NEW.pause_reason, bot_paused_reason)
                               WHEN NEW.status = 'in_flow' THEN NULL
                               ELSE bot_paused_reason
                             END,
    updated_at             = now()
  WHERE id = NEW.customer_id
    AND (
      step_text IS DISTINCT FROM customers.conversation_step OR
      NEW.last_outbound_at IS DISTINCT FROM customers.last_bot_reply_at OR
      NEW.last_inbound_at IS DISTINCT FROM customers.last_bot_interaction_at OR
      NEW.status IN ('paused','in_flow','completed')
    );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mirror_customer_flow_state ON public.customer_flow_state;
CREATE TRIGGER trg_mirror_customer_flow_state
  AFTER UPDATE ON public.customer_flow_state
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_customer_flow_state_to_customers();

COMMENT ON FUNCTION public.mirror_customer_flow_state_to_customers IS
  'Engine v3: mirrors customer_flow_state.current_step_id, status, and bot timestamps back to customers.* so legacy queries (ChatView, panels, crons, reactivation) see the v3 engine state. Pairs with sync_customer_flow_state which mirrors the other direction (legacy writes).';

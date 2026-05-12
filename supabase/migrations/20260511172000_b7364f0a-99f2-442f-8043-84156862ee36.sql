-- Trigger: emite evento Lead no Pixel ao criar customer
DROP TRIGGER IF EXISTS trg_fb_lead_on_customer_insert ON public.customers;
CREATE TRIGGER trg_fb_lead_on_customer_insert
  AFTER INSERT ON public.customers
  FOR EACH ROW
  WHEN (NEW.consultant_id IS NOT NULL)
  EXECUTE FUNCTION public.fb_trigger_lead();

-- Trigger: emite Purchase quando status vira active
DROP TRIGGER IF EXISTS trg_fb_purchase_on_customer_active ON public.customers;
CREATE TRIGGER trg_fb_purchase_on_customer_active
  AFTER UPDATE OF status ON public.customers
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND COALESCE(OLD.status, '') <> 'active')
  EXECUTE FUNCTION public.fb_trigger_purchase();

-- Função + trigger para CompleteRegistration (portal submetido)
CREATE OR REPLACE FUNCTION public.fb_trigger_complete_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.consultant_id IS NOT NULL
     AND NEW.portal_submitted_at IS NOT NULL
     AND OLD.portal_submitted_at IS NULL THEN
    PERFORM public.fb_emit_capi(
      NEW.consultant_id,
      'SubmitApplication',
      NEW.id,
      NEW.email,
      NEW.phone_whatsapp,
      COALESCE(NEW.electricity_bill_value, 100)::NUMERIC
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fb_complete_registration ON public.customers;
CREATE TRIGGER trg_fb_complete_registration
  AFTER UPDATE OF portal_submitted_at ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.fb_trigger_complete_registration();

-- Índice pra performance do Funil de Vendas
CREATE INDEX IF NOT EXISTS idx_customers_consultant_status_phase
  ON public.customers (consultant_id, status, sales_phase)
  WHERE status = 'pending';

-- Trigger: quando customer vira 'approved' ou 'active' e ainda não tem deal,
-- cria automaticamente um card no Kanban Pós-Venda em 'novo_lead'.
CREATE OR REPLACE FUNCTION public.create_postsale_deal_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_deal uuid;
BEGIN
  IF NEW.consultant_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status IN ('approved', 'active')
     AND COALESCE(OLD.status, '') NOT IN ('approved', 'active') THEN

    SELECT id INTO _existing_deal
      FROM public.crm_deals
     WHERE customer_id = NEW.id
     LIMIT 1;

    IF _existing_deal IS NULL THEN
      INSERT INTO public.crm_deals
        (consultant_id, customer_id, remote_jid, stage, deal_origin, notes)
      VALUES
        (NEW.consultant_id,
         NEW.id,
         CASE WHEN NEW.phone_whatsapp IS NOT NULL
              THEN regexp_replace(NEW.phone_whatsapp, '[^0-9]', '', 'g') || '@s.whatsapp.net'
              ELSE NULL END,
         CASE WHEN NEW.status = 'active' THEN 'aprovado' ELSE 'novo_lead' END,
         'funnel_auto',
         'Criado automaticamente após qualificação pelo bot');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_postsale_deal ON public.customers;
CREATE TRIGGER trg_create_postsale_deal
  AFTER UPDATE OF status ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.create_postsale_deal_on_approval();

-- Trigger: bloquear deals para clientes da carteira iGreen (não são leads)
CREATE OR REPLACE FUNCTION public.prevent_non_lead_deals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  origin text;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT customer_origin INTO origin FROM public.customers WHERE id = NEW.customer_id;
    IF origin = 'igreen_sync' THEN
      RAISE EXCEPTION 'Clientes sincronizados do portal iGreen não entram no funil de leads (customer_origin=igreen_sync)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_lead_deals ON public.crm_deals;
CREATE TRIGGER trg_prevent_non_lead_deals
BEFORE INSERT OR UPDATE OF customer_id ON public.crm_deals
FOR EACH ROW EXECUTE FUNCTION public.prevent_non_lead_deals();

-- Limpeza one-shot: remover quaisquer deals que escaparam para clientes igreen_sync
DELETE FROM public.crm_deals d
USING public.customers c
WHERE d.customer_id = c.id AND c.customer_origin = 'igreen_sync';
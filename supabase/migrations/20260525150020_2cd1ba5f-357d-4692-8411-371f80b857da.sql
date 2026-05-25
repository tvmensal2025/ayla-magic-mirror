-- 1) Trigger ampliada: bloqueia deal se customer_id OU remote_jid bater com cliente igreen_sync
CREATE OR REPLACE FUNCTION public.prevent_non_lead_deals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin text;
  v_phone  text;
  v_match  int;
BEGIN
  -- por customer_id
  IF NEW.customer_id IS NOT NULL THEN
    SELECT customer_origin INTO v_origin FROM public.customers WHERE id = NEW.customer_id;
    IF v_origin = 'igreen_sync' THEN
      RAISE EXCEPTION 'Clientes sincronizados do portal iGreen não entram no funil de leads (customer_id)';
    END IF;
  END IF;

  -- por remote_jid (telefone) — fecha brecha de deal órfão
  IF NEW.remote_jid IS NOT NULL THEN
    v_phone := regexp_replace(split_part(NEW.remote_jid, '@', 1), '\D', '', 'g');
    IF length(v_phone) >= 10 THEN
      SELECT count(*) INTO v_match
      FROM public.customers c
      WHERE c.consultant_id = NEW.consultant_id
        AND c.customer_origin = 'igreen_sync'
        AND regexp_replace(coalesce(c.phone_whatsapp,''), '\D', '', 'g') = v_phone;
      IF v_match > 0 THEN
        RAISE EXCEPTION 'Clientes sincronizados do portal iGreen não entram no funil de leads (telefone)';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_lead_deals ON public.crm_deals;
CREATE TRIGGER trg_prevent_non_lead_deals
BEFORE INSERT OR UPDATE OF customer_id, remote_jid ON public.crm_deals
FOR EACH ROW EXECUTE FUNCTION public.prevent_non_lead_deals();

-- 2) Limpeza: remover deals já existentes que pertencem a igreen_sync (por customer_id OU telefone)
DELETE FROM public.crm_deals d
USING public.customers c
WHERE d.customer_id = c.id AND c.customer_origin = 'igreen_sync';

DELETE FROM public.crm_deals d
USING public.customers c
WHERE d.customer_id IS NULL
  AND d.consultant_id = c.consultant_id
  AND c.customer_origin = 'igreen_sync'
  AND d.remote_jid IS NOT NULL
  AND regexp_replace(split_part(d.remote_jid, '@', 1), '\D', '', 'g')
      = regexp_replace(coalesce(c.phone_whatsapp,''), '\D', '', 'g');
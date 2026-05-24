
-- 1) Backfill: any customer whose flow_variant is not in consultant.active_variants
--    gets reassigned to the first available active variant for that consultant.
UPDATE public.customers c
SET flow_variant = (
  SELECT v FROM unnest(co.active_variants) AS v
  WHERE EXISTS (
    SELECT 1 FROM public.bot_flows bf
    WHERE bf.consultant_id = co.id AND bf.is_active = true AND bf.variant = v
  )
  ORDER BY v
  LIMIT 1
),
updated_at = now()
FROM public.consultants co
WHERE c.consultant_id = co.id
  AND c.flow_variant IS NOT NULL
  AND co.active_variants IS NOT NULL
  AND array_length(co.active_variants, 1) > 0
  AND NOT (c.flow_variant = ANY(co.active_variants));

-- 2) Trigger on consultants.active_variants change: re-align existing customers.
CREATE OR REPLACE FUNCTION public.sync_customers_flow_variant_on_consultant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target text;
BEGIN
  IF NEW.active_variants IS NULL OR array_length(NEW.active_variants, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.active_variants IS NOT DISTINCT FROM NEW.active_variants THEN
    RETURN NEW;
  END IF;

  SELECT v INTO _target
  FROM unnest(NEW.active_variants) AS v
  WHERE EXISTS (
    SELECT 1 FROM public.bot_flows bf
    WHERE bf.consultant_id = NEW.id AND bf.is_active = true AND bf.variant = v
  )
  ORDER BY v
  LIMIT 1;

  IF _target IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.customers
  SET flow_variant = _target, updated_at = now()
  WHERE consultant_id = NEW.id
    AND flow_variant IS NOT NULL
    AND NOT (flow_variant = ANY(NEW.active_variants));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customers_flow_variant ON public.consultants;
CREATE TRIGGER trg_sync_customers_flow_variant
  AFTER UPDATE OF active_variants ON public.consultants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customers_flow_variant_on_consultant_change();

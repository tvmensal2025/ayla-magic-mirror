-- Remove duplicate: keep the most recently updated record for each phone+consultant pair
DELETE FROM public.customers
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY phone_whatsapp, consultant_id 
      ORDER BY updated_at DESC
    ) as rn
    FROM public.customers
    WHERE consultant_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Now create the unique index
CREATE UNIQUE INDEX idx_customers_phone_consultant 
ON public.customers (phone_whatsapp, consultant_id) 
WHERE consultant_id IS NOT NULL;
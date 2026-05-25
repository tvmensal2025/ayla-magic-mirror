ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS document_uploaded boolean
  GENERATED ALWAYS AS (document_front_url IS NOT NULL) STORED;
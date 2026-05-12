ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_referred_by_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_referred_by_phone TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_referred_by_consultant_id UUID REFERENCES public.consultants(id);
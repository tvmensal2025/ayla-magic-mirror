-- Migration: referral_partners table, customers columns, RLS policies, and metrics function
-- Spec: cashback-keyword-routing (Task 1.1)
-- Non-destructive ADD-only migration

-- 1. Create referral_partners table
CREATE TABLE public.referral_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  cli TEXT NOT NULL,
  qr_phrase TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add referral columns to customers
ALTER TABLE public.customers
  ADD COLUMN referral_partner_id UUID REFERENCES public.referral_partners(id) ON DELETE SET NULL,
  ADD COLUMN referral_keyword_matched TEXT,
  ADD COLUMN referral_detected_at TIMESTAMPTZ;

-- 3. Enable RLS on referral_partners
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

-- 4. RLS policy: consultants can only access their own partners
CREATE POLICY "consultants_own_partners" ON public.referral_partners
  FOR ALL
  TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

-- 5. RLS policy: service_role has full access
CREATE POLICY "service_role_all" ON public.referral_partners
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Function: get_referral_partner_metrics
CREATE OR REPLACE FUNCTION public.get_referral_partner_metrics()
RETURNS TABLE(partner_id UUID, partner_nome TEXT, lead_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    rp.id AS partner_id,
    rp.nome AS partner_nome,
    COUNT(c.id) AS lead_count
  FROM public.referral_partners rp
  LEFT JOIN public.customers c ON c.referral_partner_id = rp.id
  WHERE rp.consultant_id = auth.uid()
    AND rp.is_active = true
  GROUP BY rp.id, rp.nome
  ORDER BY lead_count DESC;
$$;

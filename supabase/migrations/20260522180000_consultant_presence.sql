-- Tabela de presença do consultor.
-- O frontend (`useConsultantPresence`) faz UPSERT a cada 25s.
-- O bot (edge function) consulta `is_consultant_online(consultant_id)`
-- antes de enviar OCR confirmation pro cliente.
--
-- TTL: 90s (3x o heartbeat). Se passou disso, considera ausente.

CREATE TABLE IF NOT EXISTS public.consultant_presence (
  consultant_id  UUID PRIMARY KEY,
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: consultor só vê e edita o próprio registro. Service role bypassa.
ALTER TABLE public.consultant_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultant_presence_self_read ON public.consultant_presence;
CREATE POLICY consultant_presence_self_read ON public.consultant_presence
  FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

DROP POLICY IF EXISTS consultant_presence_self_upsert ON public.consultant_presence;
CREATE POLICY consultant_presence_self_upsert ON public.consultant_presence
  FOR INSERT TO authenticated
  WITH CHECK (consultant_id = auth.uid());

DROP POLICY IF EXISTS consultant_presence_self_update ON public.consultant_presence;
CREATE POLICY consultant_presence_self_update ON public.consultant_presence
  FOR UPDATE TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

-- Helper: retorna true se o consultor enviou heartbeat nos últimos 90s.
CREATE OR REPLACE FUNCTION public.is_consultant_online(p_consultant UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last TIMESTAMPTZ;
BEGIN
  IF p_consultant IS NULL THEN RETURN false; END IF;
  SELECT last_seen_at INTO v_last
    FROM public.consultant_presence
   WHERE consultant_id = p_consultant;
  IF v_last IS NULL THEN RETURN false; END IF;
  RETURN v_last > now() - interval '90 seconds';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_consultant_online(UUID) TO authenticated, service_role;

-- Coluna em customers para representar o "lead aguardando o consultor revisar
-- o OCR antes de enviar pro cliente". Quando o bot termina o OCR e detecta
-- consultor online, set este campo. O painel admin vê e mostra o card.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS ocr_review_pending TEXT
  CHECK (ocr_review_pending IN ('bill', 'doc') OR ocr_review_pending IS NULL),
  ADD COLUMN IF NOT EXISTS ocr_review_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_review_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_review_decided_by TEXT;
  -- ocr_review_decided_by ∈ {'consultant', 'auto_timeout', 'awaiting_client'}

CREATE INDEX IF NOT EXISTS customers_ocr_review_pending_idx
  ON public.customers (consultant_id, ocr_review_pending)
  WHERE ocr_review_pending IS NOT NULL;

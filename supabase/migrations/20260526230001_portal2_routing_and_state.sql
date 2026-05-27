-- Roteamento Portal 1 (digital) ↔ Portal 2 (autoconexao)
--
-- Adiciona:
--   1. consultants.portal_kind  → controla pra qual worker o lead vai
--   2. customers.portal2_*       → estado do cadastro no Portal 2
--   3. settings.portal2_worker_url + portal2_worker_secret (opcionais)
--
-- Idempotente: rodar várias vezes não quebra.

-- 1) Coluna no consultor: 'digital' (padrão, Portal 1) ou 'autoconexao' (Portal 2)
ALTER TABLE consultants
  ADD COLUMN IF NOT EXISTS portal_kind text NOT NULL DEFAULT 'digital';

-- Constraint pra valores aceitos. DROP/CREATE pra ser idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultants_portal_kind_check'
  ) THEN
    ALTER TABLE consultants
      ADD CONSTRAINT consultants_portal_kind_check
      CHECK (portal_kind IN ('digital', 'autoconexao'));
  END IF;
END $$;

COMMENT ON COLUMN consultants.portal_kind IS
  'Define qual worker processa cadastros do consultor: digital=Portal 1 (Playwright UI), autoconexao=Portal 2 (API direta).';

-- 2) Estado do cadastro no Portal 2 (idcliente, status, erro, validação)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal2_idcliente bigint,
  ADD COLUMN IF NOT EXISTS portal2_idsolcontratovalidacao bigint,
  ADD COLUMN IF NOT EXISTS portal2_status text,                -- 'created' | 'failed' | 'otp_sent' | 'otp_validated' | 'contract_signed'
  ADD COLUMN IF NOT EXISTS portal2_error text,
  ADD COLUMN IF NOT EXISTS portal2_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal2_otp_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal2_otp_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal2_contract_link text;

CREATE INDEX IF NOT EXISTS customers_portal2_idcliente_idx
  ON customers (portal2_idcliente)
  WHERE portal2_idcliente IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_portal2_status_idx
  ON customers (portal2_status)
  WHERE portal2_status IS NOT NULL;

-- 3) Settings opcionais — onde o worker-portal-2 está rodando
INSERT INTO settings (key, value)
VALUES
  ('portal2_worker_url',    'http://igreen_portal-worker-2:3101'),
  ('portal2_worker_secret', 'b77ac5db653b3e500d8ce45ed4a1c40de31476dba616a51b016ddcf86c2cab36')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

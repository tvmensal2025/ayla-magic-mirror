-- Recarga manual da carteira do Rafael Ferreira (rafael.ids@icloud.com)
-- R$ 180,00 saldo + quitação de R$ 6,73 de débito = crédito total de R$ 186,73
SELECT public.credit_consultant_wallet(
  '0c2711ad-4836-41e6-afba-edd94f698ae3'::uuid,
  18673::bigint,
  'manual_topup_2026_05_13_180brl'::text,
  NULL::text,
  'Recarga manual confirmada pelo super-admin: R$ 180,00 saldo real + R$ 6,73 débito quitado'::text,
  '{"source":"manual_admin_credit","confirmed_by":"rafael.ids@icloud.com","amount_brl":180.00}'::jsonb,
  0::bigint
);
select credit_consultant_wallet(
  '0c2711ad-4836-41e6-afba-edd94f698ae3'::uuid,
  27000,
  null,
  null,
  'Crédito manual (admin) — R$ 270,00',
  jsonb_build_object('source','manual_admin','reason','user_request'),
  0
);
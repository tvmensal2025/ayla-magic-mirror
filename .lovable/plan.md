
# Fechar os 100% do LAUNCH_OPS

## 1. Migration — preencher `app_settings`
Atualiza a linha `id='global'`:
- `super_admin_instance_name = 'Consutor-alertas'`
- `minio_alert_threshold_pct = 85` (confirma default)
- `resolver_strict_mode = false` (mantém OFF, conforme escolha)
- `super_admin_phone`: **fica NULL** — você precisa preencher pelo painel Infra do SuperAdmin com o número (DDI+DDD+numero) que vai receber os alertas. Sem isso a edge `super-admin-alerts` não envia. Aviso isso no fim.

## 2. Secret da edge `minio-quota-check`
Adicionar via `secrets--add_secret`:
- `MINIO_TOTAL_BYTES = 107374182400` (100 GB)

Isso liga o cálculo de % no painel Infra.

## 3. Script de cron pronto para colar
Gerar `/mnt/documents/cron_setup.sql` já com:
- `<PROJECT_REF>` = `zlzasfhcxcznaprrragl`
- `<ANON_KEY>` = a anon key real do projeto
- Os 2 agendamentos (`minio-quota-check-15min` e `super-admin-alerts-5min`)
- Bloco `select cron.unschedule(...)` comentado para rollback
- Bloco de verificação (`select * from cron.job_run_details ...`)

Você abre o SQL Editor do Supabase, cola o conteúdo, roda. Pronto.

## 4. Resolver Strict Mode
Mantém OFF (conforme você pediu). Você liga pelo toggle no SuperAdmin quando validar com o piloto.

## 5. Documentação
Atualizar `LAUNCH_OPS.md` seção "Pre-launch checklist" marcando o que ficou feito automático e o que ainda depende de você (preencher telefone do super_admin + rodar o SQL).

---

## Resumo do que ainda exige ação manual sua depois desse plano

1. **Abrir SuperAdmin → painel Infra** e preencher `super_admin_phone` com o número WhatsApp que vai receber os alertas (não me passou um número, só o nome da instância).
2. **Abrir SQL Editor do Supabase** e rodar o conteúdo de `/mnt/documents/cron_setup.sql`.

Sem essas duas ações os alertas não disparam — mas todo o resto (código, secret, config no banco, script pronto) fica 100%.

## Detalhes técnicos

- A migration só faz `UPDATE public.app_settings SET ... WHERE id='global'` (linha já existe pelos lotes anteriores).
- `MINIO_TOTAL_BYTES` é runtime secret da edge function; não vaza pro frontend.
- O `cron_setup.sql` **não** vai pra `supabase/migrations/` (contém anon key e config específica do ambiente) — só pro `/mnt/documents/` pra você baixar e colar.

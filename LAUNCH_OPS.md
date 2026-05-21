# LAUNCH_OPS — Checklist operacional iGreen

Documento vivo, atualizar a cada novo lote da auditoria.
Última atualização: Lote 3 (F12, 3.5, 3.1).

---

## 1. Capacidade — antes de abrir 100 consultores

### Easypanel / Evolution API

- **RAM mínima recomendada para 100 instâncias Evolution simultâneas**: 16 GB
  (cada instância ocupa ~100-150 MB com WebSocket ativo + buffers de mídia).
- CPU: 4 vCPU é suficiente em regime normal; pico de QR scan pode subir para
  6-8. Configurar autoscale se possível.
- Disco do container Evolution: mínimo 30 GB livres para sessões/auth.

### MinIO

- Bucket único `igreen`. Crescimento estimado: ~3-5 GB / consultor / mês
  (vídeos comprimidos para 720p via `compress-worker`).
- Para 100 consultores ativos: planejar 400-500 GB de disco no primeiro ano.
- Limiar de alerta padrão: **85%** (configurável em
  `app_settings.minio_alert_threshold_pct`).
- `MINIO_TOTAL_BYTES` (env opcional na função `minio-quota-check`) define a
  capacidade total para cálculo de %. Se ausente, o painel mostra só bytes
  usados, sem percentual.

### Worker portal (cadastros iGreen)

- **3 réplicas recomendadas** para 100 consultores. Cada cadastro consome
  ~30s no portal externo; com 3 réplicas o throughput chega a 6/min.
- Filas em pg_cron: `ai-followup-cron`, `bot-stuck-recovery`,
  `bot-loop-watchdog`, `send-scheduled-messages`, `recover-stuck-otp`,
  `minio-quota-check` (15min), `super-admin-alerts` (5min).

### Limites externos

- **Whapi**: 1 instância por canal; rate limit ~30 msg/min por instância. Para
  envio em massa, respeitar `BulkSendPanel` delays (1.5–2.5s).
- **Evolution**: sem hard limit documentado, mas evite > 60 msg/min/instância
  para não disparar banimento do WhatsApp.
- **Gemini (Lovable AI Gateway)**: limites do projeto; conferir saldo antes
  de campanhas em massa.

---

## 2. Pre-launch checklist (cada novo deploy massivo)

Status atual (atualizado pelo agente em 21/05/2026):

- [x] Kill switch global está ATIVO (`app_settings.bot_global_enabled = true`)
- [x] `super_admin_instance_name` = **Consutor-alertas** (preenchido via migration)
- [ ] `super_admin_phone` — **PENDENTE**: preencher no painel Infra do SuperAdmin com o WhatsApp que vai receber os alertas (DDI+DDD+numero, ex: `5511999999999`). Sem isso a edge `super-admin-alerts` não dispara.
- [x] `minio_alert_threshold_pct` = 85
- [x] Secret `MINIO_TOTAL_BYTES` = 100 GB configurada na edge `minio-quota-check`
- [ ] MinIO último check `alive=true`, pct < 80% (validar após primeiro cron rodar)
- [x] Resolver Strict Mode permanece OFF (ligar pelo toggle quando validar com piloto)
- [ ] Crons agendados em `cron.job` — **PENDENTE**: rodar `/mnt/documents/cron_setup.sql` no SQL Editor (já vem com anon key e project_ref preenchidos)
- [x] Cookie banner / Política de Privacidade publicados (Fase 1)
- [x] `LAUNCH_OPS.md` revisado

---

## 3. Runbook — emergências comuns

### Bot mandando algo errado para todos os leads
1. SuperAdmin → **Bot Global** → Pausar (Fase 0).
2. Identificar a causa (Edge logs do `whapi-webhook`).
3. Corrigir, deploy.
4. Reativar Bot Global.

### MinIO cheio
1. Alerta chega via WhatsApp para `super_admin_phone`.
2. Limpar vídeos antigos no Easypanel ou aumentar disco.
3. Painel **Infra** → "Verificar agora" para forçar nova leitura.

### Instância derrubada
1. Alerta chega em até 5min via `super-admin-alerts`.
2. Pedir ao consultor para reescanear QR no `/admin/whatsapp`.
3. Se persistir, recriar instância pelo Easypanel.

### Lead preso em "finalizando"
1. `recover-stuck-otp` (cron diário) detecta após 10min e notifica
   `consultants.notification_phone`.
2. Consultor assume manualmente (botão "Assumir" no chat).

---

## 4. Cron jobs (pg_cron)

> **Aviso**: NÃO comitar este SQL em migrations. Rodar manualmente no SQL
> Editor do Supabase substituindo `<ANON_KEY>` e `<PROJECT_REF>`.

```sql
-- F12 — MinIO quota check (15min)
select cron.schedule(
  'minio-quota-check-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/minio-quota-check',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3.5 — Super admin alerts (5min)
select cron.schedule(
  'super-admin-alerts-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/super-admin-alerts',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Para desagendar:
```sql
select cron.unschedule('minio-quota-check-15min');
select cron.unschedule('super-admin-alerts-5min');
```

Ver execuções recentes:
```sql
select * from cron.job_run_details
where jobname in ('minio-quota-check-15min','super-admin-alerts-5min')
order by start_time desc limit 20;
```

---

## 5. Métricas a acompanhar no SuperAdmin

- **Bot Global**: status (ATIVO / DESLIGADO)
- **Resolver Strict Mode**: status + última troca
- **Infra · MinIO**: pct uso, último ping, contagem de objetos
- **Stuck Leads Widget**: leads parados >1h por step
- **Saúde do Sistema**: instâncias down, erros 24h, decisões IA
- **Captação Intel**: diagnóstico IA semanal

Histórico bruto: tabela `infra_metrics` (`metric_key in ('minio_health',
'minio_alert','instance_alert')`).

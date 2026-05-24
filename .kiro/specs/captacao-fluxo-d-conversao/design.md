# Design — Captação Fluxo D + Simulador + Tracking Meta + Reaquecimento

## Visão geral

Quatro frentes complementares, todas já parcialmente implementadas. Este design documenta o estado atual, a arquitetura existente, e os gaps a fechar para satisfazer os requirements (R1–R18).

```
┌──────────────────────────────────────────────────────────────┐
│  Editor de Fluxos (FluxoBuilder)                             │
│  ├─ FlowTemplatesDialog (templates prontos)                  │
│  │  └─ R1: Template "Captação Meta Ads"      [GAP]           │
│  ├─ FlowSimulator (modal Lead Fake)          [DONE — R3..R5] │
│  └─ useFlowValidation                        [DONE — R17]    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Captação (cascata Fluxo D)                                  │
│  ├─ evolution-webhook → handlers/bot-flow.ts                 │
│  │  ├─ R2.1..R2.4: avanço pós-OCR              [DONE]        │
│  │  ├─ R2.5..R2.7: alertas flow_d_*            [GAP]         │
│  │  └─ R8: lead_source.ts (ctwaClid + match)   [PARCIAL]     │
│  └─ ai-faq-answerer (FAQ exato + LLM)          [DONE]        │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Tracking Meta Ads (AdsCentralTab)                           │
│  ├─ R6: cadastro manual de campanhas             [PARCIAL]   │
│  │  └─ Falta validação initial_message ≥ 5      [GAP]        │
│  ├─ R7: import via Meta Marketing API           [PARCIAL]    │
│  │  └─ facebook-sync-metrics existe, sem 90d    [GAP]        │
│  ├─ R8.4: tsvector match com similaridade ≥ 0.7 [GAP]        │
│  ├─ R8.6: log de match com método+score         [GAP]        │
│  └─ R9: painel CAC + lista por campanha          [DONE]      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Painel de Reaquecimento (/admin/reaquecimento)              │
│  ├─ R10..R14: lista, histórico, templates, envio  [DONE]     │
│  └─ R15: cron auto_reactivate                    [GAP]       │
│     └─ reactivation-cron com janela horária      [GAP]       │
└──────────────────────────────────────────────────────────────┘
```

## Arquitetura existente

### Banco de dados

- `customers` — schema preservado (R17.1). Colunas relevantes: `conversation_step`, `flow_variant`, `source_campaign_id`, `source_ctwa_clid`, `lead_source`, `bot_paused`, `pause_reason`, `consultant_id`, `phone_whatsapp`, `electricity_bill_photo_url`, `capture_mode`.
- `facebook_campaigns` — `consultant_id`, `campaign_id`, `nome`, `initial_message`, `status` ∈ `{active, paused, archived}`, `total_cost_cents`. RLS por `consultant_id = auth.uid()`.
- `facebook_metrics_daily` — `(campanha, dia)` com `cost_cents`, `impressions`, `clicks`. RLS espelhando `facebook_campaigns`.
- `reactivation_templates` (migration `20260524000000_captacao_fluxo_d_conversao.sql`) — `consultant_id`, `conversation_step`, `message_text`, `is_active`, `auto_reactivate`. UNIQUE parcial (`consultant_id`, `conversation_step`) WHERE `is_active=true`.
- `reactivation_sends` — `customer_id`, `consultant_id`, `conversation_step`, `template_id`, `message_text`, `sent_at`, `status` ∈ `{sent, failed}`, `trigger_type` ∈ `{manual, auto}`, `error_reason`, `lead_responded_at`, `lead_advanced_at`, `outcome` ∈ `{abandoned, responded, advanced, NULL}`.
- `bot_handoff_alerts` — schema atual, novos `alert_type` a adicionar: `flow_d_stuck`, `flow_d_ocr_failed_bill`, `flow_d_ocr_failed_doc`.
- `lead_source_match_log` (NOVA, R8.6) — `customer_id`, `campaign_id` (nullable), `method` ∈ `{ctwa_clid, exact_message, tsvector, unmatched}`, `similarity_score` (numeric, nullable), `decided_at` (UTC ms).

### Componentes do front

- `src/pages/FluxoBuilder.tsx` — editor de fluxos com botão "🎬 Testar fluxo".
- `src/components/admin/flow-builder/FlowSimulator.tsx` — modal que executa o fluxo localmente sem WhatsApp.
- `src/components/admin/flow-builder/FlowTemplatesDialog.tsx` — galeria de templates de fluxo.
- `src/components/admin/flow-builder/useFlowValidation.ts` — regras de validação por variante.
- `src/components/admin/ads/AdsCentralTab.tsx` — Central de Anúncios com 6 abas.
- `src/components/admin/ads/CreateCampaignWizard.tsx` — wizard de criação manual.
- `src/components/admin/ads/CampaignsList.tsx` — lista com leads/conversões/CAC.
- `src/pages/AdminReaquecimento.tsx` — painel principal.
- `src/components/admin/reaquecimento/ReaquecimentoLeadList.tsx` — lista paginada com filtro por step.
- `src/components/admin/reaquecimento/ReaquecimentoLeadHistory.tsx` — últimas 20 mensagens.
- `src/components/admin/reaquecimento/ReaquecimentoTemplates.tsx` — CRUD de templates por step.
- `src/components/admin/reaquecimento/ReaquecimentoSendDialog.tsx` — envio manual + lote.

### Componentes do backend

- `supabase/functions/_shared/captation/lead-source.ts` — auto-tag de lead source. Lê `externalAdReply.ctwaClid` do payload Evolution e tenta resolver `source_campaign_id`.
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` — pipeline determinístico que processa OCR e avança steps.
- `supabase/functions/_shared/ai-faq-answerer.ts` — FAQ com short-circuit em `bot_flow_qa.text_response` antes de LLM (Task 30 da spec `whatsapp-flow-reliability-fix`).
- `supabase/functions/facebook-sync-metrics/index.ts` — sync diário de custos da Meta API.

## Ordem de execução do funil pós-OCR (R2)

```
                    ┌──────────────────────────┐
                    │ Lead envia foto de conta │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │ evolution-webhook recebe │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │ bot-flow → OCR (capture) │
                    └────────────┬─────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
         ┌──────────────┐               ┌────────────────┐
         │ OCR sucesso  │               │ OCR falhou     │
         └──────┬───────┘               └────────┬───────┘
                ▼                                ▼
         ┌──────────────┐               ┌────────────────┐
         │ next_step =  │               │ INSERT alert   │
         │ resultado    │               │ flow_d_ocr_    │
         │ simulação    │               │ failed_bill    │
         └──────┬───────┘               │ + manter step  │
                ▼                       └────────────────┘
   timer 30s sem nova msg
                │
                ▼
         ┌──────────────┐
         │ INSERT alert │
         │ flow_d_stuck │
         └──────────────┘
```

Implementação:
- A transição `aguardando_conta → resultado_simulacao` já existe em `bot-flow.ts` (R2.1..R2.4 done).
- Os alertas `flow_d_*` precisam ser inseridos em `bot_handoff_alerts` quando o pipeline detecta:
  - OCR retornou erro → `flow_d_ocr_failed_bill` (in-line após `extractFromBill` raise).
  - 30s sem nova mensagem do lead em step Fluxo_D → `flow_d_stuck` via cron `flow-d-stuck-watchdog` (a cada 5min, varre customers em Fluxo_D com `updated_at < now()-30s` e step não-finalista).

## Match de campanha (R8)

Pipeline em `_shared/captation/lead-source.ts`:

```
1. ctwaClid presente? → lookup ctwa_clid_to_campaign → set source_campaign_id
   └─ NÃO encontrado: cai pro passo 2
2. Primeira mensagem do lead = facebook_campaigns.initial_message (normalizado)?
   └─ Sim: set source_campaign_id, method='exact_message'
   └─ Não: cai pro passo 3
3. Busca textual com tsvector + ts_rank ou pg_trgm similarity:
   └─ similaridade ≥ 0.7: set source_campaign_id, method='tsvector', score
   └─ < 0.7: deixa nulo, method='unmatched'
4. INSERT em lead_source_match_log com customer_id, campaign_id, method, score, decided_at
```

Implementação atual: passos 1 e 2 funcionam. Passos 3 e 4 são GAPs.

## Reaquecimento automático (R15)

Edge Function `reactivation-cron`:

```
Schedule: a cada 1h
1. SELECT * FROM reactivation_templates WHERE auto_reactivate=true AND is_active=true
2. Para cada template:
   2.1. Verifica se hoje é segunda a sexta E hora ∈ [09, 20] no fuso do consultor
        (default 'America/Sao_Paulo' se consultants.timezone NULL)
        → senão skip
   2.2. SELECT customers WHERE
          consultant_id = template.consultant_id
          AND conversation_step = template.conversation_step
          AND status NOT IN ('approved', 'cancelled')
          AND updated_at < now() - interval '24 hours'
          AND id NOT IN (
            SELECT customer_id FROM reactivation_sends
            WHERE consultant_id = template.consultant_id
              AND sent_at > now() - interval '48 hours'
          )
          AND (
            SELECT count(*) FROM reactivation_sends
            WHERE customer_id = customers.id AND trigger_type='auto'
          ) < 3
        LIMIT 500
   2.3. Para cada lead:
        - render template (substituir {{nome}}, {{valor_conta}}, {{representante}})
        - sendText via Evolution API
        - INSERT reactivation_sends com trigger_type='auto'
        - sleep 2s entre envios
```

## Tracking de outcome (R16)

Cron `reactivation-outcome-tracker` (a cada 1h):

```
1. Atualizar lead_responded_at:
   UPDATE reactivation_sends rs
      SET lead_responded_at = (
        SELECT min(c.created_at) FROM conversations c
        WHERE c.customer_id = rs.customer_id
          AND c.created_at > rs.sent_at
          AND c.role = 'customer'
      )
   WHERE lead_responded_at IS NULL
     AND sent_at > now() - interval '7 days'
     AND status = 'sent';

2. Atualizar lead_advanced_at:
   UPDATE reactivation_sends rs
      SET lead_advanced_at = (
        SELECT min(t.changed_at) FROM bot_step_transitions t
        WHERE t.customer_id = rs.customer_id
          AND t.changed_at > rs.sent_at
          AND t.step_after != rs.conversation_step
      )
   WHERE lead_advanced_at IS NULL
     AND sent_at > now() - interval '7 days'
     AND status = 'sent';

3. Marcar outcome:
   UPDATE reactivation_sends SET outcome =
     CASE
       WHEN now() - sent_at > interval '7 days' AND lead_responded_at IS NULL THEN 'abandoned'
       WHEN lead_advanced_at IS NOT NULL THEN 'advanced'
       WHEN lead_responded_at IS NOT NULL THEN 'responded'
       ELSE NULL
     END
   WHERE outcome IS NULL AND status = 'sent';
```

## Modelo de dados — adições

### Migration: `bot_handoff_alerts.alert_type` (R2)
Já existe a tabela. Adicionar valores no enum/CHECK constraint:
- `flow_d_stuck`
- `flow_d_ocr_failed_bill`
- `flow_d_ocr_failed_doc`

### Migration: `lead_source_match_log` (R8.6)
```sql
CREATE TABLE public.lead_source_match_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.facebook_campaigns(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('ctwa_clid','exact_message','tsvector','unmatched')),
  similarity_score NUMERIC(4,3),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.lead_source_match_log (customer_id, decided_at DESC);
CREATE INDEX ON public.lead_source_match_log (campaign_id, decided_at DESC) WHERE campaign_id IS NOT NULL;
ALTER TABLE public.lead_source_match_log ENABLE ROW LEVEL SECURITY;
-- RLS: consultor vê apenas customers que são dele
```

### Migration: índice GIN sobre `facebook_campaigns.initial_message` (R8.4)
```sql
CREATE INDEX IF NOT EXISTS facebook_campaigns_initial_message_tsv_idx
  ON public.facebook_campaigns
  USING gin (to_tsvector('portuguese', initial_message));
```

## Out of scope

- Migração para framework do simulador a um motor separado para reuso server-side (caro; o simulador atual em TS no front é suficiente).
- Cancelamento de Envio_em_Lote em meio ao processamento usando Workers (R14.6) — a UI atual usa state local e pode interromper futuras chamadas; suficiente.
- Internacionalização do template Captação Meta Ads — só PT-BR.

## Princípios de implementação

- **Não quebrar A/B/C/E.** Toda mudança é gated por variant ou step novo.
- **RLS sempre.** Cada tabela nova tem policy explícita por `consultant_id`.
- **Idempotência.** Migrations usam `IF NOT EXISTS`. Cron é `at-least-once`; INSERT em `reactivation_sends` é seguro para retry porque cada chamada gera um id próprio.
- **Audit log.** R18.6 e R18.7 — toda mutação em template + envio em lote logada.

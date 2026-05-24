---
name: Flow Engine V3 Rollout
description: Plano de 4 semanas para migrar runBotFlow legado → engine V3 puro. Status atual, gates de cada fase, comandos de rollback.
type: feature
---

# Flow Engine V3 — Rollout

**Objetivo:** substituir `runBotFlow` imperativo por `tick(state, input) → EngineResult` puro + `customer_flow_state` como fonte de verdade.

## Flags por consultor
- `consultants.flow_reliability_v2` ∈ {off, dark, canary, on}
- `consultants.flow_engine_v3` ∈ {off, dark, canary, on}

## Status atual

### Semana 1 — Cabeamento (✅ feito)
- `_shared/flow-engine/webhook-hook.ts` — fail-open, loga `engine_dark_decision`.
- `_shared/cron-pause-batch.ts` — filterSendableCustomers em N+1 batch.
- Webhooks `whapi-webhook` + `evolution-webhook` chamam o hook antes do legado.
- Crons `ai-followup-cron`, `bot-followup-checker`, `bot-stuck-recovery`, `bot-loop-watchdog` migrados.

### Semana 2 — Dark mode (✅ ativado em 1 consultor)
- Migration criou: coluna `consultants.flow_engine_v3`, tabela `customer_flow_state`, view `v_flow_engine_health` (security_invoker).
- **Consultor de teste:** Rafael Ferreira (`0c2711ad-4836-41e6-afba-edd94f698ae3`)
  - Volume: 966 leads/7d, 9 leads/24h
  - Ativado: `flow_reliability_v2='dark'` + `flow_engine_v3='dark'`
- **Gates para Semana 3** (validar em 48h):
  - Zero `engine_v3_state_load_failed` em edge logs
  - ≥99% paridade entre `engine_dark_decision` e ação legada
  - p95 latência webhook ≤ baseline + 10%
  - Zero duplicação de mensagem reportada
  - ≥100 turnos shadow logados
- **Observação:** `customer_flow_state` está vazia — leads atuais ainda não têm linha canônica. O hook V3 retorna NOOP até existir backfill ou criação on-demand. Os logs `engine_dark_decision` só aparecem quando houver estado; até lá, apenas confirma fail-open silencioso.

### Semana 3 — Canary 5% (pendente)
- Ativar `flow_engine_v3='canary'` em 3-5 consultores de baixo volume + 1 de alto.
- Monitorar `v_flow_engine_health` 7 dias. Gates:
  - `conversion_rate` ≥ baseline − 2pp
  - `deterministic_fallback_pct` ≤ 5%
  - `engine_delegate_legacy` < 30%
  - Zero P1.

### Semana 4 — Global + cleanup (pendente)
- `flow_engine_v3='on'` global.
- Após 30 dias estáveis: marcar `bot_paused` deprecated, remover branches mortos, Phase J cleanup.

## Rollback (30s, qualquer momento)
```sql
UPDATE public.consultants
SET flow_reliability_v2='off', flow_engine_v3='off'
WHERE id='<consultant_id>';
```

## Próximo trabalho técnico necessário
- Backfill / criação on-demand de `customer_flow_state` (trigger em `customers` INSERT/UPDATE) para que `loadFlowState` retorne dados reais.
- Wire do `ChannelAdapter` ao webhook para Semana 4 (hoje o hook só observa).

---
name: Flow Engine V3 Rollout
description: Cabeamento Semana 1 do engine v3 nos webhooks (whapi + evolution) e 4 crons; sequência dark→canary→on para Semanas 2-4
type: feature
---

# Flow Engine V3 — Rollout em andamento

## Semana 1 (cabeamento de código) — FEITO

- Helper único `_shared/flow-engine/webhook-hook.ts` (`runEngineV3IfEnabled`).
  Carrega `customer_flow_state`, loga `engine_dark_decision`, fail-open.
- `whapi-webhook/index.ts` (PROD): hook chamado antes do `runEngine` (linha ~1121).
- `evolution-webhook/index.ts` (espelho): bloco 7.6 substituído pelo mesmo helper.
- Helper batch `_shared/cron-pause-batch.ts` (`filterSendableCustomers`).
  Aplica filtro v3 (`customer_flow_state.status`) em N customers com 1 SELECT.
- 4 crons migrados: `ai-followup-cron`, `bot-followup-checker`,
  `bot-stuck-recovery`, `bot-loop-watchdog`. Todos fail-open.

## Comportamento atual

- `flow_engine_v3='off'` → helper retorna no-op.
- `'dark' | 'canary' | 'on'` → helper LÊ `customer_flow_state` e loga
  `engine_dark_decision`. **NÃO emite por v3 ainda** — o legado continua
  emitindo até o ChannelAdapter v3 ser wired (Semana 4).
- Crons filtram batch por v3 + legado (mais conservador na migração).

## Semanas 2-4 (operacional via SQL)

```sql
-- Semana 2 dia 1: dark em 1 consultor
UPDATE consultants SET flow_reliability_v2='dark' WHERE id='<id-teste>';
-- Semana 2 dia 2: global
UPDATE consultants SET flow_reliability_v2='on';
-- Semana 2 dia 3: v3 em dark no consultor de teste
UPDATE consultants SET flow_engine_v3='dark' WHERE id='<id-teste>';

-- Semana 3: canary 5%
UPDATE consultants SET flow_engine_v3='canary' WHERE id IN (...);

-- Semana 4: global
UPDATE consultants SET flow_engine_v3='on';
```

Rollback: `UPDATE consultants SET flow_engine_v3='off' WHERE id=...;` (cache 30s).

## Próximos itens (não implementados)

- ChannelAdapter v3 wrapper para `whapi-webhook` permitir `dispatch()` real
  (transforma `tick()` action → `sender.sendText/Media`). Hoje engine v3 é
  só observação.
- Cenários extras em `bot-e2e-runner` para validar paridade dark.
- Cleanup `customers.bot_paused` deprecation (Phase J, após 30d em `on`).

## Critérios de paridade (gates)

- `engine_dark_decision` vs decisão legada: ≥99% paridade em 48h dark.
- `cron_pause_disagreement` < 1% das execuções de cron.
- `engine_v3_fallback_to_legacy` ≈ 0 (não esperado em fluxo normal).
- Latência p95 webhook ≤ baseline + 10%.

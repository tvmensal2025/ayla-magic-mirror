## Objetivo
Deixar 100% verde — corrigir 3 falhas reais que aparecem nos logs.

## Falhas detectadas

1. **`meta-ads-import` + `reactivation-send` → BootFailure**
   Importam `captureError` de `_shared/audit.ts`, mas esse símbolo nunca foi exportado. As 2 funções estão **mortas em produção** (não bootam).

2. **`flow-d-stuck-watchdog` → insert falha toda execução**
   Faz `insert` em `bot_handoff_alerts.alert_type`, mas a coluna não existe (tabela só tem `reason`). Watchdog roda mas nunca registra alerta.

3. **Simulador `/admin/fluxos` → 404 (`flow-simulate-run/reset`)**
   Funções importam de outra função (`../whapi-webhook/handlers/bot-flow.ts`), o que edge-runtime do Supabase não suporta — deploy quebra.

## Correções

### 1. Exportar `captureError` em `_shared/audit.ts`
Adicionar wrapper mínimo (apenas `console.error` estruturado, sem Sentry). Zero risco, restaura boot das 2 funções.

### 2. Adicionar coluna `alert_type` em `bot_handoff_alerts`
Migração:
```sql
ALTER TABLE bot_handoff_alerts
  ADD COLUMN IF NOT EXISTS alert_type text NOT NULL DEFAULT 'handoff';
CREATE INDEX IF NOT EXISTS idx_bot_handoff_alerts_type_created
  ON bot_handoff_alerts(alert_type, created_at DESC);
```
Default `'handoff'` preserva linhas existentes; watchdog passa a inserir `'flow_d_stuck'`.

### 3. Simulador `flow-simulate-run/reset`
Em vez do refactor pesado (mover `bot-flow.ts` pra `_shared/`, alto risco perto do go-live), substituir a estratégia: o simulador chama a função real `whapi-webhook` via HTTP interno com um payload sintético marcado `is_sandbox=true`, lendo o resultado pelos próprios registros que o bot grava. Mantém engine único, sem duplicação, deploy passa.

- `flow-simulate-run`: monta payload Whapi fake (`messages[0]` com `chat_id` sandbox), faz `fetch` para `whapi-webhook`, devolve as últimas mensagens geradas.
- `flow-simulate-reset`: limpa `customer` sandbox (`phone` deterministico tipo `sim-<consultant_id>`) — só DELETE em `messages`/`customers` desse phone.

## Verificação após build
- Redeploy automático das 4 funções.
- Conferir logs: `meta-ads-import`, `reactivation-send`, `flow-d-stuck-watchdog`, `flow-simulate-run` — todas sem BootFailure / sem erro de schema.
- Curl em `flow-simulate-run` com payload de teste → 200.
- Abrir `/admin/fluxos` simulador, mandar "oi" → resposta volta.

## Fora do escopo
- Sem mexer em `whapi-webhook`, crons de produção, RLS, ou qualquer outra função saudável.
- Sem migração de `getAdminClient` (cosmético, já discutido).

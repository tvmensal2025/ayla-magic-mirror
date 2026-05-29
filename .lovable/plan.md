# Plano de Correção — Fluxo D 100% Operacional

## Validação dos bugs

✅ **Bug #1 confirmado** — TDZ em `goToStep`:
- `evolution-webhook/handlers/conversational/index.ts`: usado na linha **1368**, declarado na linha **1582**
- `whapi-webhook/handlers/conversational/index.ts`: usado na linha **1548**, declarado na linha **1829**
- Quando `cls.intent === "quer_cadastrar"` cai sem `transition` e existe `capture_documento` no fluxo, dispara `ReferenceError: Cannot access 'goToStep' before initialization` → webhook devolve 500 e o lead trava.

✅ **Bug #2 confirmado** — `flow-d-stuck-watchdog` cria handoff_alerts duplicados (18 duplicatas em 7 dias) porque não checa alerta `resolved_at IS NULL` existente.

## Correções

### 1. Mover `goToStep` para antes do primeiro uso (ambos os webhooks)
Extrair o bloco `const goToStep = async (s, extra) => { ... }` (linhas 1582 / 1829) e colá-lo **antes** do bloco `🔒 DETERMINÍSTICO PRIMEIRO` (acima da linha 1349 / 1529). Remover a declaração antiga para não duplicar.

Risco: nenhum — `goToStep` só depende de variáveis de escopo de função (`ctx`, `dbSteps`, `getTemplate`, `stepTypeToCadastro`) que já existem antes desse ponto. Validar passando todas as referências.

### 2. Idempotência no `flow-d-stuck-watchdog`
Antes do `insert` em `handoff_alerts`, fazer:
```ts
const { data: existing } = await supabase
  .from("handoff_alerts")
  .select("id")
  .eq("customer_id", lead.id)
  .eq("reason", reason)
  .is("resolved_at", null)
  .gte("created_at", new Date(Date.now() - 24*3600*1000).toISOString())
  .maybeSingle();
if (existing) { skipped_duplicate++; continue; }
```

Limpeza pontual das 18 duplicatas existentes via migration: `UPDATE handoff_alerts SET resolved_at = now(), resolved_reason = 'dedup_cleanup' WHERE id NOT IN (SELECT MIN(id) FROM handoff_alerts WHERE resolved_at IS NULL GROUP BY customer_id, reason) AND resolved_at IS NULL AND reason IN (...)`.

### 3. Validação
- `supabase test_edge_functions` em `evolution-webhook` e `whapi-webhook` → deve passar (TS2448 some).
- Deploy das 2 functions + 1 migration.
- Rodar `flow-d-stuck-watchdog` manualmente 2× seguidos e confirmar `skipped_duplicate > 0` no segundo.
- Disparar curl no `whapi-webhook` simulando intent `quer_cadastrar` em passo sem transição → 200 OK.

## Fora do escopo (operacional, usuário executa)
- Reconectar instância Whapi `igreen-0c2711ad4836` (offline há 14 dias).
- Despausar bot global (`manual_global_pause` ativo desde 2026-05-28 em 103 leads).
- Configurar `super_admin_phone` em `app_settings`.

## Resultado esperado
Após as 2 correções de código + 3 ações operacionais, o Fluxo D roda sem `ReferenceError` e sem inflar a tabela `handoff_alerts`. Pronto para produção.

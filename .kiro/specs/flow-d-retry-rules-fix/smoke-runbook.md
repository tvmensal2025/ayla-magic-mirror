# Smoke Runbook — Task 13 (`flow-d-retry-rules-fix`)

> Runbook operacional para o smoke manual + verificação de logs estruturados após o deploy do bugfix `flow-d-retry-rules-fix`.
> Executar em **uma única sessão** para minimizar contaminação dos logs.
>
> ⚠️ Este runbook **NÃO** deve ser executado por agentes automatizados — exige token de super-admin e leitura de logs em produção.

Validates: Requirements 4.1, 4.2, 4.3, 4.4

---

## 0. Pré-requisitos

- [ ] Tasks 1-12 do `tasks.md` concluídas e o branch da PR está deployado no projeto Supabase (staging ou prod, conforme acordo com a equipe).
- [ ] Acesso ao Supabase Dashboard (Logs → Edge Functions) com o projeto certo selecionado.
- [ ] Conta com role `super_admin` ou `admin` no `user_roles` (a função `bot-e2e-runner` checa essa role no JWT do chamador — ver `bot-e2e-runner/index.ts` linha ~707).
- [ ] `settings.superadmin_consultant_id` populado no banco — sem isso o runner retorna 500 (ver `bot-e2e-runner/index.ts` ~717).
- [ ] Bot do super-admin com fluxo D ativo e step `capture_conta` com `fallback.mode = "retry"` configurado (o cenário `fluxo_d_ocr_*` chama `ensureFlowDRetryConfig` automaticamente, mas vale verificar antes).
- [ ] `psql` (ou o SQL editor do Supabase Dashboard) à mão para as queries de verificação.

## 1. Variáveis de ambiente para a sessão

Exportar localmente antes de rodar curls. **Não comitar nada disso.**

```bash
# URL do projeto Supabase (sem barra final)
export SUPABASE_URL="https://<project-ref>.supabase.co"

# JWT do usuário super-admin (NÃO é o service_role — o runner valida o role do user via getUser()).
# Captura sugerida: abrir o app, DevTools → Application → Local Storage → procurar
# `sb-<project-ref>-auth-token` → campo `access_token`.
export SUPER_ADMIN_JWT="eyJhbGciOi..."

# Service role só se for precisar inspecionar tabelas direto (queries SQL ficam pelo psql/Dashboard).
# NÃO usar no curl do bot-e2e-runner — o runner exige JWT de usuário, não service role.
export SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
```

## 2. Curl — disparo dos 6 cenários

Cada chamada cria um lead novo com telefone `5500000XXXXXXX` (gerado aleatoriamente — ver `bot-e2e-runner/index.ts` ~720), roda o cenário e retorna um JSON com `checks[]`, `finalCustomer`, `conversations` e `handoffAlerts`.

**Regra geral do payload:** `{"scenario": "<nome>"}` — `phone` é gerado pelo runner, não passamos. Anote o `phone` retornado para correlacionar nas queries SQL.

```bash
# ── A1: foto válida → avança normalmente (regressão; não deve aparecer retry-mode log) ──
curl -sS -X POST "$SUPABASE_URL/functions/v1/bot-e2e-runner" \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"fluxo_d_ocr_ok"}' | tee /tmp/smoke-A1.json | jq '.ok, .phone, .checks'
```

```bash
# ── A2: OCR fail 1x → retry_text, sem escalate ──
curl -sS -X POST "$SUPABASE_URL/functions/v1/bot-e2e-runner" \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"fluxo_d_ocr_retry_1x"}' | tee /tmp/smoke-A2.json | jq '.ok, .phone, .checks'
```

```bash
# ── A3: OCR fail 3x (esgota max_retries=2) → bot_paused + handoff alert ──
curl -sS -X POST "$SUPABASE_URL/functions/v1/bot-e2e-runner" \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"fluxo_d_ocr_retry_exhausted"}' | tee /tmp/smoke-A3.json | jq '.ok, .phone, .checks, .handoffAlerts'
```

```bash
# ── A4: variant=A sem retry → defaultText hardcoded (regressão; NÃO escalar) ──
curl -sS -X POST "$SUPABASE_URL/functions/v1/bot-e2e-runner" \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"fluxo_a_ocr_fail"}' | tee /tmp/smoke-A4.json | jq '.ok, .phone, .checks'
```

```bash
# ── B1: lixo em ask_choice mode=retry → retry_text ──
curl -sS -X POST "$SUPABASE_URL/functions/v1/bot-e2e-runner" \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"ask_choice_retry_1x"}' | tee /tmp/smoke-B1.json | jq '.ok, .phone, .checks'
```

```bash
# ── B2: lixo 3x em ask_choice → bot_paused ──
curl -sS -X POST "$SUPABASE_URL/functions/v1/bot-e2e-runner" \
  -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"scenario":"ask_choice_retry_exhausted"}' | tee /tmp/smoke-B2.json | jq '.ok, .phone, .checks, .handoffAlerts'
```

> Anote os 6 `phone` retornados (campo `.phone` em cada JSON) — são o ponto de correlação com logs e SQL.

## 3. Logs estruturados — o que procurar no Supabase Dashboard

Ir em **Supabase Dashboard → Edge Functions → Logs** e filtrar por:

- **Function:** `whapi-webhook` (todos os cenários A* e B* usam o whapi-webhook por baixo — ver `bot-e2e-runner/index.ts` ~216).
- **Time window:** janela em torno do disparo dos curls (alguns minutos para cada lado).
- **Search term:** filtrar por um dos `phone` retornados nos curls para isolar a sessão.

### 3.1. Linhas que **DEVEM** aparecer

| Cenário | Padrão esperado | Origem |
|---|---|---|
| A2, A3 | `[conversational] retry-mode step=capture_conta attempt=N/2 prev=… sameStep=…` (ou step `aguardando_conta` se o engine `sys` foi engatado — dependendo de qual handler tratou o OCR fail no fluxo D) | Task 6 + Task 4 |
| A3 | linha de **insert** em `bot_handoff_alerts` com `reason="ocr_conta_retry_exhausted"` (logada via `console.log`/`jsonLog` do handler ou inferida pela query SQL da seção 4) | Task 4 |
| B1, B2 | `[conversational] retry-mode step=<step_key> attempt=N/2 …` | Task 6 |
| B2 | linha indicando insert em `bot_handoff_alerts` com `reason="<step_key>_retry_exhausted"` | Task 6 |
| Qualquer cenário onde lead avança de step (A1, transições normais nos demais) | `[conversational] retry-counters-reset step=<novo_step>` | Task 8 |

### 3.2. Linhas que **NÃO DEVEM** aparecer (regressões)

- `[conversational] _smartRepeat` disparando em steps que têm `fallback.mode = "retry"` configurado — se aparecer, significa que o branch `retry` não está pegando o caso e estamos caindo no fallback genérico antigo.
- `[conversational] retry-mode` em A1 (foto válida) — não deve haver retry-mode quando o lead avança normalmente.
- `[conversational] retry-mode` em A4 (variant A sem retry config) — o `resolveOcrFallback` deve retornar `escalate=false` e `retryText=defaultHardcoded` sem entrar no branch retry.
- Erros do tipo `[resolveOcrFallback] erro:` — se aparecerem, registrar mas não bloquear (o helper foi escrito para degradar graciosamente; investigar depois).

### 3.3. Comandos rápidos via Supabase CLI (opcional)

Se preferir CLI ao Dashboard:

```bash
# Logs do whapi-webhook nos últimos 30 minutos contendo retry-mode
supabase functions logs whapi-webhook --project-ref <project-ref> | grep -E "retry-mode|retry-counters-reset|_retry_exhausted"

# Confirmar ausência de _smartRepeat indevido em steps retry-mode
supabase functions logs whapi-webhook --project-ref <project-ref> | grep -E "_smartRepeat"
```

## 4. Queries SQL para verificar estado persistido

Rodar no SQL Editor do Supabase Dashboard (ou `psql` com a string do projeto). As 2 queries cobrem o que importa: alertas criados e estado dos leads de teste.

```sql
-- 4.1 Handoff alerts criados pelo retry exhausted (esperado: ≥ 2 — um para A3, um para B2)
SELECT
  id,
  customer_id,
  consultant_id,
  reason,
  metadata,
  created_at
FROM bot_handoff_alerts
WHERE reason LIKE '%_retry_exhausted'
ORDER BY created_at DESC
LIMIT 5;
```

```sql
-- 4.2 Estado dos 6 leads de smoke (filtra pelo prefix dos phones gerados pelo runner)
SELECT
  id,
  phone_whatsapp,
  flow_variant,
  conversation_step,
  bot_paused,
  bot_paused_reason,
  custom_step_retries,
  custom_step_retries_step,
  ocr_conta_attempts,
  ocr_doc_attempts,
  created_at
FROM customers
WHERE phone_whatsapp LIKE '5500000%'
ORDER BY created_at DESC
LIMIT 10;
```

```sql
-- 4.3 (opcional) Conversations outbound do super-admin nos últimos 30 min — útil para ver
-- o texto exato do retry_text vs hardcoded.
SELECT
  c.phone_whatsapp,
  conv.direction,
  conv.message_text,
  conv.created_at
FROM conversations conv
JOIN customers c ON c.id = conv.customer_id
WHERE c.phone_whatsapp LIKE '5500000%'
  AND conv.created_at > NOW() - INTERVAL '30 minutes'
ORDER BY conv.created_at DESC
LIMIT 50;
```

## 5. Acceptance checklist (PASS por cenário)

Marcar cada item ao validar. **Falha em qualquer item bloqueia o merge** — voltar para a task correspondente, não fazer hotfix no smoke.

### A1 — `fluxo_d_ocr_ok`

- [ ] Resposta HTTP `ok: true` com `checks[]` todos `passed`.
- [ ] `customers.bot_paused = false`, `conversation_step` avançou de `aguardando_conta` (ou similar OK).
- [ ] **Logs:** zero ocorrências de `[conversational] retry-mode` para esse `phone`.
- [ ] **Logs:** zero ocorrências de inserção em `bot_handoff_alerts` para esse `customer_id`.
- [ ] Validates: Requirements 4.4 (no extra logs).

### A2 — `fluxo_d_ocr_retry_1x`

- [ ] `ok: true`, `checks[]` todos `passed`.
- [ ] `customers.ocr_conta_attempts = 1`, `bot_paused = false`.
- [ ] Última outbound em `conversations` é o `retry_text` configurado no step `capture_conta` (não o texto hardcoded `"⚠️ Não consegui ler sua conta. Tente uma foto melhor."`).
- [ ] **Logs:** ≥ 1 linha `[conversational] retry-mode step=… attempt=1/2 …` ou (se OCR fail caiu no engine `sys` via `bot-flow.ts`) ≥ 1 linha do handler de OCR fail invocando `resolveOcrFallback`.
- [ ] Validates: Requirements 4.1.

### A3 — `fluxo_d_ocr_retry_exhausted`

- [ ] `ok: true`, `checks[]` todos `passed`, `handoffAlerts.length >= 1`.
- [ ] `customers.bot_paused = true`, `bot_paused_reason = 'ocr_conta_retry_exhausted'`, `conversation_step = 'aguardando_humano'`.
- [ ] `bot_handoff_alerts` (query 4.1) tem 1 row nova com `reason = 'ocr_conta_retry_exhausted'` e `metadata` contendo `step`, `retries`, `max`, `fallback`.
- [ ] **Logs:** ≥ 3 linhas `retry-mode` com `attempt=1/2`, `2/2`, `3/2` (ou equivalentes do handler `sys`).
- [ ] **Logs:** ausência de `_smartRepeat` para esse `phone`.
- [ ] Validates: Requirements 4.1, 4.2.

### A4 — `fluxo_a_ocr_fail` (não-regressão)

- [ ] `ok: true`, `checks[]` todos `passed`.
- [ ] `customers.flow_variant = 'A'`, `bot_paused = false` (não escalou — variante A sem retry config).
- [ ] Última outbound em `conversations` contém o texto hardcoded original (`"⚠️ Não consegui ler sua conta. Tente uma foto melhor."` ou similar exato do código).
- [ ] **Logs:** zero `retry-mode` para esse `phone`. Zero novos rows em `bot_handoff_alerts`.
- [ ] Validates: Requirements 4.4 (no regression logs).

### B1 — `ask_choice_retry_1x`

- [ ] `ok: true`, `checks[]` todos `passed`.
- [ ] `customers.custom_step_retries = 1`, `custom_step_retries_step` = id do step `ask_choice` configurado.
- [ ] Última outbound = `retry_text` configurado no step.
- [ ] **Logs:** ≥ 1 linha `[conversational] retry-mode step=<step_key> attempt=1/2 …`.
- [ ] Validates: Requirements 4.1.

### B2 — `ask_choice_retry_exhausted`

- [ ] `ok: true`, `checks[]` todos `passed`, `handoffAlerts.length >= 1`.
- [ ] `customers.bot_paused = true`, `bot_paused_reason = '<step_key>_retry_exhausted'`, `conversation_step = 'aguardando_humano'`.
- [ ] `bot_handoff_alerts` (query 4.1) tem 1 row nova com `reason` matching `<step_key>_retry_exhausted`.
- [ ] **Logs:** ≥ 3 linhas `retry-mode` (1/2, 2/2, 3/2) + `retry-counters-reset` ou zerado via update no `_finalize` (validar via query 4.2 que `custom_step_retries = 0` no fim).
- [ ] **Logs:** ausência de `_smartRepeat` para esse `phone`.
- [ ] Validates: Requirements 4.1, 4.2, 4.3.

### Cobertura geral

- [ ] Todas as linhas de log seguem o formato `[conversational] <evento> …` (jsonLog ou console.log padronizado), conforme Requirement 4.4.
- [ ] Nenhuma exception não tratada apareceu nos logs durante a janela do smoke.

## 6. Template de comentário no PR

Copiar-e-colar no comentário do PR após executar o smoke. Substituir `<…>` pelos valores reais.

````markdown
## ✅ Smoke Manual — Task 13 (`flow-d-retry-rules-fix`)

**Ambiente:** `<staging|prod>` — projeto `<project-ref>`
**Janela:** `<YYYY-MM-DD HH:MM TZ>` → `<YYYY-MM-DD HH:MM TZ>`
**Operador:** @`<github-handle>`

### Cenários executados

| # | Cenário | `phone` gerado | HTTP `ok` | Checks (passed/total) | Notas |
|---|---|---|---|---|---|
| A1 | `fluxo_d_ocr_ok` | `5500000…` | ✅/❌ | `_/_` | |
| A2 | `fluxo_d_ocr_retry_1x` | `5500000…` | ✅/❌ | `_/_` | |
| A3 | `fluxo_d_ocr_retry_exhausted` | `5500000…` | ✅/❌ | `_/_` | |
| A4 | `fluxo_a_ocr_fail` | `5500000…` | ✅/❌ | `_/_` | |
| B1 | `ask_choice_retry_1x` | `5500000…` | ✅/❌ | `_/_` | |
| B2 | `ask_choice_retry_exhausted` | `5500000…` | ✅/❌ | `_/_` | |

### Logs estruturados — amostras

**Presente (esperado):**

```
<colar 2-3 linhas de [conversational] retry-mode step=…>
<colar 1 linha de [conversational] retry-counters-reset step=…>
<colar evidência de inserção em bot_handoff_alerts (linha de log ou row da query 4.1)>
```

**Ausente (esperado):**

- `[conversational] _smartRepeat` em steps com `fb.mode = "retry"` → confirmado ausente ✅
- `retry-mode` em cenários sem retry config (A1, A4) → confirmado ausente ✅

### SQL — estado persistido

`bot_handoff_alerts` (query 4.1):

```
<colar saída>
```

`customers` smoke (query 4.2):

```
<colar saída>
```

### Acceptance

- [ ] A1 passou
- [ ] A2 passou
- [ ] A3 passou
- [ ] A4 passou
- [ ] B1 passou
- [ ] B2 passou
- [ ] Sem regressões observadas

Validates: Requirements 4.1, 4.2, 4.3, 4.4.
````

## 7. Cleanup pós-smoke

Os leads de teste (`phone_whatsapp` começando com `5500000`) ficam para auditoria por padrão (ver comentário em `bot-e2e-runner/index.ts` ~178). Se quiser limpar manualmente após validar:

```sql
-- Apaga handoff alerts dos leads smoke desta sessão (ajustar window se necessário)
DELETE FROM bot_handoff_alerts
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE phone_whatsapp LIKE '5500000%'
    AND created_at > NOW() - INTERVAL '2 hours'
);

-- Apaga conversations + customers dos leads smoke
DELETE FROM conversations
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE phone_whatsapp LIKE '5500000%'
    AND created_at > NOW() - INTERVAL '2 hours'
);

DELETE FROM customers
WHERE phone_whatsapp LIKE '5500000%'
  AND created_at > NOW() - INTERVAL '2 hours';
```

⚠️ Confirme a janela de tempo antes de rodar para não apagar runs anteriores que ainda servem para outras auditorias.

---

**Pronto.** Se tudo passou, prosseguir para a Task 14 (deploy controlado + monitoramento de 2h).
Se algo falhou, NÃO faça fix dentro desta task — abrir issue/voltar para a task de implementação correspondente, conforme o item que falhou na seção 5.

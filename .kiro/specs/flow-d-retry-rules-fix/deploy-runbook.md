# Deploy Runbook — Task 14 (`flow-d-retry-rules-fix`)

> Runbook operacional para deploy controlado e plano de rollback do bugfix `flow-d-retry-rules-fix`.
> Executar em **janela de baixo tráfego** (sugestão: madrugada BR, 02:00–05:00 `America/Sao_Paulo`) com pelo menos um operador acompanhando os 2 primeiros relógios pós-deploy.
>
> ⚠️ Este runbook **NÃO** deve ser executado por agentes automatizados. Os comandos de `git` (push/revert) e `supabase functions deploy` exigem credenciais de operador humano.

Validates: implícito — garante operação segura do fix em produção.

---

## 0. Pré-deploy checklist

Marcar todos os itens antes de tocar `supabase functions deploy`. Falha em qualquer item bloqueia o deploy — voltar para a task correspondente.

- [ ] **Task 13 (smoke runbook) executado e PASS** — todos os 6 cenários (`A1..A4`, `B1..B2`) marcados como `passed` no comentário do PR (ver `smoke-runbook.md` seção 6).
- [ ] **Tasks 1–12 todas `[x]` em `tasks.md`** — sem nenhuma `[ ]` ou `[-]` pendente.
- [ ] **Suite de testes 100% verde no CI:**
  - [ ] Unit tests `supabase/functions/evolution-webhook/handlers/_test_resolve_ocr.ts` (Task 9)
  - [ ] PBT `supabase/functions/evolution-webhook/handlers/conversational/_test_retry_pbt.ts` (Task 10)
  - [ ] Regressão Whapi: `_shared/channels/whapi_test.ts`, `_shared/flow-engine/engine_test.ts`, `_shared/flow-router_test.ts`, `_shared/channels/dispatch-choice_test.ts` (Task 12)
- [ ] **Diagnósticos limpos** nos arquivos tocados:
  - `supabase/functions/evolution-webhook/handlers/bot-flow.ts`
  - `supabase/functions/evolution-webhook/handlers/conversational/index.ts`
  - `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- [ ] **Tipos regenerados se Task 2 criou migration:** `src/integrations/supabase/types.ts` contém `custom_step_retries` (int) e `custom_step_retries_step` (text|null) em `customers.Row`. Se a Task 1 confirmou que as colunas já existiam, esse item está coberto sem regenerar nada.
- [ ] **Migration aplicada em prod (se houve):** `supabase db push --project-ref <project-ref>` rodado com sucesso e a coluna existe via `\d customers` (ou query `SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name LIKE 'custom_step_retries%';`).
- [ ] **Branch da PR mergeado em `main`** com commits separados por task de implementação (3, 4, 5, 6, 7, 8) — facilita revert seletivo.
- [ ] **Anotar SHAs dos commits do fix** (output de `git log --oneline -n 10` no main após o merge). Vai ser preciso no rollback.
- [ ] **Janela de deploy comunicada:** mensagem "deploy iniciando" enviada no canal de ops 5 minutos antes (template na seção 5).

## 1. Variáveis de ambiente para a sessão

Exportar localmente antes de rodar comandos. **Não comitar nada disso.**

```bash
# ID do projeto Supabase de produção
export SUPABASE_PROJECT_REF="<project-ref>"

# Acesso ao Dashboard / CLI já autenticado (supabase login deve estar feito)
# Verificar com: supabase projects list

# Token de service_role (apenas para queries SQL via psql/curl direto, NUNCA pra deploy)
export SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"

# URL do projeto pra checks de logs via CLI
export SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"
```

## 2. Deploy commands

Rodar a partir da raiz do repo, na branch `main` atualizada (após merge da PR).

```bash
# 2.1 Confirmar que estamos no main com o último commit do fix
git checkout main
git pull --ff-only
git log --oneline -n 6   # anotar SHAs — vai precisar pro rollback

# 2.2 Deploy das 2 functions afetadas. Não usar --no-verify-jwt (mantém o default).
supabase functions deploy evolution-webhook whapi-webhook \
  --project-ref "$SUPABASE_PROJECT_REF"

# 2.3 (opcional) Confirmar que o deploy subiu — checar a versão no Dashboard
#     ou rodar:
supabase functions list --project-ref "$SUPABASE_PROJECT_REF" \
  | grep -E "evolution-webhook|whapi-webhook"
```

> **Se houver migration de Task 2** ainda não aplicada em prod, rodar **antes** do `functions deploy`:
>
> ```bash
> supabase db push --project-ref "$SUPABASE_PROJECT_REF"
> ```
>
> A migration é `ALTER TABLE customers ADD COLUMN IF NOT EXISTS …` — não destrutiva. Pode ficar mesmo após rollback (ver seção 4).

Após o `deploy` retornar 200, registrar timestamp `T0` (início da janela de monitoramento de 2h).

## 3. Plano de monitoramento — 2h pós-deploy

Quatro métricas a observar em paralelo. Janela: `T0` → `T0 + 2h`. Reportar status a cada 30 min no canal de ops.

### 3.1 Contagem de `[conversational] retry-mode`

**Esperado:** `> 0` em variant D ao longo das 2h, raro em A/B/C/E.
**Vermelho:** zero hits totais (significa que o branch retry não está pegando nenhum turno) **ou** explosão (>1k/h por consultor sugere step mal configurado).

Via Supabase Dashboard:

1. **Logs → Edge Functions → `whapi-webhook`** (e depois repetir para `evolution-webhook`).
2. Janela: últimos `15 min` no início, depois rolar.
3. Search: `[conversational] retry-mode`.
4. Agregar visualmente — anotar contagem por meia hora.

Via CLI:

```bash
# Whapi
supabase functions logs whapi-webhook --project-ref "$SUPABASE_PROJECT_REF" \
  | grep -E '\[conversational\] retry-mode' | wc -l

# Evolution
supabase functions logs evolution-webhook --project-ref "$SUPABASE_PROJECT_REF" \
  | grep -E '\[conversational\] retry-mode' | wc -l
```

> O `supabase functions logs` é melhor effort (janela limitada da CLI). Para histórico completo de 2h, preferir o Dashboard ou a tabela `function_invocations` se exposta no projeto.

### 3.2 Contagem de `bot_handoff_alerts` com `*_retry_exhausted`

**Esperado:** alguns hits ao longo das 2h (proporcionais ao volume de leads em variant D que esgotam tentativas). Zero também é aceitável em janelas de baixo tráfego.
**Vermelho:** crescimento desproporcional (>50/h em horas calmas) — pode indicar `max_retries` mal configurado ou regressão.

```sql
-- Rodar no SQL Editor do Dashboard ou via psql.
-- Ajustar a janela conforme T0.
SELECT
  reason,
  COUNT(*)               AS hits,
  MIN(created_at)        AS first_seen,
  MAX(created_at)        AS last_seen
FROM bot_handoff_alerts
WHERE reason LIKE '%_retry_exhausted'
  AND created_at > NOW() - INTERVAL '2 hours'
GROUP BY reason
ORDER BY hits DESC;
```

```sql
-- Detalhe (últimos 20 alerts) pra inspecionar metadata.fallback
SELECT
  id,
  customer_id,
  consultant_id,
  reason,
  metadata,
  created_at
FROM bot_handoff_alerts
WHERE reason LIKE '%_retry_exhausted'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 20;
```

### 3.3 Latência média do turno

**Esperado:** delta vs baseline pré-deploy `< +100 ms`.
**Vermelho:** delta `> +200 ms` sustentado por 30 min ou mais.

Baseline: capturar nas **24h imediatamente anteriores ao deploy** (`T0 - 24h` → `T0`). Rodar a mesma query depois e comparar.

Se a tabela de telemetria de turnos não estiver exposta, usar como proxy a duração das execuções das functions:

1. **Dashboard → Edge Functions → `whapi-webhook` → tab "Metrics"** — gráfico "Average response time".
2. Repetir para `evolution-webhook`.
3. Anotar p50 e p95 antes e depois. Tolerar `+100 ms` em p50, `+200 ms` em p95.

Se houver tabela `function_invocations` (ou similar do projeto) com `duration_ms`, query proxy:

```sql
-- Substituir pela tabela real do projeto se diferir
SELECT
  function_id,
  date_trunc('hour', started_at) AS bucket,
  AVG(execution_time_ms)         AS avg_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) AS p95_ms,
  COUNT(*)                       AS invocations
FROM function_invocations
WHERE function_id IN ('whapi-webhook', 'evolution-webhook')
  AND started_at > NOW() - INTERVAL '26 hours'
GROUP BY 1, 2
ORDER BY 1, 2;
```

Se a tabela não existir no projeto, registrar "metric not available, monitorando via Dashboard Metrics" no comentário pós-deploy.

### 3.4 `[resolveOcrFallback] erro:` warn count

**Esperado:** `0` ocorrências.
**Vermelho:** qualquer ocorrência > 0 — investigar imediatamente. O helper foi escrito para degradar graciosamente, mas o log indica que algo na query de `bot_flow_steps` falhou.

```bash
supabase functions logs evolution-webhook --project-ref "$SUPABASE_PROJECT_REF" \
  | grep -E '\[resolveOcrFallback\] erro:' | wc -l
```

Via Dashboard: filtrar logs de `evolution-webhook` por `[resolveOcrFallback] erro:` na janela de 2h.

### 3.5 Cheklist agregado de monitoramento

A cada 30 min (`T0+30`, `T0+60`, `T0+90`, `T0+120`):

- [ ] `retry-mode` count: `<n>` (D vs A/B/C/E)
- [ ] `*_retry_exhausted` alerts: `<n>` no período, top reason: `<reason>`
- [ ] Latência p50/p95: `<delta_ms>` vs baseline
- [ ] `[resolveOcrFallback] erro:` count: `<n>` (esperado 0)
- [ ] Loop legado `_smartRepeat` em steps com `mode=retry`: ausente? (`grep _smartRepeat` cruzado com steps configurados)

Se algum item ficar **vermelho** por 2 checks consecutivos (60 min), executar rollback da seção 4.

## 4. Procedimento de rollback

Decisão de rollback fica com o operador on-call. Critérios sugeridos:

- Latência média `> +200 ms` sustentada por 60 min;
- Crescimento anômalo de `*_retry_exhausted` (>5× baseline);
- Qualquer `[resolveOcrFallback] erro:` recorrente;
- Bug funcional reportado por consultor (ex.: lead travado em loop).

### 4.1 Rollback completo (revert das 6 commits do fix)

```bash
# Estar no main atualizado
git checkout main
git pull --ff-only

# Reverter os commits do fix em ordem reversa.
# Substituir <SHA-A>..<SHA-F> pelos SHAs anotados na seção 0.
# git revert -n cria um único commit de revert no final, mais limpo pro histórico.
git revert --no-commit <SHA-T8> <SHA-T7> <SHA-T6> <SHA-T5> <SHA-T4> <SHA-T3>
git commit -m "revert: flow-d-retry-rules-fix (rollback do deploy <YYYY-MM-DD>)"

# Confirmar diff esperado (deve reverter os 3 arquivos do fix)
git diff HEAD~1 --stat

# Push direto pro main (ou via PR de hotfix se a política exigir)
git push origin main

# Redeploy das 2 functions
supabase functions deploy evolution-webhook whapi-webhook \
  --project-ref "$SUPABASE_PROJECT_REF"
```

### 4.2 Rollback parcial (se só um dos 2 fixes regrediu)

- **Só Fix B (OCR helper) regrediu:** reverter apenas commits das tasks 3, 4, 5.
- **Só Fix A (retry mode conversational) regrediu:** reverter commits das tasks 6, 7, 8.

```bash
# Exemplo: reverter só Fix A
git revert --no-commit <SHA-T8> <SHA-T7> <SHA-T6>
git commit -m "revert(partial): rollback retry-mode handler (fix A)"
git push origin main
supabase functions deploy evolution-webhook whapi-webhook \
  --project-ref "$SUPABASE_PROJECT_REF"
```

### 4.3 Migration de `custom_step_retries*`

A migration de Task 2 é `ALTER TABLE customers ADD COLUMN IF NOT EXISTS …` — **não destrutiva**. Pode (e deve) **ficar** após o rollback:

- Não há data loss em mantê-la — colunas vazias/zero não afetam o engine antigo.
- Remover a coluna em produção tem custo de lock e risco de quebrar consumers que já leem o campo.
- Em uma re-tentativa do fix, a coluna já está pronta.

Se por algum motivo for preciso reverter a migration:

```sql
-- Apenas se houver consenso explícito. NÃO faz parte do rollback padrão.
ALTER TABLE customers DROP COLUMN IF EXISTS custom_step_retries;
ALTER TABLE customers DROP COLUMN IF EXISTS custom_step_retries_step;
```

### 4.4 Pós-rollback

- [ ] Confirmar via Logs que a versão antiga voltou (timestamp do deploy bate com o do `git push`).
- [ ] Rodar smoke A4 (`fluxo_a_ocr_fail`) — deve continuar PASS (regressão A/B/C/E está protegida pelo design).
- [ ] Rodar smoke A2 (`fluxo_d_ocr_retry_1x`) — espera-se retornar ao comportamento antigo (texto hardcoded em vez de retry_text). Documentar que isso é o esperado pós-rollback.
- [ ] Anunciar rollback no canal de ops (template seção 5).
- [ ] Abrir issue de post-mortem com link para os logs/queries que motivaram o rollback.

## 5. Templates de comunicação

Mensagens curtas para Slack/Discord no canal de ops. Usar exatamente esses formatos pra facilitar busca posterior.

### 5.1 Deploy iniciando

```
🚀 Deploy `flow-d-retry-rules-fix` iniciando agora.
Projeto: <project-ref>
Janela: <YYYY-MM-DD HH:MM TZ> → +2h de monitoramento
Operador: @<handle>
Spec: .kiro/specs/flow-d-retry-rules-fix/
PR: <link>
Functions: evolution-webhook, whapi-webhook
Migration: <none | applied (custom_step_retries*)>
Rollback plan: deploy-runbook.md seção 4
```

### 5.2 Deploy estável (T0 + 2h, sem regressões)

```
✅ Deploy `flow-d-retry-rules-fix` estável após 2h de monitoramento.
Métricas:
- retry-mode hits (whapi): <n>  (evolution): <n>
- *_retry_exhausted alerts: <n> em 2h, top reason: <reason>
- Latência p50/p95: Δ <+x ms / +y ms> vs baseline (dentro do orçamento <100 ms)
- [resolveOcrFallback] erro: 0
Sem regressões observadas. Tasks 13–14 marcadas como done.
```

### 5.3 Rollback executado

```
⚠️ Rollback `flow-d-retry-rules-fix` executado.
Motivo: <descrição curta — métrica fora do orçamento, bug reportado, etc.>
Commits revertidos: <SHAs ou faixa>
Functions redeployadas: evolution-webhook, whapi-webhook
Estado pós-rollback:
- Smoke A4 (regressão A/B/C/E): <PASS|FAIL>
- Comportamento variant D voltou ao antigo (texto hardcoded em OCR fail) — esperado.
Migration `custom_step_retries*`: mantida (não destrutiva).
Post-mortem: <link issue>
```

---

## 6. Critério de done para a Task 14

- [ ] Pré-deploy checklist (seção 0) 100% marcado.
- [ ] Deploy executado com sucesso (seção 2) e timestamp `T0` registrado.
- [ ] Monitoramento de 2h completo (seção 3.5 com 4 checkpoints documentados).
- [ ] Nenhuma regressão observada → mensagem 5.2 enviada **OU** rollback executado conforme seção 4 + mensagem 5.3 enviada.
- [ ] `DOCUMENTATION.md` seção "Bot Flow Engine — Contrato" atualizada com `mode: "retry"` (parte da Task 14, já feita junto deste runbook).
- [ ] Comentário final no PR resumindo deploy + métricas observadas.

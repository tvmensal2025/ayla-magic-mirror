
# Análise profunda — Flow Engine V3 + Pós-Venda Kanban

Diferente da análise anterior (só Pós-Venda), agora o **rewrite do flow-engine-v3** foi de fato implementado e cabeado nos webhooks. Resumo do que mudou, do que está bom e do que ainda precisa ajuste.

---

## 1. O que mudou desde a última análise

### 1.1 Engine V3 (`supabase/functions/_shared/flow-engine/`)
Antes existia só o `engine.ts` legado + `webhook-hook.ts` (modo dark/observer). Agora também existe:

| Arquivo | Linhas | Papel |
|---|---:|---|
| `v3-runner.ts` | 485 | **Função pura** `runEngine(input) → output`. Sem I/O, sem Date.now, sem fetch — purity é forçada por `__tests__/purity_lint_test.ts`. |
| `v3-loader.ts` | 449 | Hidrata `LoadedContext` (customer + state + flow + steps + `mediaOrderByStepKey` resolvido + `ai_media_library`). |
| `v3-dispatcher.ts` | 555 | Aplica efeitos: render template, send via `ChannelAdapter`, mirror em `conversations` + `bot_test_outbound`, persiste `customer_flow_state`, escreve `engine_logs`, dispara `bot_handoff_alerts` com retry+DLQ. |
| `v3-webhook-entry.ts` | 378 | Helper único compartilhado pelos dois webhooks: `loadContext → runEngine → executeActions`. Em erro: pausa cliente + insere handoff + log — **nunca cai pro legado**. |
| `v3-types.ts` | 474 | Contratos. |
| `variants/{a,b,c,d}.ts` | — | Variantes A (áudio), B (sem áudio), C (vídeo), D (botões). |
| `__tests__/purity_lint_test.ts` | — | CI quebra se runner usar API impura. |
| `__tests__/v3-runner_test.ts` + `arb.ts` | — | Testes property-based (G1–G6). |
| `bot-e2e-runner/v3-scenarios.ts` | — | **88 cenários** ponta-a-ponta. |

### 1.2 Integração nos webhooks
- `whapi-webhook/index.ts` linha **1216-1259**: gate V3 antes de qualquer roteamento legado. Quando `consultants.use_engine_v3=true`, V3 assume o turno inteiro e retorna `mode:"engine_v3"`.
- `evolution-webhook/index.ts` linha **1311-1322**: idem.
- Idempotência: `checkAndMarkProcessed(messageId)` linha 178 já bloqueia entrega duplicada do Whapi (R5 resolvido).
- Render template centralizado em `_shared/render-vars.ts` — V3 e legado usam o mesmo módulo.

### 1.3 Pós-Venda Kanban
Sem mudanças desde a análise anterior — segue como descrito (7 colunas, `pos_venda_*`, `assigned_consultant_id`, cron diário, filtro `mine/assigned/all`).

---

## 2. O que está bom (pode considerar 100%)

1. **Pureza do runner** garantida estaticamente pelo lint de purity.
2. **Webhook entry compartilhado** — zero drift entre whapi e evolution (era um dos riscos #1 da análise antiga).
3. **Erro em V3 ≠ silêncio**: `fallThroughToHandoff` pausa + alerta + log; webhook nunca cai pro legado em erro V3 (Task 29).
4. **Idempotência de inbound** já presente (`processed_messages` via `checkAndMarkProcessed`).
5. **Mirror em `conversations`** — ChatView e Kanban enxergam o output do V3 igualzinho ao legado.
6. **CRM Kanban sync** chamando `syncDealStageFromStep` após cada turno (linha 353 do entry).
7. **Retries clamp** (`clampRetries: candidate ∈ [0, prev+1]`) — protege contra runaway (Req 15.4).
8. **DLQ de handoff** dentro do próprio `engine_logs` com kind sentinel — evita perder alerta se `bot_handoff_alerts.insert` falhar 3x.

---

## 3. O que ainda precisa ajustar

### 3.1 Críticos

**C1 — Duas flags V3 coexistindo e divergindo**
- `consultants.use_engine_v3` (boolean) → gate do `runEngineV3WebhookEntry` (assume o turno).
- `consultants.flow_engine_v3` (enum `off|dark|canary|on`) → gate do `runEngineV3IfEnabled` (só observa).
- Ambos rodam no mesmo webhook na mesma request. Risco: um consultor com `flow_engine_v3='on'` mas `use_engine_v3=false` continua no legado mesmo "rollado" — confunde o painel de rollout do SuperAdmin.
- **Fix:** unificar. Sugestão: `flow_engine_v3='on'` deve setar/refletir `use_engine_v3=true` via trigger, OU o gate do entry passa a ler o enum (`flag === 'on'`).

**C2 — `webhook-hook.ts` (modo dark) não chama `runEngine`**
- Comentário explícito linha 76: *"o `tick()` completo precisa do EngineStep carregado — quando o webhook estiver wired ao ChannelAdapter v3, passamos a chamar `tick` aqui de fato"*. Hoje só loga snapshot do estado.
- Consequência: o painel "Rollout V3" mede paridade de **estado**, não de **output**. Você não detecta divergência de texto/áudio entre legado e V3 antes de promover.
- **Fix:** chamar `runEngine` em modo `isDarkMode=true` e logar o `EngineOutput.outbound` para diff offline contra o que o legado mandou.

**C3 — `audio_slot` sem fallback no dispatcher**
- `sendOne` para `audio_slot` retorna `ok:false, error:"audio_slot unhandled"` (linha 348). O comentário diz "engine should resolve to media before emitting" — mas se o loader não achar a slot na `ai_media_library` (slot vazio do consultor), o runner ainda pode emitir `audio_slot`.
- Variant A depende de áudio: silêncio do bot, conta como `failed`, mas turno é dado como `ok:true` (porque `executeActions` não falha o turno inteiro).
- **Fix:** loader deve filtrar/converter `audio_slot` cujo slot não resolveu → pular para texto; ou dispatcher dispara handoff quando `failed > 0` em Variant A.

### 3.2 Médios

**M1 — `retries` único compartilhado entre repeats e perguntas AI**
- `v3-types.ts` tem só `retries: number`. Pergunta AI mid-step e retry de validação consomem o mesmo contador. Quando bate `maxRetriesBeforeHandoff=3`, não dá pra distinguir "fez 3 perguntas livres" de "errou validação 3x".
- **Fix:** adicionar `aiQuestionsThisStep` separado (R3 da análise antiga continua aberto).

**M2 — `consultantName` fetch a cada inbound**
- `v3-webhook-entry.ts` linha 306-314 faz `SELECT name FROM consultants WHERE id = ?` toda vez que o V3 roda. Para 10k+ msgs/dia por consultor de alto volume, é round-trip evitável.
- **Fix:** cachear no `customer_flow_state` (campo `_consultant_name`) ou no scope da request (já existe `botRequestStore`).

**M3 — `capture_mode='auto'` UPDATE pré-engine em todo turno**
- Linha 297-302: faz UPDATE condicional (`.neq("capture_mode","auto")`) — bom, mas ainda é round-trip mesmo quando não muda nada (Postgres avalia o WHERE). Em consultores migrados isso é constante 0-row.
- **Fix:** ler `capture_mode` no `loadContext` (já carrega customer) e só fazer UPDATE se necessário.

**M4 — Tela `Rollout V3` não mostra paridade real**
- Decorrente de C2. View `v_flow_engine_health` só tem métricas agregadas de status; não tem "diff de outbound dark vs legado".
- **Fix:** quando C2 for resolvido, adicionar coluna `output_parity_pct` na view.

**M5 — `syncDealStageFromStep` falha silenciosa**
- Linha 358 do entry: só `console.warn`. Se Kanban dessincronizar, ninguém percebe.
- **Fix:** quando erro, escrever `engine_logs` kind `engine_crm_sync_failed` (lista existente já tem `engine_safe_text`, basta um novo kind).

### 3.3 Baixos / polimento

- **B1** — `engine_logs` sem retenção. Cresce indefinidamente. Adicionar pg_cron mensal `DELETE WHERE at < now() - interval '90 days'` exceto kind in `('engine_handoff','engine_crm_sync_failed')`.
- **B2** — `router.ts` ainda lê `consultants.use_engine_v3` em **toda** request (sem cache). 30-50ms por turno em consultores grandes. Cachear por 60s no escopo do edge runtime.
- **B3** — `LEGACY_BRANCH_REMOVED = false` está hardcoded. Após Phase 4, virar `true` apaga o legado (Task 39) — confirmar que existe checklist antes do flip.
- **B4** — Pós-Venda Kanban (itens 1-4 da análise anterior) seguem abertos: empty state quando consultor sem `igreen_id`, cron sobrescrevendo manual em reprovação iGreen, paginação, badge `registered_by_name` no card.

---

## 4. Veredito

| Componente | Status |
|---|---|
| V3 Engine puro + tests | ✅ Pronto |
| Dispatcher + handoff fail-safe | ✅ Pronto |
| Webhook entry unificado | ✅ Pronto |
| Idempotência inbound | ✅ Pronto |
| Mirror conversations / CRM sync | ✅ Pronto |
| **Flags unificadas (C1)** | ⚠️ Refatorar |
| **Modo dark mede paridade real (C2)** | ⚠️ Faltando |
| **audio_slot fallback (C3)** | ⚠️ Falha silenciosa |
| Métricas/painel rollout | ⚠️ Depende C2 |
| Retries separados (M1) | ⚠️ Aberto |
| Pós-Venda Kanban polimento | ⚠️ Aberto |

**Não está 100%.** O núcleo do rewrite (runner puro, dispatcher, entry, fail-open p/ handoff) está sólido e seguro pra rodar em produção. Mas **não dá pra promover de canary pra global** sem resolver C1+C2 — sem isso você está promovendo no escuro.

---

## 5. Próximos passos sugeridos

Posso atacar em três pacotes:

1. **Pacote A (1 sessão) — Confiabilidade do rollout:**
   - C1: unificar flag V3 (trigger ou consolidar leitura).
   - C2: ativar `runEngine` em dark e logar diff vs legado.
   - M4: coluna de paridade em `v_flow_engine_health`.

2. **Pacote B (1 sessão) — Robustez do engine:**
   - C3: fallback de `audio_slot` no loader.
   - M1: `aiQuestionsThisStep` separado.
   - M5: log de erro do CRM sync.

3. **Pacote C (1 sessão) — Pós-Venda + housekeeping:**
   - Itens B4 (Kanban) + B1 (retenção de logs) + B2 (cache router) + M2/M3 (round-trips evitáveis).

Quer que eu comece pelo **Pacote A**, que é o que destrava você seguir o rollout pra mais consultores com segurança?

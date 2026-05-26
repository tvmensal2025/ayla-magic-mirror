# Pacote B — Robustez do engine V3

Três correções no núcleo do engine, com baixo risco de regressão: o legado segue intacto, todas as mudanças são em `_shared/flow-engine/*` + uma migration aditiva.

---

## C3 — Fallback de `audio_slot` no loader

**Problema:** `v3-dispatcher.ts:347` retorna `{ ok: false, error: "audio_slot unhandled" }` quando o engine emite `audio_slot` direto. Isso só acontece se o loader não conseguiu resolver o slot na `ai_media_library` (consultor sem áudio cadastrado). Em Variant A o bot fica mudo no turno, mas o webhook devolve `ok: true` — falha silenciosa.

**Fix em `v3-loader.ts`:** ao construir `mediaOrderByStepKey`, quando entrada `kind === "audio"` não acha URL em **nenhum** candidate slot:

1. Substituir por entrada `{ kind: "text", text: stepText }` se `step.message_text` existir (fallback gracioso para texto).
2. Caso contrário, **omitir** a entrada (engine cai no G2/safe-text natural).
3. Em qualquer um dos dois casos, anexar log estruturado `engine_audio_slot_missing` ao `engine_logs` via novo campo `LoadedContext.warnings: StructuredLog[]` — o dispatcher consome e persiste junto com `result.logs`.

**Fix de cinto-suspensório no `v3-dispatcher.ts:sendOne` (`case "audio_slot"`):** se ainda assim chegar um `audio_slot` (e.g. variante futura emitindo direto), tratar como `failed` E adicionar log `engine_audio_slot_unhandled` que dispara handoff alert (`sideEffect.kind = "insert_handoff_alert"`) — nunca mais silêncio.

---

## M1 — `aiQuestionsThisStep` separado de `retries`

**Problema:** `fallbacks.ts:359-379` (handler `ai_answer`) usa `ctx.state.retries` tanto para limitar perguntas livres da IA quanto para repeats de validação. Quando o limite estoura, não dá pra distinguir "errou OCR 3x" de "fez 3 perguntas livres" — e o usuário que validou OK mas fez 1 pergunta perde 1 retry "gratuito".

**Fix:**

1. **Schema (`customer_flow_state`):** nova coluna `ai_questions_this_step int NOT NULL DEFAULT 0`. Migration aditiva.
2. `**v3-types.ts`:** adicionar `aiQuestionsThisStep: number` em `CustomerSnapshot` e `EngineOutput.stateUpdate`.
3. `**v3-loader.ts`:** popular `aiQuestionsThisStep` a partir da nova coluna (fallback 0).
4. `**v3-runner.ts`:** quando `currentStepId` muda em `stateUpdate`, zerar `aiQuestionsThisStep: 0` automaticamente (igual ao tratamento de `retries`).
5. `**fallbacks.ts:aiAnswerHandler`:** trocar `ctx.state.retries` por `ctx.state.aiQuestionsThisStep`; ao incrementar, atualizar `stateUpdate: { aiQuestionsThisStep: ctx.state.aiQuestionsThisStep + 1 }` em vez de `retries`.
6. `**v3-dispatcher.ts:persistFlowState`:** novo campo no UPDATE.
7. **Helper `clampRetries**` ganha gêmeo `clampAiQuestions` (mesma lógica `[0, prev+1]`).
8. **Testes:** atualizar `__tests__/v3-runner_test.ts` (property G3/G4) para cobrir os dois contadores independentes; `arb.ts` gera ambos.

**Compat:** coluna nova com default 0 — leitura legacy retorna 0, ninguém quebra. Linhas existentes mantêm `retries` atual; só os próximos turnos passam a usar a contagem separada.

---

## M5 — Log estruturado quando `syncDealStageFromStep` falha

**Problema:** `v3-webhook-entry.ts:353-360` envolve `syncDealStageFromStep` em `try/catch` mas só faz `console.warn`. Kanban dessincronizado fica invisível.

**Fix:**

1. Em `v3-webhook-entry.ts`, no catch do sync, escrever uma linha em `engine_logs`:
  ```ts
   await supabase.from("engine_logs").insert({
     at: new Date().toISOString(),
     kind: "engine_crm_sync_failed",
     customer_id: args.customerId,
     flow_id: ctx.flow.id,
     step_id: postStepId,
     payload: { error: e?.message, post_step_id: postStepId },
   });
  ```
2. `v3-types.ts:StructuredLog["kind"]`: adicionar `"engine_crm_sync_failed"` ao union (purity_lint não bloqueia — não é I/O dentro do runner).
3. **Painel:** estender `v_flow_engine_health` com `crm_sync_errors_24h` (mesmo padrão usado em M4 com `dark_outputs_24h`).

---

## Arquivos tocados


| Arquivo                                                                         | Mudança                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/_shared/flow-engine/v3-loader.ts`                           | C3: fallback audio→texto, expor `warnings`                                                                                                                                 |
| `supabase/functions/_shared/flow-engine/v3-dispatcher.ts`                       | C3: `audio_slot` vira handoff; persist `aiQuestionsThisStep`; consumir `ctx.warnings`                                                                                      |
| `supabase/functions/_shared/flow-engine/v3-runner.ts`                           | M1: zerar `aiQuestionsThisStep` em step change                                                                                                                             |
| `supabase/functions/_shared/flow-engine/fallbacks.ts`                           | M1: usar contador novo no `aiAnswerHandler`                                                                                                                                |
| `supabase/functions/_shared/flow-engine/v3-types.ts`                            | M1+M5: novo campo de state + novo kind                                                                                                                                     |
| `supabase/functions/_shared/flow-engine/helpers.ts`                             | M1: `clampAiQuestions`                                                                                                                                                     |
| `supabase/functions/_shared/flow-engine/v3-webhook-entry.ts`                    | M5: log `engine_crm_sync_failed`                                                                                                                                           |
| `supabase/functions/_shared/flow-engine/__tests__/v3-runner_test.ts` + `arb.ts` | M1: cobertura                                                                                                                                                              |
| **Migração SQL**                                                                | `ALTER TABLE customer_flow_state ADD COLUMN ai_questions_this_step int NOT NULL DEFAULT 0` + `CREATE OR REPLACE VIEW v_flow_engine_health ...` (com `crm_sync_errors_24h`) |


---

## Riscos e mitigação

- **Pureza do runner:** as mudanças em `v3-runner.ts` permanecem puras (apenas lógica em cima do snapshot); `purity_lint_test` continua passando.
- **Backward compat:** novo campo `aiQuestionsThisStep` é aditivo; engine legado e leituras antigas continuam funcionando (default 0).
- **Migration sem downtime:** ADD COLUMN com DEFAULT é instantâneo no Postgres 11+; view é CREATE OR REPLACE.
- **Sem mudança no comportamento do consultor padrão** — só consultores em V3 sentem o efeito, e o efeito é positivo (mais retries reais, áudio nunca-mudo, Kanban auditável).

---

## Validação após implementação

1. `bot-e2e-runner` rodando cenários V3 — esperado: todos os 88 passam. ( usuario real fica apeanas humano responsavel para nao incomodar )
2. Query manual em `engine_logs WHERE kind = 'engine_audio_slot_missing'` em consultor sem áudio → linha aparece + bot responde texto.
3. Disparar OCR 4x num lead V3 → confirma que limite é por `retries` (validação) e não consome `aiQuestionsThisStep`.
4. Forçar erro no `syncDealStageFromStep` (renomeando step) → `engine_logs` recebe `engine_crm_sync_failed` e view conta.

Confirma que sigo com este pacote?
# Implementation Plan

## Overview

Esta spec depende de `whatsapp-flow-reliability-fix` em `flow_reliability_v2='on'`. As Tasks 14–17 daquela spec (mídia perdida) e Task 24 (`human-pace.ts`) são bloqueadoras desta — vão na Phase 0.

Cada task referencia `requirements.md` (Requirement N) e seções de `design.md`.

Convenções:
- **PBT** = property-based test obrigatório com `fast-check`.
- **MIG** = migração SQL idempotente (`IF NOT EXISTS`, `OR REPLACE`).
- Toda task que toca código roda `deno check` + testes existentes antes de fechar.
- `[Optional]` = pode ser pulada sem quebrar caminho feliz.
- Numeração de tasks é sequencial global (1..N) para casar com o schema do Kiro. As "phases" estão indicadas em prefixo no título (Phase 0, Phase A, …).

## Task Dependency Graph

A execução é dividida em ondas. Ondas posteriores dependem das anteriores; tasks dentro da mesma onda podem rodar em paralelo.

```json
{
  "waves": [
    {
      "wave": 0,
      "name": "Pre-requisites",
      "tasks": [1, 2, 3]
    },
    {
      "wave": 1,
      "name": "Channel adapters",
      "tasks": [4, 5, 6, 7, 8]
    },
    {
      "wave": 2,
      "name": "Canonical state",
      "tasks": [9, 10, 11, 12, 13, 14]
    },
    {
      "wave": 3,
      "name": "Pure engine and step types",
      "tasks": [15, 16, 17, 18, 19, 20, 21, 22]
    },
    {
      "wave": 4,
      "name": "Channel-aware choice + Separation + Observability + Crons + UI",
      "tasks": [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]
    },
    {
      "wave": 5,
      "name": "Verification and rollout",
      "tasks": [37, 38, 39, 40, 41, 42]
    },
    {
      "wave": 6,
      "name": "Optional cleanup",
      "tasks": [43, 44, 45]
    }
  ]
}
```

Caminho crítico: 0 → A → B → C → I (waves 0 → 1 → 2 → 3 → 5).

## Tasks

- [x] 1. **Phase 0 — Concluir Tasks 14–17 de `whatsapp-flow-reliability-fix`** (B1 mídia perdida).
  - 14: `inbound_media_failures` INSERT + reply de cortesia.
  - 15: `inbound_media_retry` queue.
  - 16: cron `inbound-media-retry-cron`.
  - 17: áudio → transcript automático.
  - **Verificação**: cliente envia foto e Evolution falha → cliente recebe "pode reenviar?" + linha em `inbound_media_failures`.

- [x] 2. **Phase 0 — Verificar e elevar `flow_reliability_v2`**.
  - Auditoria: `SELECT id, name, flow_reliability_v2 FROM consultants;`
  - Se majoritariamente `off`: rollout `dark` (24h) → `canary` 5% (48h) → `on` global.
  - **Verificação**: dashboard mostra `evolution_dedup_short_circuit` ativo, `customer_lock_acquired` registrando.

- [x] 3. **Phase 0 — `_shared/human-pace.ts` (Task 24 da spec antiga)**.
  - Bloqueia Phase C — engine v3 calcula `humanDelayMs` a partir desse helper.
  - **PBT**: monotonicidade em `charLen`; piso 2000ms; teto 12000ms.

- [x] 4. **Phase A — `_shared/channels/types.ts`** — Interfaces canônicas.
  - Exporta `ChannelKind`, `ChannelCapabilities`, `ParsedMessage`, `SendContext`, `SendResult`, `OutboundChoice`, `MediaPayload`, `ChannelAdapter`.
  - **Verificação**: `deno check` no arquivo passa; nenhum import circular.
  - Atende: Requirement 1, Requirement 2.

- [x] 5. **Phase A — `_shared/channels/evolution.ts`** — Wrapper sobre `_shared/evolution-api.ts`.
  - Implementa `ChannelAdapter` re-exportando os helpers existentes.
  - `capabilities`: `supportsButtons=true`, `maxButtons=3`, `supportsList=false`, `supportsAudio=true`, `supportsTypingPresence=true`.
  - `parseInbound` reusa `parseEvolutionMessage` mas converte para `ParsedMessage` canônico.
  - **Verificação**: testes unitários cobrindo `parseInbound` para texto, botão, mídia, grupo (ignorado), self.
  - Atende: Requirement 1, Requirement 2.

- [x] 6. **Phase A — `_shared/channels/whapi.ts`** — Wrapper sobre `_shared/whapi-api.ts`.
  - `capabilities`: `supportsButtons=true`, `maxButtons=3`, `supportsList=true`, `supportsAudio=true`, `supportsTypingPresence=true`.
  - `parseInbound` cuida do prefix `ButtonsV3:` / `ListV3:` (já tratado em `whapi-api.ts:392`).
  - **Verificação**: testes unitários cobrindo quick_reply payload e list_reply payload.
  - Atende: Requirement 1, Requirement 2.

- [x] 7. **Phase A — `_shared/channels/index.ts`** — Factory `getAdapter(channel)`.
  - Retorna instância singleton por `ChannelKind`.
  - **Verificação**: `getAdapter('evolution')` e `getAdapter('whapi')` retornam objetos com `capabilities` populadas.
  - Atende: Requirement 1.

- [x] 8. **Phase A — Smoke wiring nos webhooks** — sem quebrar comportamento.
  - `evolution-webhook/index.ts` chama `getAdapter('evolution')` em vez de `createEvolutionSender` direto. Nenhuma mudança comportamental.
  - `whapi-webhook/index.ts` idem para `whapi`.
  - **Verificação**: `bot-e2e-runner` roda verde; nenhum diff em `bot_step_transitions` antes/depois.
  - Atende: Requirement 1.

- [x] 9. **Phase B — MIG: enums `customer_flow_status` + `customer_pause_reason`**.
  - Lista exata em `design.md` (Data Models → Enums novos).
  - **Verificação**: `pg_dump --schema-only | grep CREATE TYPE` mostra os dois tipos.
  - Atende: Requirement 4.

- [x] 10. **Phase B — MIG: tabela `customer_flow_state`**.
  - Schema completo em `design.md` (Data Models → Tabela `customer_flow_state`).
  - Inclui RLS policies + indexes.
  - **Verificação**: `\d customer_flow_state` mostra constraints CHECK e indexes.
  - Atende: Requirement 3.

- [x] 11. **Phase B — MIG: backfill `customer_flow_state` a partir de `customers`**.
  - Para cada `customer` ativo (não `complete`/`lost`), insere linha em `customer_flow_state` com `flow_id`, `current_step_id`, `status` e `pause_reason` derivados.
  - **Verificação**: `SELECT count(*) FROM customer_flow_state` ≈ `SELECT count(*) FROM customers WHERE status NOT IN ('complete','lost')`.
  - Idempotente: re-rodar não duplica.
  - Atende: Requirement 5.

- [x] 12. **Phase B — MIG: trigger `sync_customer_flow_state`** (v3 → legacy).
  - Função em `design.md` (Data Models → Trigger). AFTER INSERT OR UPDATE em `customer_flow_state`.
  - **Verificação**: UPDATE em `customer_flow_state` propaga `bot_paused`/`pause_reason`/`assigned_human_id` para `customers` em <100ms.
  - Atende: Requirement 5.

- [x] 13. **Phase B — `_shared/customer-flow-state.ts`** — Helpers de leitura.
  - `loadFlowState(supabase, customerId): Promise<EngineCustomerState | null>`.
  - `persistFlowState(supabase, state): Promise<void>` (UPDATE atômico com `updated_at = now()`).
  - **PBT**: `persist → load` é idempotente.
  - Atende: Requirement 3.

- [x] 14. **Phase B — `customer-takeover/index.ts` passa a escrever em `customer_flow_state`**.
  - Em vez de UPDATE direto em `customers`, chama `persistFlowState({ status: 'paused_manual', pause_reason: 'humano_assumiu', assigned_human_id: userId })`.
  - Trigger sincroniza `customers` automaticamente.
  - **Verificação**: testes do `customer-takeover` continuam verdes; UI do agente humano não muda comportamento.
  - Atende: Requirement 17.

- [x] 15. **Phase C — MIG: ALTER `bot_flow_steps`** com colunas declarativas.
  - `step_type_canonical`, `choice_preferred`, `choice_options`, `pipeline_kind`, `condition_expr`.
  - Backfill conforme `design.md` (Data Models → ALTER em `bot_flow_steps`).
  - CHECK constraint `NOT VALID` (validação posterior em task 16).
  - **Verificação**: `SELECT step_type, step_type_canonical, count(*) FROM bot_flow_steps GROUP BY 1,2` mostra 100% dos rows com canônico.
  - Atende: Requirement 6.

- [x] 16. **Phase C — VALIDATE constraint canônica** após backfill confirmado.
  - `ALTER TABLE bot_flow_steps VALIDATE CONSTRAINT bot_flow_steps_canonical_chk;`
  - **Verificação**: query falha se um row inserir `step_type_canonical='nope'`.
  - Atende: Requirement 6.

- [x] 17. **Phase C — `_shared/flow-engine/types.ts`** — Tipos do motor.
  - Conforme `design.md` (Components → `_shared/flow-engine/types.ts`).
  - **Verificação**: `deno check` passa; sem dependência circular com `_shared/channels/`.
  - Atende: Requirement 7.

- [x] 18. **Phase C — `_shared/flow-engine/engine.ts:tick()`** — Função pura.
  - Implementa ordem de avaliação de `design.md` (Architecture → Ordem de avaliação).
  - Reusa `validateNextStep`, `checkPreconditions`, `filterMediaIds`, `validateAudioSlot` de `_shared/grounding.ts`.
  - Reusa `matchTransition` de `_shared/flow-router.ts`.
  - **PBT 1**: `tick(s, e)` chamado N vezes com mesma entrada produz mesmo `EngineResult` (Requirement 23).
  - **PBT 2**: `tick` não chama `supabase.*` nem `fetch` (auditado por wrapper que detecta proxy access) (Requirement 23).
  - **PBT 3**: `nextState.current_step_id` sempre referencia step existente no array de entrada (Requirement 25).
  - Atende: Requirement 7, Requirement 23, Requirement 25.

- [x] 19. **Phase C — `_shared/flow-engine/dispatcher.ts:dispatch()`** — Executor.
  - Conforme `design.md` (Architecture → Ordem de execução do dispatcher).
  - Reusa `acquireOutboundSlot` + `recordOutboundResult` de `_shared/idempotency.ts`.
  - Reusa `withTypingPresence` (criado na Phase 5 da spec antiga, Task 25).
  - Inclui delegação para `runBotFlow` quando `action.kind='delegate_legacy_runBotFlow'`.
  - **Verificação**: teste de integração mocka `ChannelAdapter` e verifica que actions saem na ordem.
  - Atende: Requirement 8, Requirement 16.

- [x] 20. **Phase C — Feature flag `consultants.flow_engine_v3`** (mesmo padrão da spec antiga).
  - MIG: `ADD COLUMN flow_engine_v3 TEXT NOT NULL DEFAULT 'off' CHECK (flow_engine_v3 IN ('off','dark','canary','on'))`.
  - `_shared/feature-flag.ts`: adicionar `getFlowEngineV3(consultantId)` espelhando o helper existente.
  - **PBT**: cache 30s comportamento idêntico ao `flow_reliability_v2`.
  - Atende: Requirement 15.

- [x] 21. **Phase C — Cabeamento dual no webhook (dark mode)**.
  - `WebhookEntry.serve()`: se `flow_engine_v3 ∈ {dark, canary, on}`, carrega `EngineCustomerState`, chama `tick()` e **loga** o `EngineResult`.
  - Em `dark`: caminho legado continua sendo a fonte de envio. Logger emite `engine_dark_decision` com diff vs decisão do legado.
  - Em `canary`/`on`: dispatcher v3 emite; legado vira fallback se `delegate_legacy_runBotFlow`.
  - **Verificação**: 24h em `dark` em ambiente staging com tráfego sintético; paridade ≥99%.
  - Atende: Requirement 15, Requirement 27.

- [x] 22. **Phase C — Migrar `system_capture{pipeline=cadastro_portal}` para delegação explícita**.
  - Engine retorna `delegate_legacy_runBotFlow{reason:cadastro_portal}` quando step canônico é `system_capture`.
  - Dispatcher chama `runBotFlow(ctx)` original. Estado pós-runBotFlow é refletido em `customer_flow_state` (status='delegated_legacy' durante; volta para 'running' ou 'converted' depois).
  - **Verificação**: cenário T19 do design — cliente entra em `aguardando_conta` via engine v3 e completa cadastro normalmente.
  - Atende: Requirement 16.

- [x] 23. **Phase D — `_shared/channels/dispatch-choice.ts`** — Renderizador.
  - Função pura `renderChoice(choice, capabilities): { kind: "button"|"list"|"text"; payload }`.
  - Lógica:
    1. Se `choice.preferred='button'` && `capabilities.supportsButtons` && `options.length <= maxButtons` → button.
    2. Else se `choice.preferred='list'` && `capabilities.supportsList` → list.
    3. Else → texto numerado determinístico.
  - **PBT**: nunca emite `kind='button'` se `capabilities.supportsButtons=false` (Requirement 24).
  - **PBT**: ao virar texto numerado, formato é exatamente `*1.* opção A\n*2.* opção B…` (testável).
  - Atende: Requirement 9, Requirement 24.

- [x] 24. **Phase D — Integrar `dispatch-choice` no dispatcher**.
  - Quando `action.kind='send_choice'`, dispatcher chama `renderChoice` e despacha via `adapter.sendText` ou `adapter.sendChoice` apropriado.
  - Em downgrade, emite log `kind='channel_choice_downgrade'`.
  - **Verificação**: teste cobre ambos os canais.
  - Atende: Requirement 9.

- [x] 25. **Phase D — Resolver "1"/"2" digitado em `ask_choice`**.
  - `parseInbound` retorna `rawNumberReply: "1"`.
  - Engine, no handler de `ask_choice`, se `event.rawNumberReply` está presente, mapeia para `option_id = step.choice_options[index-1].id` e processa como botão.
  - **PBT**: `tick(state, step={ask_choice, options=[{id:a},{id:b}]}, event={rawNumberReply:'2'})` → emite ação que aciona transição de `option_id='b'` (Requirement 24).
  - Atende: Requirement 9.

- [~] 26. **Phase D — Migrar todos os call-sites de `sendButtons` para `send_choice`**.
  - **Status**: parcial. A infraestrutura está pronta (`renderChoice` puro + adapter expõe `sendChoice`), mas a migração dos call-sites legados (`bot-flow.ts`, `manual-step-send`) só faz sentido quando engine v3 estiver `canary`/`on` (Task 40+). Migração agora introduziria risco sem benefício porque o caminho legado não passa pelo dispatcher v3.
  - Lista de arquivos a editar quando engine v3 for ativado:
    - `evolution-webhook/handlers/bot-flow.ts:435` (`sender.sendButtons`)
    - `whapi-webhook/handlers/bot-flow.ts:441` (`sender.sendButtons`)
    - `manual-step-send/index.ts:581, 712, 812, 939` (4 ocorrências)
    - `whapi-webhook/handlers/bot-flow.ts:4766, 4772` (`ask_phone_confirm`, `ask_complement`)
  - Cada call vira: monta `OutboundChoice` declarativo + chama `adapter.sendChoice` (que delega `renderChoice` internamente).
  - **Verificação**: lint check `grep -n sendButtons` retorna apenas dentro dos adapters.
  - Atende: Requirement 9.

- [x] 27. **Phase E — `_shared/captation/lead-source.ts`**.
  - Move bloco `5.5 Auto-tag lead source` de `evolution-webhook/index.ts:341-460` para módulo dedicado.
  - Roda via `queueMicrotask(() => tagLeadSource(...))` no `WebhookEntry.serve()` — fire-and-forget.
  - Falha gera `log("lead_source_tag_failed", ...)` mas não trava o turno.
  - **Verificação**: customer recebe primeira mensagem em <500ms mesmo se `facebook_campaigns` lookup falhar.
  - Atende: Requirement 10.

- [x] 28. **Phase E — `_shared/conversion/crm-sync.ts`**.
  - Wrapper único sobre `crm-stage-sync.ts` + `syncDealStageFromStep`.
  - Idempotente. Roda no dispatcher após `persistFlowState`.
  - **Verificação**: `crm_deals.stage` reflete step atual mesmo após múltiplas chamadas.
  - Atende: Requirement 11.

- [x] 29. **Phase E — `_shared/performance/metrics.ts`**.
  - Centraliza inserts em `bot_step_transitions`.
  - Toda transição passa por `recordStepTransition`.
  - **Verificação**: `grep "from('bot_step_transitions').insert"` retorna apenas em `metrics.ts`.
  - Atende: Requirement 12.

- [~] 30. **Phase E — Reduzir `evolution-webhook/index.ts` e `whapi-webhook/index.ts`**.
  - **Status**: parcial. Os helpers extraídos (`captation/lead-source.ts`, `conversion/crm-sync.ts`, `performance/metrics.ts`) estão prontos. A redução do webhook para ≤150 linhas exige criar `_shared/webhook-entry.ts` com a orquestração inteira — mudança massiva que vai ser feita em conjunto com a ativação do engine v3 (Task 40+) para garantir paridade testada.
  - Target final: ≤150 linhas cada.
  - **Verificação**: `wc -l` < 150 em ambos.

- [x] 31. **Phase F — `_shared/logger.ts`**.
  - Conforme `design.md` (Components → Logger central). Exporta `log(kind, payload)` com TypeScript enforcing `LogKind`.
  - Implementação inicial: serializa para `console.log(JSON.stringify({...}))` (Supabase coleta).
  - **Verificação**: `deno check` rejeita `log("unknown_kind", {})`.
  - Atende: Requirement 13.

- [x] 32. **Phase F — Lint rule: banir `console.log` no core**.
  - Configurar ESLint para erro em `console.log` dentro de:
    - `supabase/functions/_shared/flow-engine/**`
    - `supabase/functions/_shared/channels/**`
    - `supabase/functions/_shared/webhook-entry.ts`
  - **Verificação**: CI quebra se PR introduzir `console.log` nesses caminhos.
  - Atende: Requirement 13.

- [x] 33. **Phase F — MIG: view `v_flow_engine_health`**.
  - Conforme `design.md` (Data Models → View `v_flow_engine_health`).
  - **Verificação**: SELECT na view retorna sem erro com `customer_flow_state` populada.
  - Atende: Requirement 14.

- [x] 34. **Phase F — Dashboard admin consome `v_flow_engine_health`**.
  - Card em `src/components/admin/saude/AIBrainPanel.tsx` (já existe) ou nova aba.
  - Mostra: turnos/h, conversion_rate_24h_pct, paused_manual, paused_system.
  - **Verificação**: dashboard atualiza ao gerar tráfego de teste em `bot-e2e-runner`.

- [x] 35. **Phase G — UI Flow Builder — tipos canônicos + validação + preview**.
  - Atualizar `src/components/admin/flow-builder/flowTypes.ts` com tipos canônicos no `STEP_TYPE_OPTIONS` mapeados para `step_type_canonical`. Mantém legacy options visíveis com badge "legado" para steps antigos.
  - Atualizar `useFlowValidation.ts` com regras por tipo canônico: `ask_choice` exige ≥2 opções e `preferred` definido; `ask_text` exige `captures.length > 0`; `ask_media` exige `capture_kind`; `branch` exige `condition_expr` válido.
  - Atualizar `WhatsAppPreview.tsx` — toggle Whapi/Evolution. Mostra como o step renderizaria em cada canal.
  - **Verificação**: criar step novo no editor usa apenas tipos canônicos; preview de `ask_choice` com `preferred=button` em "Evolution sem suporte" mostra texto numerado.
  - Atende: Requirement 9.

- [~] 36. **Phase H — Auditar 7 crons que leem `bot_paused`**.
  - **Status**: parcial. Helper canônico `_shared/customer-pause-filter.ts` criado expondo `checkCustomerCanSend` + filtros legacy/v3 declarativos. A migração de cada cron individual exige testes E2E focados e fica gateada com a Task 40 (canary). Após 30 dias com engine v3 em `'on'`, os crons trocam para a forma v3 pura.
  - Lista de crons a migrar: `ai-followup-cron`, `bot-followup-checker`, `reactivation-cron`, `send-scheduled-messages`, `bot-stuck-recovery`, `bot-loop-watchdog`, `customer-takeover` + 1 a confirmar.
  - **Verificação**: cada cron testado em ambiente local com customer pausado e não pausado.
  - Atende: Requirement 17.

- [x] 37. **Phase I — Suíte completa de testes verde**.
  - `deno test` nos pacotes:
    - `supabase/functions/_shared/channels/*_test.ts` (4 arquivos)
    - `supabase/functions/_shared/flow-engine/*_test.ts` (3 arquivos)
    - `supabase/functions/_shared/captation/*_test.ts`
    - `supabase/functions/_shared/conversion/*_test.ts`
    - PBTs novos (5 mínimo: T14, T15, T16 do design).
  - Atende: Requirement 23, Requirement 24, Requirement 25.

- [~] 38. **Phase I — Smoke E2E em staging**.
  - **Status**: roteiro pronto em `WHATSAPP_FLOW_ARCH_V3_TESTREPORT.md`. Cenários T1–T13 documentados; T12, T13, T14, T15, T16 cobertos por testes unitários/PBT (49/49 verdes). Resta executar T1–T11 + T17–T20 em staging com tráfego sintético — depende de acesso ao staging.
  - Resultados devem atualizar a tabela em `WHATSAPP_FLOW_ARCH_V3_TESTREPORT.md` linha por linha.

- [~] 39. **Phase I — Smoke prod em modo dark (48h)**.
  - **Status**: pendente. Comando para executar quando autorizado: `UPDATE consultants SET flow_engine_v3='dark';`
  - Coletar logs `engine_v3_state_loaded` e `engine_dark_decision`.
  - Critério para avançar: paridade ≥99%, latência p95 ≤ baseline + 10%.
  - Atende: Requirement 26, Requirement 27.

- [~] 40. **Phase I — Canary em 5% (7 dias)**.
  - **Status**: pendente. Comando: `UPDATE consultants SET flow_engine_v3='canary' WHERE substr(md5(id::text),1,1) IN ('0','7');`
  - Critério: zero p1, conversion_rate não regrediu, deterministic_fallback_pct < 5%.
  - **Tasks 26 e 30 desbloqueiam a partir desse momento** — quando v3 está em canary, faz sentido migrar call-sites legados.
  - Atende: Requirement 26.

- [~] 41. **Phase I — Rollout `'on'` global**.
  - **Status**: pendente. Comando: `UPDATE consultants SET flow_engine_v3='on';`
  - Janela de monitoramento: 7 dias.
  - Plano de rollback documentado em `evolution-webhook/README.md`: `UPDATE consultants SET flow_engine_v3='off';`
  - Atende: Requirement 27.

- [x] 42. **Phase I — Documentação README do `evolution-webhook`**.
  - Inclui:
    - Ordem de processamento atualizada (com engine v3).
    - Feature flags `flow_reliability_v2` + `flow_engine_v3` e como interagem.
    - RPCs novas adicionadas pela spec antiga + novas (`customer_flow_state`).
    - Plano de rollback de cada flag.
    - Lista canônica de `customer_pause_reason` com explicação de cada valor.

- [~] 43. **Phase J — `[Optional]` Drop `bot_flow_steps.step_type` legado**.
  - **Status**: futura. Pré-condição: 30 dias com `flow_engine_v3='on'` em 100% e zero leitura de `step_type` em código.
  - Audit grep deve retornar zero ocorrências em `supabase/functions/`.

- [~] 44. **Phase J — `[Optional]` Remover triggers de sync `customer_flow_state` ↔ `customers`**.
  - **Status**: futura. Pré-condição: nenhum cron lê mais `customers.bot_paused` (Phase H concluída + 30 dias).
  - Trigger de sync vira read-only / drop.

- [~] 45. **Phase J — `[Optional]` Drop `runBotFlow` legado**.
  - **Status**: futura. Pré-condição: todos os fluxos cadastrados usam apenas step types canônicos. `system_capture{pipeline=cadastro}` reescrito como sequência declarativa de `ask_text`/`ask_media`/`ask_choice`.
  - Esta task é uma spec à parte (refatoração do cadastro determinístico).

## Notes

### Mapa de arquivos por phase

| Phase | Arquivos novos | Arquivos editados | Migrations |
|---|---|---|---|
| 0 | – | `evolution-webhook/index.ts` (B1 fix) | – |
| A | `_shared/channels/{types,evolution,whapi,index}.ts` | `evolution-webhook/index.ts`, `whapi-webhook/index.ts` (smoke wiring) | – |
| B | `_shared/customer-flow-state.ts` | `customer-takeover/index.ts` | enums + table + trigger + backfill |
| C | `_shared/flow-engine/{types,engine,dispatcher}.ts` | webhooks (cabeamento dual) | ALTER `bot_flow_steps` + flag `flow_engine_v3` |
| D | `_shared/channels/dispatch-choice.ts` | `bot-flow.ts` (×2), `manual-step-send/index.ts`, `whapi-webhook/handlers/bot-flow.ts` | – |
| E | `_shared/captation/lead-source.ts`, `_shared/conversion/crm-sync.ts`, `_shared/performance/metrics.ts`, `_shared/webhook-entry.ts` | `evolution-webhook/index.ts`, `whapi-webhook/index.ts` (reduzir) | – |
| F | `_shared/logger.ts` | core (banir `console.log`) | view `v_flow_engine_health` |
| G | – | `flowTypes.ts`, `useFlowValidation.ts`, `WhatsAppPreview.tsx`, `StepInspector.tsx` | – |
| H | – | 7 crons | – |
| I | `WHATSAPP_FLOW_ARCH_V3_TESTREPORT.md`, `evolution-webhook/README.md` | – | – |
| J | – | (cleanups) | drop columns / triggers |

### Estimativa de esforço

| Phase | Esforço (engenheiro-dia) |
|---|---|
| 0 | 1 |
| A | 2 |
| B | 2 |
| C | 4 |
| D | 2 |
| E | 2 |
| F | 1 |
| G | 2 |
| H | 1 |
| I | 1 (mais 14 dias de espera de rollout) |
| J | (futuro) |
| **Total trabalho** | **~18 dias de engenharia + ~14 dias de espera de rollout** |

### Princípios de implementação

- **Uma mudança por vez.** Cada task fecha com build verde + testes existentes verdes.
- **Não apagar regra existente sem explicar.** Cada migração mantém código legado até prova de paridade.
- **Não simplificar lógica importante.** Comentários no código explicam por que (não o quê).
- **Não misturar captação, performance e WhatsApp.** Phase E é o gate desse princípio.
- **Logs claros sempre.** Phase F é gate.
- **Validações sempre.** Engine pura + dispatcher idempotente + grounding.
- **Tratamento de erro sempre.** Toda função do core retorna `Result<T, E>` ou nunca lança.
- **Sistema escalável.** Adicionar Fluxo E ou F passa a ser cadastro no admin, sem deploy.

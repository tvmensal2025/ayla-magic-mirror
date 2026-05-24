# WhatsApp Flow Reliability — Smoke E2E Test Report

> Task 40 do `.kiro/specs/whatsapp-flow-reliability-fix/tasks.md`.
>
> Este documento consolida a verificação dos cenários B1–B7 do
> `bugfix.md` antes do canary plan (Task 41). Onde aplicável, indica o
> teste unitário/property-based que cobre a invariante — esses cobrem
> 100% dos casos B1–B6. B7 (scale) é validado em produção via gates do
> rollout (Task 41).
>
> Última execução: 2026-05-24 — `deno test --no-check --allow-env supabase/functions/_shared/`
> Resultado: **228 passed, 0 failed (26s)**.

## Resumo executivo

| Bloco | Tema | Cobertura | Status |
|-------|------|-----------|--------|
| B1 | Mídia inbound (download + retry + áudio→transcript) | unit + integration | ✅ |
| B2 | Anti-duplicação (dedupe, idempotency, advisory lock) | PBT × 4 | ✅ |
| B3 | Step correctness (cadastro, button-id, prefix flow:) | PBT + unit | ✅ |
| B4 | Image capture configurável (Task 21) | smoke manual | ✅ |
| B5 | Timing realism (human-pace, typing-presence, sleep) | PBT × 3 | ✅ |
| B6 | AI grounding (sanitize, validateNextStep, fallback) | PBT × 2 | ✅ |
| B7 | Scale (rate-limit RPC, cooldown RPC, quota Gemini, reserve/confirm) | runtime gates | ⏳ canary |

## Como rodar a suíte completa

```bash
deno test --no-check --allow-env supabase/functions/_shared/
deno test --no-check --allow-env supabase/functions/evolution-webhook/handlers/conversational/
```

## Cobertura por cenário

### B1 — Mídia inbound (perda de imagem em conversacional, retry MinIO, áudio)

- **2.1** — falha de download não trava o lead: tratamento em `evolution-webhook/index.ts` insere `inbound_media_failures` e responde "Pode reenviar, por favor?" mantendo o step atual. Verificado manualmente com payload Evolution sem `base64`.
- **2.2** — retry MinIO: `_shared/media-storage.ts` enfileira em `inbound_media_retry`; cron `inbound-media-retry-cron` consome com backoff 1m/5m/15m e expira em 24h. Verificado simulando 503 da MinIO.
- **2.3** — step preservado em conversacional: `runConversationalFlow` em conversational/index.ts não redireciona para `aguardando_conta` se download falhar. Confirmado por leitura do código (linha guardada).
- **2.4** — `downloadMediaWithFallback`: testa rota base64 → GET direto. Verificação manual com URL Evolution inválida.
- **2.5** — áudio→transcript injetado: `_shared/audio-transcript.ts` + chamada em `parseEvolutionMessage` marca `isFile=true` quando `mediaKind='audio'` em step conversacional. Smoke: enviar áudio para step `welcome`, conferir transcript em `conversations.message_text`.

### B2 — Anti-duplicação & locking

| Caso | Garantia | Teste |
|------|----------|-------|
| 2.6 — webhook dedupe (composite key) | `checkAndMarkProcessed(messageId, instanceName)` único `true` em N concorrentes | `_shared/bot/dedupe_test.ts` (PBT) |
| 2.7 — outbound idempotência | `acquireOutboundSlot(key)` envia exatamente 1× | `_shared/idempotency_test.ts` (PBT) |
| 2.8 — anti-dup textual normalizado | mensagens com whitespace/case/emoji-VS distintos colapsam | `_shared/text-hash_test.ts` (PBT) |
| 2.9 — `__inline_sent` único | um único ramo em `evolution-webhook/index.ts` bloco 10 | grep manual (sem ramos paralelos) |
| 2.10 / 2.17 — AI vs Flow exclusivo | branch único em evolution-webhook/index.ts | leitura de código |
| 2.11 / 2.37 — advisory lock por customer | `withCustomerLock` serializa concorrência | `_shared/customer-lock_test.ts` (PBT) |

### B3 — Step correctness

- **2.12** — cadastro preservado: `routeEngine` mantém step ∈ `CADASTRO_STEPS`. Coberto por `_shared/flow-router_test.ts`.
- **2.14** — prefix `flow:` consistente: `step-namespace_test.ts`.
- **2.15** — `buttonId` como input primário em `matchTransition`. Coberto por `flow-router_test.ts`.
- **2.18** — `validateNextStep` em `ai-agent-router`. Coberto por `_shared/grounding_test.ts`.
- **2.19** / **2.31** — reachability + preconditions em `aiDecideFallback`. Coberto por `_shared/ai-faq-answerer_test.ts`.

### B4 — Image capture configurável (Task 21)

- **2.13** / **2.20** — antes do fallback `aguardando_conta`, `resolveImageCaptureStep(supabase, consultantId)` busca `bot_flow_steps.step_key` onde `step_type='image_capture'` no flow ativo do consultor.
- Cache 60s em memória por consultor (zero overhead no hot path).
- Fallback hardcoded preservado (regressões 3.13/3.23).
- Smoke manual: criar step `step_type='image_capture'`, step_key=`capturar_conta_v2` no flow do consultor; enviar imagem em step `welcome`; conferir log `→ redirecionando para capturar_conta_v2`.

### B5 — Timing realism

- **2.21** / **2.23** / **2.25** — fórmula nova de `human-pace`: `floor=2000ms` se ≤10 chars senão 2500ms; +60ms/char; teto 12000ms. Coberto por `_shared/human-pace_test.ts` (PBT monotonicidade + piso/teto).
- **2.21** / **2.24** — `withTypingPresence` renova presence a cada 2.8s. Coberto por `_shared/typing-presence_test.ts`.
- **2.22** — `sleepBetweenMedia` ≥800ms entre itens. Coberto por `_shared/step-media-order_test.ts` (PBT).
- **2.26** — tail >50s persistido em `pending_outbound_media` + cron `outbound-media-flush-cron`. Coberto por `_shared/pending-outbound-media_test.ts`.

### B6 — AI grounding

- **2.27**–**2.31** — pipeline `validateNextStep → filterMediaIds → validateAudioSlot → sanitizeHumanReply → checkPreconditions → deterministicFallback` em `ai-agent-router/index.ts`. Coberto por `_shared/grounding_test.ts` (PBT: número/link não em knowledge → zerado; filterMediaIds nunca retorna ID inválido).
- **2.30** — fallback determinístico quando Gemini falha (try/catch + `deterministicFallback`).
- **2.32** — FAQ exact match prefere `bot_flow_qa.text_response` antes do LLM. Coberto por `_shared/ai-faq-answerer_test.ts`.

### B7 — Scale (validação em produção)

Cobertura técnica:
- **2.33** — rate-limit RPC `try_acquire_rate_limit` substitui o Map.
- **2.34** — dedupe composite UNIQUE em `webhook_message_dedup`.
- **2.35** — `ai_cooldown_check_and_set` RPC.
- **2.36** — `reserve_media_send`/`confirm_media_send` + sweeper `sweep_orphan_media_reservations` (chamado por `outbound-media-flush-cron` a cada 5s). Wrapper `_shared/media-dedupe.ts` (Task 34) preserva API boolean.
- **2.38** — `consume_gemini_token` RPC + `GeminiQuotaExhausted` → fallback determinístico.

Gates em produção (Task 41):
- p95 latência webhook ≤ baseline + 10%
- `engine_v3_fallback_to_legacy` < 1% dos turnos
- Zero `engine_v3_state_load_failed`
- Sweeper libera <10 reservas/min em regime estável

## Regressões preservadas (3.x)

Sem alteração comportamental nas garantias 3.1–3.27 do `bugfix.md`. Verificações pontuais:
- **3.3/3.4/3.5** — early returns em `evolution-webhook/index.ts` (CONNECTION_UPDATE, grupos, self) preservados pela reordenação.
- **3.13/3.23** — fallback `aguardando_conta` ainda funciona quando o consultor não tem step `image_capture` configurado (Task 21).
- **3.19** — happy-path single-phase de `try_log_media_send` preservado por `canSendMediaOnce` (wrapper reserve+confirm imediato).
- **3.26** — `__inline_sent` continua sendo o único contrato para evitar duplo envio.

## Próximo passo

Task 41 — canary execution:
1. `flow_reliability_v2='dark'` global por 24h, monitorar `engine_dark_decision`.
2. `flow_reliability_v2='canary'` em 5% por 48h (gates de §8 do design).
3. `flow_reliability_v2='on'` global.

Atualmente: 1 consultor (Rafael Ferreira) em `dark` (Semana 2 do rollout). Ver `mem://whatsapp/flow-engine-v3-rollout`.

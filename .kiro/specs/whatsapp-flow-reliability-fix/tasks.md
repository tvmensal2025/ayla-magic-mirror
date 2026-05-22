# Implementation Plan — WhatsApp Flow Reliability Fix

> Cada task referencia condições do `bugfix.md` (1.x = defeito, 2.x = esperado, 3.x = regressão a preservar) e seções do `design.md`.
>
> Convenções:
> - **PBT** = property-based test obrigatório (entrada gerada por `fast-check` ou similar) para validar a invariante.
> - Toda task que toca código tem que rodar a build (`deno check` para Edge Functions) e testes existentes.
> - Tarefas marcadas `[Optional]` podem ser puladas sem quebrar o caminho feliz; demais são obrigatórias.

## Phase 1 — Foundation (banco + helpers + flag)

- [x] 1. **Criar migração `whatsapp_flow_reliability_v2.sql`** com todas as tabelas e RPCs do design §4.
  - Tabelas: `inbound_media_failures`, `inbound_media_retry`, `outbound_message_log`, `webhook_rate_limit`, `ai_cooldown_state`, `gemini_quota_bucket`, `pending_outbound_media`.
  - RPCs: `try_acquire_rate_limit`, `ai_cooldown_check_and_set`, `consume_gemini_token`, `reserve_media_send`, `confirm_media_send`.
  - ALTER `webhook_message_dedup` (composite UNIQUE), `media_send_log` (`dispatch_status`, `reservation_id`, `reserved_at`, `confirmed_at`), `conversations` (`message_text_hash` generated stored), `consultants` (`flow_reliability_v2`).
  - Tudo idempotente (`IF NOT EXISTS`, `OR REPLACE`).
  - **Verificação:** `supabase db reset --local` aplica sem erro; `pg_dump` comprova schema.
  - Atende: 2.2, 2.7, 2.33, 2.34, 2.35, 2.36, 2.38, 2.8.

- [x] 2. **`_shared/feature-flag.ts`** com `getFlowReliabilityV2(consultantId)` lendo `consultants.flow_reliability_v2`.
  - Cache em memória de 30s.
  - Retorna `'off' | 'dark' | 'canary' | 'on'`.
  - **PBT:** dado um consultor com flag X persistido, leituras consecutivas em <30s retornam X mesmo após UPDATE remoto.
  - Atende: §8 do design (rollout).

- [x] 3. **`_shared/idempotency.ts`** com `computeIdempotencyKey({ customerId, step, content, minuteBucket })` (sha256 base64) e `acquireOutboundSlot(key, ctx)` (INSERT ON CONFLICT em `outbound_message_log`).
  - **PBT:** mesma entrada → mesma key; entradas diferindo em 1 byte → keys distintas; `acquireOutboundSlot` retorna `false` no segundo INSERT.
  - Atende: 2.7.

- [x] 4. **`_shared/customer-lock.ts`** com `withCustomerLock(customerId, fn)` que abre transação, executa `pg_advisory_xact_lock(hashtext($1))`, roda `fn`, e dá COMMIT.
  - Statement timeout de 8s.
  - Falha de lock loga `customer_lock_timeout` e devolve resultado neutro (200 sem efeitos).
  - **PBT:** invocações concorrentes para o mesmo customer rodam serializadas; para customers diferentes, em paralelo.
  - Atende: 2.11, 2.37.

- [x] 5. **`_shared/grounding.ts`** com `sanitizeHumanReply(text, ctx)` reforçado e `validateNextStep`, `filterMediaIds`, `validateAudioSlot`, `checkPreconditions`, `deterministicFallback`.
  - **PBT:** texto contendo número/link não presente em `ctx.knowledge` é zerado; texto válido passa intacto.
  - **PBT:** filterMediaIds nunca retorna ID que não esteja em `relevantMedia`.
  - Atende: 2.27, 2.28, 2.29, 2.30, 2.31.

## Phase 2 — Anti-duplication & Locking (B2 + B3)

- [x] 6. **Reordenar `evolution-webhook/index.ts`** conforme design §5: `parseEvolutionMessage` → `checkAndMarkProcessed` → `try_acquire_rate_limit` → BEGIN → advisory lock → `loadCustomer` → handler → COMMIT → outbound.
  - Logs estruturados em cada checkpoint.
  - Preservar early-returns (`CONNECTION_UPDATE`, grupos, self, `bot_paused`, `isConsultantAIDisabled`).
  - Atende: 2.6, 2.11, 2.33, 2.34, 2.37; preserva 3.3, 3.4, 3.5, 3.21, 3.22.

- [x] 7. **`_shared/bot/dedupe.ts`**: `checkAndMarkProcessed(messageId, instanceName)` usa INSERT atômico com `ON CONFLICT (message_id, instance_name) DO NOTHING RETURNING true/false`.
  - Todos os call sites passam `instanceName`.
  - **PBT:** chamadas concorrentes com mesmo par retornam exatamente um `true` e o resto `false`.
  - Atende: 2.6, 2.34.

- [x] 8. **`_shared/evolution-api.ts:sendWithRetry`** aceita `idempotencyKey` opcional; antes do envio, `acquireOutboundSlot(key)`. Se já existe, retorna o resultado anterior sem reenviar.
  - Backoff atual mantido para erros de rede; para 5xx pós-200, parar de tentar e marcar `needs_reconnect` quando aplicável (preserva 3.27).
  - **PBT:** chamadas com mesma `idempotencyKey` enviam exatamente uma vez.
  - Atende: 2.7.

- [x] 9. **Anti-dup textual normalizado** em `evolution-webhook/index.ts` substitui comparação exata por consulta em `conversations.message_text_hash` por `(customer_id, conversation_step)` nos últimos 60s.
  - **PBT:** duas mensagens diferindo só em whitespace/case/emoji-VS são consideradas duplicadas.
  - Atende: 2.8.

- [x] 10. **Contrato `__inline_sent` único** em `evolution-webhook/index.ts` bloco "10) Send reply": um único `if (updates.__inline_sent === true) skip;` no topo, removendo ramos paralelos.
  - Verificar todos os handlers que setam `__inline_sent` (busca por `__inline_sent` no repo).
  - Atende: 2.9; preserva 3.26.

- [x] 11. **AI vs Flow exclusividade** em `evolution-webhook/index.ts`: se `aiShouldHandle && consultantOpeningStep` → executar `runConversationalFlow` para o opening; senão se `aiShouldHandle` → exclusivo `ai-agent-router` (sem fallback paralelo); senão → caminho atual.
  - Atende: 2.10, 2.17.

## Phase 3 — Media reliability (B1)

- [~] 12. **`parseEvolutionMessage` (em `evolution-webhook/_helpers.ts`)** marca `isFile=true` para `audioMessage` quando passo é conversacional. Adiciona campo `mediaKind: 'image'|'document'|'audio'`.
  - Preserva comportamento atual em cadastro (`CADASTRO_STEPS`).
  - Atende: 2.5.

- [~] 13. **`_shared/evolution-api.ts:downloadMediaWithFallback`**: tenta primeiro `getBase64FromMediaMessage` (atual). Se falhar, tenta GET direto em `imageMessage.url`/`documentMessage.url`/`audioMessage.url` com headers Evolution.
  - Em qualquer falha, retorna `{ ok: false, reason }` para o caller decidir.
  - Atende: 2.4.

- [ ] 14. **Tratamento de falha de download** em `evolution-webhook/index.ts`: ao receber `ok=false`, INSERT em `inbound_media_failures`, log estruturado `evolution_media_lost`, reply ao cliente "Desculpa, não consegui receber sua imagem. Pode reenviar, por favor?", **manter `conversation_step` atual**.
  - Não redireciona para `aguardando_conta` se passo era conversacional.
  - Atende: 2.1, 2.3.

- [ ] 15. **Retry de upload MinIO**: quando `downloadMedia` ok mas `uploadToMinioPath` falha, INSERT em `inbound_media_retry` com base64 e mime. Continua o fluxo (OCR já tem o base64).
  - Atende: 2.2.

- [ ] 16. **Edge Function `inbound-media-retry-cron`**: roda a cada 30s, pega lotes de até 20 entries `next_attempt_at <= now()`, tenta `uploadToMinioPath`, em sucesso seta `succeeded_at`, em falha incrementa `attempts` e reagenda com backoff (1m, 5m, 15m), expira em `expires_at`.
  - Configurar no `supabase/config.toml` como cron.
  - Atende: 2.2.

- [ ] 17. **Áudio → transcript:** quando `mediaKind=audio` e download ok, chama `ai-transcribe-media` e injeta o transcript em `messageText` antes de rotear.
  - Preserva o áudio em MinIO e em `conversations.media_url`.
  - Atende: 2.5.

## Phase 4 — Step correctness (B3 + B4)

- [x] 18. **`_shared/flow-router.ts:routeEngine`** preserva `conversation_step` quando customer está em `CADASTRO_STEPS`, mesmo se `conversational_flow_enabled` mudou.
  - **PBT:** para qualquer transição de flag em customer com step ∈ CADASTRO_STEPS, step retornado == step de entrada.
  - Atende: 2.12.

- [x] 19. **Prefix correctness** em `evolution-webhook/handlers/step-namespace.ts` e `auto-resume`: garante que `engineUsed='flow'` ↔ `step.startsWith('flow:')`. Mismatches são corrigidos em uma única update.
  - **PBT:** após `auto-resume`, `engineUsed`/`step` consistentes.
  - Atende: 2.14.

- [x] 20. **`buttonId` como input primário** em handlers (`flow-router.matchTransition`, `runConversationalFlow`): ordem (a) `buttonId` em `transition.trigger_phrases`, (b) `buttonId === goto_special`, (c) `messageText`.
  - Atende: 2.15.

- [ ] 21. **`image_capture` configurável** em `evolution-webhook/handlers/conversational/index.ts`: antes de redirect para `aguardando_conta`, busca step com `step_type='image_capture'` no flow do consultor; se existir, executa.
  - Fallback hardcoded preservado (3.13/3.23).
  - Atende: 2.13, 2.20.

- [x] 22. **Validação de `next_step`** em `ai-agent-router/index.ts`: usar `validateNextStep` antes de gravar; se inválido, manter atual e logar `ai_invalid_next_step`.
  - Atende: 2.18.

- [x] 23. **Reachability + preconditions em `aiDecideFallback`** (`_shared/ai-faq-answerer.ts`): se `proposedStep` não alcançável a partir do atual ou viola precondition, força `REPEAT`.
  - Atende: 2.19, 2.31.

## Phase 5 — Timing realism (B5)

- [ ] 24. **`_shared/human-pace.ts`** nova fórmula: `floor=2000ms` se `len<=10` else `2500`; proporcional `60ms/char`; teto `12000ms`. Função `computeHumanDelayMs(charLen, hasIaPause)`.
  - **PBT:** monotonicidade em `charLen`; teto/piso respeitados.
  - Atende: 2.21, 2.23, 2.25.

- [ ] 25. **`_shared/evolution-api.ts:withTypingPresence`** renova `sendPresence` a cada 2.8s. Falha em presence → log + delay reduzido para piso.
  - Atende: 2.21, 2.24.

- [ ] 26. **`_shared/step-media-order.ts:sleepBetweenMedia`**: `max(800ms, configuredDelay, postAudioVideo)` onde `postAudioVideo = min(0.6 * duration_sec * 1000, 8000)` quando item anterior é áudio/vídeo.
  - **PBT:** sleep nunca menor que 800ms entre itens.
  - Atende: 2.22.

- [ ] 27. **Tail past 50s**: `runConversationalFlow` e `ai-agent-router`, ao acumular ≥ 50s, persistem restante em `pending_outbound_media` e retornam.
  - Atende: 2.26.

- [ ] 28. **Edge Function `outbound-media-flush-cron`**: roda a cada 5s, pega itens `scheduled_for<=now()`, envia, marca `succeeded_at`. Backoff em falha.
  - Atende: 2.26.

## Phase 6 — AI grounding (B6)

- [x] 29. **Pipeline de validação no `ai-agent-router/index.ts`** conforme design §6: `validateNextStep → filterMediaIds → validateAudioSlot → sanitizeHumanReply → checkPreconditions → deterministicFallback`.
  - Toda violação loga em `ai_agent_logs`.
  - Atende: 2.27, 2.28, 2.29, 2.30, 2.31.

- [ ] 30. **`_shared/ai-faq-answerer.ts:answerFaqWithAI`** prefere `bot_flow_qa.text_response` em match exato (case-insensitive, trim) antes de chamar LLM. LLM recebe esse texto como contexto restritivo.
  - Atende: 2.32; preserva 3.6.

- [ ] 31. **Fallback determinístico quando LLM falha**: try/catch ao redor da chamada Gemini em `ai-agent-router`. No catch, decisão determinística (template do step ou frase padrão).
  - Atende: 2.30.

## Phase 7 — Scale (B7)

- [ ] 32. **Substituir `rateLimitMap`** em `evolution-webhook/index.ts` por chamada `try_acquire_rate_limit(phone, 5000, 4)`.
  - Atende: 2.33.

- [ ] 33. **`_shared/bot/ai-cooldown.ts`** passa a usar `ai_cooldown_check_and_set` RPC. Map em memória vira cache TTL curto (10s) opcional.
  - Atende: 2.35.

- [ ] 34. **`_shared/audit.ts:try_log_media_send`** vira wrapper: chama `reserve_media_send`, executa send, chama `confirm_media_send(reservation_id, ok)`. Cron sweeper libera reservas órfãs a cada 30s (usar mesmo `outbound-media-flush-cron`).
  - Preserva semântica do happy-path (3.19).
  - Atende: 2.36.

- [ ] 35. **`_shared/gemini.ts`** chama `consume_gemini_token(consultantId, 1)` antes de cada request Gemini. Em `false`, lança erro `GeminiQuotaExhausted` que `ai-agent-router` captura para fallback determinístico.
  - Atende: 2.38.

## Phase 8 — Rollout & Observability

- [x] 36. **Gate por feature flag** em pontos críticos (`evolution-webhook/index.ts`, `ai-agent-router/index.ts`, `_shared/flow-router.ts`): cada nova lógica check `getFlowReliabilityV2(consultantId)`.
  - `off`: caminho antigo.
  - `dark`: novo caminho calculado em paralelo, só log; envio segue antigo.
  - `canary`/`on`: novo caminho ativo.
  - Atende: §8 do design.

- [ ] 37. **Logs estruturados** padronizados (campo `kind` em todo console.log relevante): `evolution_media_lost`, `evolution_dedup_short_circuit`, `customer_lock_acquired`, `customer_lock_timeout`, `ai_invalid_next_step`, `ai_hallucinated_media_id`, `gemini_quota_exhausted`, `inline_sent_skipped`.
  - Atende: observabilidade do design §11.

- [ ] 38. **Documentação no README** do `evolution-webhook` cobrindo: ordem de processamento, feature flag, RPCs novas, plano de rollback (`UPDATE consultants SET flow_reliability_v2='off'`).
  - Atende: §8 do design.

## Phase 9 — Verification

- [ ] 39. **Suíte completa de testes** roda verde: `deno test` nas Edge Functions, testes de `bot-flow_test.ts`, `step-namespace_test.ts`, `crm-stage-sync_test.ts` + os PBTs novos.
  - Atende: critério §12 do design.

- [ ] 40. **Smoke E2E em ambiente local** (Supabase + MinIO + mocked Evolution): cenários do bugfix.md (B1–B7) reproduzidos com customers fictícios; cada 2.x verificado manualmente.
  - Documentar resultados em `WHATSAPP_FLOW_RELIABILITY_TESTREPORT.md`.

- [ ] 41. **Canary plan execution**: ativar `flow_reliability_v2='dark'` em produção para todos os consultores por 24h; coletar logs; depois `'canary'` em 5% por 48h; depois `'on'` global.
  - Critérios em §8 do design.

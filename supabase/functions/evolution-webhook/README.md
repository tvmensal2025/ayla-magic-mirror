# evolution-webhook

Webhook que recebe eventos da Evolution API. Este README documenta a ordem de processamento atualizada após o whatsapp-flow-architecture-v3.

## Ordem de processamento (do início ao fim do turno)

```
1. CORS / parse JSON
2. Identificar instance + consultor (whatsapp_instances + consultants)
3. Resolver feature flags:
   - flow_reliability_v2  ('off' | 'dark' | 'canary' | 'on')
   - flow_engine_v3       ('off' | 'dark' | 'canary' | 'on')
4. Gate global "IA desligada" → silent return.
5. parseEvolutionMessage → extrai remoteJid, messageText, buttonId, mediaKind.
6. Dedupe por (message_id, instance_name) em webhook_message_dedup.
7. Rate limit:
   - legacy: in-memory Map (4 msg / 5s por phone)
   - v2: try_acquire_rate_limit RPC quando flow_reliability_v2 ∈ {dark,canary,on}
8. Customer lock (v2): try_acquire_customer_lock RPC com TTL 8s.
9. OTP intercept (handlers/otp-intercept.ts).
10. Find or create customer.
11. Auto-tag lead source (Meta Ads CTWA / initial_message / regex).
    Hoje inline; será movido para _shared/captation/lead-source.ts (Phase E).
12. Log inbound em conversations.
13. Captação manual: confirmação de dados (capture_mode='manual').
14. Bot paused gate.
15. Download de mídia (Task 14: registro de falha + reply de cortesia).
    Áudio → transcript automático via ai-transcribe-media (Task 17).
    Falha de upload MinIO → enqueue em inbound_media_retry (Task 15).
16. AI Agent gate (Camila — ai-agent-router).
17. Engine v3 dark (Phase C Task 21):
    - Carrega EngineCustomerState quando flow_engine_v3 ∈ {dark,canary,on}.
    - Em dark: log diff vs legado.
    - Em canary/on: dispatcher v3 emite (a partir de Task 40+).
18. Bot flow legado: runBotFlow ou runConversationalFlow.
19. Persistir updates + logs.
20. Anti-dup textual:
    - legacy: comparação exata.
    - v2: hash em conversations.message_text_hash.
21. Send reply (sendText / sendMedia / sendButtons).
22. Log outbound.
23. Release customer lock.
```

## Feature flags

### `flow_reliability_v2` (whatsapp-flow-reliability-fix)

| Valor  | Comportamento |
|---|---|
| `off`  | Caminho legado puro (default seguro). |
| `dark` | v2 calcula em paralelo, log apenas. Legado emite. |
| `canary` | v2 emite em pequenos consultores. Legado fallback. |
| `on`   | v2 é a fonte de verdade. |

**Rollback**: `UPDATE consultants SET flow_reliability_v2='off';`

### `flow_engine_v3` (whatsapp-flow-architecture-v3)

| Valor  | Comportamento |
|---|---|
| `off`  | Engine v3 não roda. Caminho legado puro. |
| `dark` | Engine v3 calcula EngineResult em paralelo. Loga `engine_dark_decision`. Legado emite. |
| `canary` | Dispatcher v3 emite em pequenos consultores. `delegate_legacy_runBotFlow` cobre cadastro. |
| `on`   | Dispatcher v3 padrão. |

**Rollback**: `UPDATE consultants SET flow_engine_v3='off';`

### Interação entre as duas flags

Os dois flags são independentes. Recomendação:
- v2 deve estar `'on'` antes de mover v3 para `'canary'` (v3 depende da fundação de v2).
- v2 e v3 podem rodar `'on'` simultaneamente — são camadas distintas.

## RPCs novas

| RPC | Origem | Função |
|---|---|---|
| `try_acquire_rate_limit(phone, window_ms, max)` | v2 | Rate limit persistente. |
| `try_acquire_customer_lock(customer_id, ttl_ms)` | v2 | Lock por customer. |
| `release_customer_lock(customer_id, token)` | v2 | Libera lock. |
| `ai_cooldown_check_and_set(key, ttl_ms, reason)` | v2 | Cooldown shared. |
| `consume_gemini_token(consultant_id, n)` | v2 | Quota Gemini por consultor. |
| `reserve_media_send / confirm_media_send` | v2 | Idempotência de mídia. |

## Tabelas novas

| Tabela | Spec | Função |
|---|---|---|
| `inbound_media_failures` | v2 | Log persistente de mídia perdida. |
| `inbound_media_retry` | v2 | Fila de retry de upload MinIO. |
| `outbound_message_log` | v2 | Idempotency keys. |
| `webhook_rate_limit` | v2 | Rate limit por phone. |
| `customer_processing_lock` | v2 | Soft lock por customer. |
| `pending_outbound_media` | v2 | Tail past 50s. |
| `customer_flow_state` | v3 | Estado canônico do lead. |

## Step types canônicos (v3)

`bot_flow_steps.step_type_canonical` (CHECK constraint):

| Tipo | Descrição |
|---|---|
| `text_message` | Envia texto e avança. |
| `media_message` | Envia mídia (img/audio/video/doc) e avança. |
| `audio_slot` | Toca slot da Camila (boas_vindas, etc.). |
| `ask_text` | Pergunta + captura texto livre. |
| `ask_choice` | Pergunta + botão real OU lista numerada (channel-aware). |
| `ask_media` | Pede mídia do lead. |
| `branch` | Decisão por condição (avança para then/else). |
| `system_capture` | OCR/cadastro/OTP — delega para runBotFlow legado. |

## Lista canônica de `customer_pause_reason`

(20 valores em uso. Adicionar novo motivo exige `ALTER TYPE`.)

| Valor | Significado |
|---|---|
| `opt_out` | Lead pediu para não receber mais. **Terminal**. |
| `humano_assumiu` | Consultor clicou em "Assumir". |
| `lead_pediu_humano` | Lead pediu humano explicitamente. |
| `low_bill_value` | Conta abaixo do mínimo viável. |
| `low_confidence_handoff` | IA com baixa confidence redirecionou. |
| `lead_refused_softpause` | Lead recusou continuar. |
| `lead_nao_pronto` | Lead pediu tempo (auto-resume disponível). |
| `lead_quer_pensar` | Lead quer pensar (auto-resume disponível). |
| `lead_nao_responde` | Sem resposta após followups. |
| `confused_after_retries` | 3+ tentativas sem entender. |
| `muitas_duvidas` | 5+ desvios consecutivos. |
| `muitas_duvidas_ia` | 3+ perguntas seguidas para IA. |
| `ai_handoff_duvidas` | IA decidiu handoff. |
| `ai_limit_atingido` | Limite de mensagens da IA. |
| `anti_loop` | Resposta muito similar à anterior. |
| `silent_handoff_empty_reply` | Bot tentou silenciar (reply vazio). |
| `gemini_quota_exhausted` | Quota Gemini esgotada. |
| `dados_incompletos_pos_loop` | Cadastro incompleto após retries. |
| `custom_step_no_match_retries_exhausted` | Step custom sem match. |
| `ia_decidiu` | IA pediu pausa por outro motivo. |
| `engine_error` | Erro inesperado no engine v3. |

## Plano de rollback

Em qualquer suspeita de incidente:

```sql
-- Reverte engine v3 imediato (efeito em até 30s, cache).
UPDATE consultants SET flow_engine_v3 = 'off';

-- Reverte v2 (mais drástico, só se necessário):
UPDATE consultants SET flow_reliability_v2 = 'off';
```

Estado em `customer_flow_state` permanece coerente após rollback graças ao trigger `sync_customer_flow_state_to_customers`.

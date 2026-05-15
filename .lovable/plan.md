# 5 Recursos Enterprise para o Fluxo Camila

## 1. Idempotência de webhook
- Nova tabela `processed_whatsapp_messages(message_id PK, received_at)` com TTL de 7 dias.
- No `whapi-webhook`: antes de processar, `INSERT ... ON CONFLICT DO NOTHING`. Se já existia, retorna 200 OK e ignora.
- Cron diário limpa registros > 7 dias.

## 2. Rate limit / debounce por contato
- Nova tabela `whatsapp_message_buffer(phone, consultant_id, messages jsonb[], scheduled_at)`.
- Quando chega mensagem: agenda processamento para 3s no futuro e acumula no buffer.
- Se chegar outra antes dos 3s, reseta o timer e concatena texto.
- Edge function `process-message-buffer` (cron a cada 2s) processa buffers expirados, juntando mensagens em uma única entrada para a IA.

## 3. Handoff humano automático
- Adicionar coluna `bot_paused_until timestamptz` em `customers`.
- Detectar intents de handoff: "falar com humano", "atendente", "pessoa real", "não é robô?", "consultor".
- Ao detectar: setar `bot_paused_until = now() + 24h`, criar registro em `ai_agent_logs` com `handoff=true`, e disparar notificação (registro em `crm_auto_message_log` com tipo `handoff_alert`) para o consultor.
- Webhook checa `bot_paused_until` antes de processar — se ativo, ignora mensagem (deixa o consultor responder).
- UI no painel CRM: botão "Reativar bot" no card do customer.

## 4. Timeout de conversa (follow-up)
- Adicionar `last_bot_interaction_at` em `customers`.
- Cron `bot-followup-checker` (a cada 30 min) busca customers em fluxo ativo sem interação há > 6h e < 48h.
- Envia mensagem de follow-up configurável ("Oi {{nome}}, ainda está aí? Posso te ajudar?") com `followup_count` para evitar spam (máx 1).
- Se > 48h sem resposta após follow-up: marca deal como `frio` no CRM.

## 5. A/B testing de mensagens
- A tabela `bot_messages` já tem campo `variant`. Aproveitar.
- Adicionar tabela `bot_message_ab_results(template_key, variant, sent_count, replied_count, advanced_count, updated_at)`.
- No envio: escolher variant aleatoriamente (round-robin ponderado), registrar envio.
- Quando customer responde dentro de 1h: incrementar `replied_count`.
- Quando avança no fluxo: incrementar `advanced_count`.
- UI nova: `/admin/ab-testing` mostrando variantes lado a lado com taxas e botão "Promover vencedora".

## Arquivos afetados

### Backend
- Migration: `processed_whatsapp_messages`, `whatsapp_message_buffer`, `bot_message_ab_results`, colunas em `customers`, cron jobs.
- `supabase/functions/whapi-webhook/index.ts` — idempotência + check `bot_paused_until` + buffer.
- Nova: `supabase/functions/process-message-buffer/index.ts` — processa buffer agrupado.
- Nova: `supabase/functions/bot-followup-checker/index.ts` — follow-ups.
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — detecção de handoff + tracking A/B.

### Frontend
- `src/pages/CamilaCRM.tsx` (ou similar) — botão "Reativar bot" + indicador de pausa.
- `src/pages/AdminABTesting.tsx` — nova página.
- `src/pages/FluxoCamila.tsx` — config de timeout/follow-up message + variantes A/B por step.

## Ordem de execução
1. Migration única com todas as tabelas/colunas + cron jobs.
2. Idempotência (mais crítico).
3. Handoff (mais visível para o usuário).
4. Buffer/debounce.
5. Follow-up.
6. A/B testing (UI + tracking).

## Notas
- Sem rate limiting tradicional (por IP/user) — apenas debounce funcional por contato.
- Detecção de handoff usa regex + AI fallback (mesmo padrão já implementado).
- A/B testing começa simples: escolha aleatória 50/50 entre variantes ativas. Otimização (Thompson sampling, etc.) pode vir depois.

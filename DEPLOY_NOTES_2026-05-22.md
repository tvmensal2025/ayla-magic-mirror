# Deploy Notes — 2026-05-22

> Atualização grande do fluxo WhatsApp + Game Mode + OCR Review + bugfixes
> críticos no envio. **Lovable: aplique TODAS as migrações antes do
> deploy do código** — sem isso as Edge Functions vão falhar ao chamar
> RPCs/tabelas inexistentes.

## TL;DR — o que mudou

1. **OCR Review humano** — após OCR de conta/documento, se o consultor está
   no painel admin, abre um card com **foto + dados extraídos + 2 botões**
   ("Eu confirmo" / "Pedir ao cliente confirmar"). Se ausente ou após 5 min
   sem decidir, segue automático pro WhatsApp do cliente.
2. **Roteamento Whapi vs Evolution** consertado em `manual-step-send` — o
   ⚡ do composer agora manda do número correto do consultor, não mais do
   super admin pra todos.
3. **Salvar mídia como template** — auto-carrega a mídia ao abrir o dialog.
4. **Mensagens fora de ordem** corrigidas em 3 pontos: restart-cascade,
   saudação, FAQ hit. Cada step respeita `flow_step_media_order` próprio.
5. **Página /admin?tab=whatsapp** abre conversas mesmo durante reconexão.
6. **MessageComposer mobile** envia com Enter (`enterKeyHint="send"`),
   botão Send sempre visível, safe-area inset.
7. **Modo game enriquecido** — XP floater, combo timer 5min, vibração
   (haptics), atalhos de teclado no PC.
8. **Bugfix WhatsApp Flow Reliability** — migração com tabelas/RPCs novos
   (rate-limit persistente, customer lock, idempotency keys, anti-dup hash,
   AI grounding). Tudo gateado por `consultants.flow_reliability_v2`
   (default `'off'`, sem mudança até ativar).

## ⚠️ Pré-deploy (ORDEM OBRIGATÓRIA)

Sem essa ordem **as Edge Functions vão crashar**. Aplique como root da
sua DB no Supabase Dashboard ou via `supabase db push`.

### 1. Migrações SQL (pelo Supabase)

Em ordem (timestamps já garantem):

- `supabase/migrations/20260521170000_whatsapp_flow_reliability_v2.sql`
  - Cria: `inbound_media_failures`, `inbound_media_retry`, `outbound_message_log`,
    `webhook_rate_limit`, `ai_cooldown_state`, `gemini_quota_bucket`,
    `pending_outbound_media`, `customer_processing_lock`
  - Cria RPCs: `try_acquire_rate_limit`, `ai_cooldown_check_and_set`,
    `consume_gemini_token`, `reserve_media_send`, `confirm_media_send`,
    `try_acquire_customer_lock`, `release_customer_lock`
  - ALTER `webhook_message_dedup` (drop PK, mantém composite UNIQUE)
  - ALTER `ai_slot_dispatch_log` (`dispatch_status`, `reservation_id`,
    `reserved_at`, `confirmed_at`)
  - ALTER `conversations` (`message_text_hash` GENERATED STORED via SHA-256)
  - ALTER `consultants` (`flow_reliability_v2` flag)

- `supabase/migrations/20260522180000_consultant_presence.sql`
  - Cria: `consultant_presence`
  - Cria RPC: `is_consultant_online(p_consultant UUID)`
  - ALTER `customers`: `ocr_review_pending`, `ocr_review_started_at`,
    `ocr_review_decided_at`, `ocr_review_decided_by`

> **Comando único Supabase:**
> ```
> supabase db push
> ```

### 2. Deploy Edge Functions (Lovable / Supabase CLI)

Funções **modificadas** (deploy obrigatório):

```
supabase functions deploy evolution-webhook
supabase functions deploy whapi-webhook
supabase functions deploy ai-agent-router
supabase functions deploy manual-step-send
```

Funções **NOVAS** (deploy obrigatório):

```
supabase functions deploy ocr-review-timeout
```

### 3. Cron pg_cron (opcional mas recomendado pra OCR Review)

Pra que leads não fiquem pendurados >5min se o consultor sumir:

```sql
SELECT cron.schedule(
  'ocr-review-timeout',
  '*/1 * * * *', -- a cada 1 minuto
  $$ SELECT net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/ocr-review-timeout',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    )
  ) $$
);
```

### 4. Build + deploy frontend (Lovable faz automático)

```
npm run build  # já testado: 30s, sem erros
```

A Lovable faz o build automático ao receber o push.

## Mudanças por arquivo

### Frontend — novos arquivos

| Arquivo | Função |
|---|---|
| `src/hooks/useConsultantPresence.ts` | Heartbeat de 25s na tabela `consultant_presence` |
| `src/hooks/useOcrReviewQueue.ts` | Realtime queue de leads aguardando review |
| `src/hooks/useCaptureCombo.ts` | Combo timer 5min do modo game |
| `src/lib/haptics.ts` | Vibração mobile (Vibration API) |
| `src/components/captacao/OcrReviewCard.tsx` | Card grande foto + dados + 2 botões |
| `src/components/captacao/OcrReviewBanner.tsx` | Banner sticky no topo do Admin |
| `src/components/captacao/game/ComboTimer.tsx` | Timer visual de combo |
| `src/components/captacao/game/XpFloater.tsx` | "+10 XP" flutuante animado |

### Frontend — arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/Admin.tsx` | Plug do `useConsultantPresence` + `OcrReviewBanner` |
| `src/hooks/useWhatsApp.ts` | Fallback de identificação Whapi via e-mail (rafael.ids@icloud.com) |
| `src/components/whatsapp/WhatsAppTab.tsx` | Conversas abrem mesmo durante reconexão |
| `src/components/whatsapp/MessageComposer.tsx` | Mobile: `enterKeyHint="send"`, Send sempre visível, safe-area |
| `src/components/whatsapp/SaveMessageAsTemplateDialog.tsx` | Auto-carrega mídia ao abrir |
| `src/components/whatsapp/MessageBubble.tsx` | Passa `onLoadMedia` ao dialog |
| `src/components/captacao/CaptureSheet.tsx` | Game enrichments + tooltip detalhado |
| `src/index.css` | Animações `game-float-up` e `game-cta-shake` |

### Backend — novas Edge Functions

| Arquivo | Função |
|---|---|
| `supabase/functions/ocr-review-timeout/index.ts` | Cron 1/min — libera leads pendurados >5min |

### Backend — Edge Functions modificadas

| Arquivo | Mudança |
|---|---|
| `supabase/functions/evolution-webhook/index.ts` | Reordenação dedup→ratelimit→lock, anti-dup hash, `__inline_sent` único, AI vs Flow exclusividade |
| `supabase/functions/evolution-webhook/handlers/bot-flow.ts` | Gate de presença antes de mandar OCR conta + doc pro cliente |
| `supabase/functions/evolution-webhook/handlers/conversational/index.ts` | Restart-cascade respeita `flow_step_media_order`, QA hit idem |
| `supabase/functions/evolution-webhook/handlers/types.ts` | Sem alteração de runtime |
| `supabase/functions/whapi-webhook/index.ts` | Mesma reordenação do evolution |
| `supabase/functions/whapi-webhook/handlers/bot-flow.ts` | Mesmo gate de presença |
| `supabase/functions/whapi-webhook/handlers/conversational/index.ts` | Mesmo fix de ordem |
| `supabase/functions/whapi-webhook/handlers/types.ts` | Sem alteração de runtime |
| `supabase/functions/ai-agent-router/index.ts` | Pipeline de validação contra alucinação (gateado pela flag) |
| `supabase/functions/manual-step-send/index.ts` | **CRÍTICO**: roteamento Whapi vs Evolution baseado em `superadmin_consultant_id` |
| `supabase/functions/_shared/audit.ts` | Mantém `try_log_media_send` + reservation/confirm |
| `supabase/functions/_shared/evolution-api.ts` | `sendWithRetry` aceita `idempotencyKey` |
| `supabase/functions/_shared/flow-router.ts` | `routeEngine` preserva CADASTRO step + `matchTransition` com buttonId |
| `supabase/functions/_shared/bot/dedupe.ts` | Composite UNIQUE `(message_id, instance_name)` |

### Backend — novos shared helpers

| Arquivo | Função |
|---|---|
| `supabase/functions/_shared/customer-lock.ts` | Lock por customer via RPC |
| `supabase/functions/_shared/feature-flag.ts` | `getFlowReliabilityV2()` com cache 30s |
| `supabase/functions/_shared/grounding.ts` | Sanitizer + validações da decisão da IA |
| `supabase/functions/_shared/idempotency.ts` | Idempotency keys pro `sendWithRetry` |
| `supabase/functions/_shared/text-hash.ts` | Normalized SHA-256 para anti-dup |

### Backend — testes (não vão pro deploy, mas estão no repo)

```
supabase/functions/_shared/customer-lock_test.ts
supabase/functions/_shared/dedupe_test.ts
supabase/functions/_shared/feature-flag_test.ts
supabase/functions/_shared/flow-router_test.ts
supabase/functions/_shared/grounding_test.ts
supabase/functions/_shared/idempotency_test.ts
supabase/functions/_shared/text-hash_test.ts
supabase/functions/evolution-webhook/handlers/conversational/order_test.ts
supabase/functions/_shared/evolution-api_idempotency_test.ts
```

Total: **243 testes passando, 0 falhando**.

## Variáveis de ambiente exigidas

Já configuradas, só conferir no Lovable:

- `SUPABASE_URL` (server)
- `SUPABASE_SERVICE_ROLE_KEY` (server)
- `EVOLUTION_API_URL` (server)
- `EVOLUTION_API_KEY` (server)
- `WHAPI_TOKEN` (server, super admin) — pode também ficar em
  `settings.whapi_token`
- `GEMINI_API_KEY` ou `GOOGLE_AI_API_KEY` (server)

Frontend (Lovable injeta):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_EVOLUTION_API_URL`
- `VITE_EVOLUTION_API_KEY`

## 🛟 Plano de rollback (se der ruim em produção)

### Opção A — Desligar via flag (recomendado, sem revert)

A maior parte dos comportamentos novos do bugfix está gateada por
`consultants.flow_reliability_v2` (default `'off'`). Para reverter
qualquer instabilidade do bugfix sem deploy:

```sql
UPDATE consultants SET flow_reliability_v2 = 'off';
```

**O que volta automaticamente ao caminho antigo:**
- Reordenação de dedup/ratelimit (cai no Map em memória)
- Anti-dup hash (volta pro match exato)
- Customer lock (não trava mais)
- AI grounding (sanitizer light antigo)

**O que NÃO é revertido pela flag (precisa revert do código):**
- OCR Review humano (gate de presença) — para reverter, precisa do
  `git revert` da migração + redeploy. Workaround temporário:
  ```sql
  UPDATE customers SET ocr_review_pending = NULL;
  -- E em consultant_presence, marca todos como offline:
  UPDATE consultant_presence SET last_seen_at = '1970-01-01';
  ```
- `manual-step-send` roteando Whapi vs Evolution corretamente — não tem
  flag, mas se reverter dá problema (consultores Evolution voltam a
  mandar pelo número errado). Não recomendo.
- Reordenação dos cascades em `conversational/index.ts` — sem flag.
  Workaround: `git revert <commit>` específico.

### Opção B — Revert completo do commit

```bash
# No GitHub, ache o SHA do commit "feat: WhatsApp Flow Reliability + OCR Review + Game"
# (o último commit antes desse era 972b9ab6)

git revert <sha-do-commit-grande> --no-edit
git push origin main

# Depois, desfazer migrações:
```

### Opção C — Desfazer migrações (último recurso)

Apenas para reverter colunas/tabelas — funções continuam funcionando porque
têm `IF NOT EXISTS`/`IF EXISTS` defensivos.

```sql
-- 1. Reverter migration 20260522180000 (presence + OCR review)
DROP FUNCTION IF EXISTS public.is_consultant_online(UUID);
DROP TABLE IF EXISTS public.consultant_presence;
ALTER TABLE public.customers
  DROP COLUMN IF EXISTS ocr_review_pending,
  DROP COLUMN IF EXISTS ocr_review_started_at,
  DROP COLUMN IF EXISTS ocr_review_decided_at,
  DROP COLUMN IF EXISTS ocr_review_decided_by;

-- 2. Reverter migration 20260521170000 (flow reliability v2)
ALTER TABLE public.consultants DROP CONSTRAINT IF EXISTS consultants_flow_reliability_v2_chk;
ALTER TABLE public.consultants DROP COLUMN IF EXISTS flow_reliability_v2;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS message_text_hash;
ALTER TABLE public.ai_slot_dispatch_log
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS reserved_at,
  DROP COLUMN IF EXISTS reservation_id;
-- (dispatch_status já existia antes)
DROP TABLE IF EXISTS public.customer_processing_lock CASCADE;
DROP TABLE IF EXISTS public.pending_outbound_media CASCADE;
DROP TABLE IF EXISTS public.gemini_quota_bucket CASCADE;
DROP TABLE IF EXISTS public.ai_cooldown_state CASCADE;
DROP TABLE IF EXISTS public.webhook_rate_limit CASCADE;
DROP TABLE IF EXISTS public.outbound_message_log CASCADE;
DROP TABLE IF EXISTS public.inbound_media_retry CASCADE;
DROP TABLE IF EXISTS public.inbound_media_failures CASCADE;
DROP FUNCTION IF EXISTS public.try_acquire_rate_limit(TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.ai_cooldown_check_and_set(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.consume_gemini_token(UUID, INT);
DROP FUNCTION IF EXISTS public.reserve_media_send(UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirm_media_send(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.try_acquire_customer_lock(UUID, INT);
DROP FUNCTION IF EXISTS public.release_customer_lock(UUID, UUID);

-- 3. Recolocar PK em webhook_message_dedup (se quiser voltar 100%)
-- ALTER TABLE public.webhook_message_dedup ADD PRIMARY KEY (message_id);
-- (mas o composite UNIQUE de 20260519124511 continua funcional sem isso)
```

### Cenário matriz "se der erro" → "fazer isto"

| Sintoma | Solução |
|---|---|
| Consultor não consegue enviar pelo ⚡ do composer | `manual-step-send` deploy falhou — re-deploy. Workaround: usar o composer normal de texto. |
| OCR review não aparece no painel | `consultant_presence` não está com heartbeat — confirme migration 20260522180000 aplicada. Workaround: limpar `customers.ocr_review_pending = NULL` |
| Bot manda 2 mensagens em vez de 1 | `flow_reliability_v2='off'` (já está). Se piorar, reverter migration 20260521170000 |
| Mensagens fora de ordem ainda | Confirmar deploy de `evolution-webhook` e `whapi-webhook` (cascade fix está nesse deploy) |
| Mobile não envia com Enter | Frontend antigo no cache — pedir consultor pra fazer hard refresh / fechar PWA |
| Salvar template trava | Frontend deploy não refletiu — verificar Lovable build |
| Cron `ocr-review-timeout` não roda | pg_cron não configurado — leads ficam parados após 5min mas nada mais quebra. Workaround manual: `UPDATE customers SET ocr_review_pending = NULL WHERE ocr_review_started_at < now() - interval '10 minutes'` |

## Smoke test pós-deploy (10 min)

1. **Login Rafael (super admin / Whapi)**:
   - Abrir `/admin?tab=whatsapp`
   - Conferir lista de conversas carrega
   - Abrir uma conversa, mandar "oi" → mensagem chega
2. **Login outro consultor (Evolution)**:
   - Mesmo passo acima
   - Conferir que mensagem sai do número **dele**, não do Rafael
3. **OCR Review**:
   - Pedir cliente teste mandar foto da conta
   - Confirmar que **banner amarelo** aparece no topo do `/admin`
   - Clicar "Eu confirmo" → bot avança automaticamente
4. **Modo game**:
   - Abrir um lead com OCR feito
   - Tocar em "Captação"
   - Conferir que tooltip do "Cadastrar" mostra `Faltam: <campos>` específicos
5. **⚡ no composer**:
   - Conversa aberta, clicar no ⚡, escolher um passo
   - Conferir que mensagem chega no cliente

## O que NÃO foi feito

(Honestidade sobre limitações):

- Mídia silenciosamente perdida da Evolution (tasks 12-17 do bugfix-spec)
- Timing realista total (tasks 24-28)
- Rate limiter do Evolution Edge Function ainda usa Map em memória além do RPC novo (gateado pela flag)
- PWA install banner customizado

Esses ficam pra próxima sprint.

## Status final no momento do push

```
npx tsc --noEmit -p tsconfig.app.json  → exit 0
npm run build                          → exit 0 (29.93s)
deno check (functions modificadas)     → 0 novos erros (baseline preservada)
deno test --allow-net --allow-env _shared/  → 243 passed | 0 failed
```

---

**Última atualização:** 2026-05-22 03:50 BRT
**Por:** Kiro (sob direção de Rafael Ferreira)

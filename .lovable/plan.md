## Diagnóstico

Hoje a integração com o Facebook faz só **polling de agregados** a cada 30 min em `facebook-sync-metrics` (campos `impressions, clicks, spend, actions[lead]`). Isso traz **o número de leads**, mas **não traz o lead em si** (nome, telefone, e-mail, respostas do formulário). Por isso "não cai tudo".

Não existe no projeto:

- Assinatura de **Webhooks da Meta** (`leadgen`, `messages`, `ads_account`)
- Endpoint `/leads` da Marketing API sendo consultado por formulário
- Backfill via `/{form_id}/leads`
- Validação `X-Hub-Signature-256`
- CAPI para `Lead` / `CompleteRegistration` (só existe `facebook-capi` genérico — verificar uso)

## Como empresas sérias fazem (padrão Meta)

1. **System User token de longa duração** (não OAuth de usuário) — evita expirar a cada 60 dias. *Hoje já usamos `platform_facebook_account` — bom.*
2. **Webhook `leadgen` no objeto Page** — Meta faz `POST` no nosso endpoint a cada lead. Validar HMAC com `app_secret`.
3. **Buscar o lead completo** via `GET /{leadgen_id}?fields=field_data,created_time,ad_id,form_id` usando page access token.
4. **Backfill periódico** (`/{form_id}/leads?since=...`) pra cobrir webhooks perdidos (Meta às vezes falha).
5. **Fila com retry idempotente** (`leadgen_id` como chave única) — Meta reentrega em caso de 5xx.
6. **CAPI server-side** mandando evento `Lead` de volta com `fbc/fbp/event_id` pra deduplicar com Pixel.
7. **Subscribe explícito** por página: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` no OAuth callback.
8. **Monitoramento**: `/{page-id}/subscribed_apps` + tabela de falhas de webhook.

## Plano de implementação

### 1. Edge function `facebook-leadgen-webhook` (pública, `verify_jwt=false`)

- `GET`: verificação de `hub.challenge` com `META_VERIFY_TOKEN`.
- `POST`: valida `X-Hub-Signature-256` com `FACEBOOK_APP_SECRET`; processa cada `entry.changes[]` field=`leadgen`.
- Para cada `leadgen_id`: chama `GET /{leadgen_id}` com page token, normaliza `field_data` (nome/phone/email/cidade), upsert em `facebook_leads` (idempotente por `leadgen_id`), cria `customer` + `deal` na stage `novo_lead`, dispara `notifyNewLead` (já existe).
- Responde **200 imediato** antes do processamento pesado (`EdgeRuntime.waitUntil`) — Meta cancela se demorar >20s.

### 2. Tabelas novas (migração)

- `facebook_leads (id, leadgen_id UNIQUE, form_id, ad_id, campaign_id, consultant_id, page_id, raw_field_data jsonb, normalized jsonb, processed_at, created_at)`
- `facebook_webhook_events (id, object, field, payload jsonb, signature_valid bool, received_at, processed_at, error)`
- `facebook_page_subscriptions (page_id PK, consultant_id, page_access_token_encrypted, subscribed_fields[], subscribed_at, status)`

### 3. Subscribe da página no OAuth callback

Em `facebook-oauth-callback`: depois de salvar a conexão, fazer:

- `GET /me/accounts` pra pegar `page_access_token`
- `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen,messages` com token da página
- Salvar `page_access_token` criptografado em `facebook_page_subscriptions`

### 4. Backfill `facebook-leads-backfill` (cron a cada 15 min)

- Para cada `form_id` ativo (descoberto via campanhas): `GET /{form_id}/leads?since={last_sync}`
- Upsert em `facebook_leads` (idempotente). Pega leads que webhook perdeu.

### 5. Secrets necessários

- `FACEBOOK_APP_SECRET` (pra HMAC) — pedir ao usuário
- `META_VERIFY_TOKEN` (string aleatória que geramos)
- Configurar Webhook na Meta App Dashboard apontando pra `https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/facebook-leadgen-webhook`

### 6. CAPI Lead (opcional, mas é padrão de mercado)

Após criar lead, disparar `facebook-capi` com `event_name=Lead`, `event_id=leadgen_id`, `user_data` hasheado, `fbp/fbc` se disponíveis — dedup com Pixel.

## Detalhes técnicos

```text
Meta Lead Form
  └─ submit
     └─ Webhook POST → facebook-leadgen-webhook
        ├─ Validate HMAC
        ├─ Enqueue (200 OK)
        └─ waitUntil:
           ├─ GET /{leadgen_id} → field_data
           ├─ Upsert facebook_leads (unique leadgen_id)
           ├─ Create customer + deal[novo_lead]
           ├─ notifyNewLead()
           └─ CAPI Lead (dedup com Pixel)

Cron 15 min
  └─ facebook-leads-backfill → /{form_id}/leads?since=last → backfill
```

## Perguntas

1. Você tem acesso ao **App Secret** do app Meta (Dashboard → Settings → Basic)? Vou precisar dele como secret.
2. Já existe **App Review aprovado** para `leads_retrieval` em modo Live? Sem isso, só leads de admins/dev/testers vêm.
3. Qinclua **CAPI de Lead** já nesta leva (otimiza campanhas) ou s
4. Os leads devem entrar como `customer_origin = 'lead_whatsapp'` ou criar uma origem nova `lead_facebook`?

Posso implementar tudo de uma vez assim que confirmar essas 4.

&nbsp;

Nao [sei.se](http://sei.se) tem o restante faca ficar 100%

&nbsp;
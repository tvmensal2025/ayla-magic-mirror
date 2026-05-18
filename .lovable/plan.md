# Permissões Meta extras + Saldo real preciso

## Diagnóstico

**Permissões atuais** (`facebook-oauth-start`):
`ads_management, ads_read, pages_show_list, email, public_profile`

Está OK para criar/ler campanhas, **mas falta** o que dá mais sinal pra IA aprender e pra controlar mídia:

| Falta | Pra quê |
|---|---|
| `business_management` | Ler/gerenciar a BM (assets, usuários, contas) — necessário pra IA enxergar tudo da sua BM única |
| `leads_retrieval` | Puxar leads do Lead Ads em tempo real (hoje só conta lead, não lê o conteúdo) |
| `pages_read_engagement` + `pages_manage_metadata` | Ler comentários/reactions dos posts patrocinados (sinal forte de criativo bom/ruim) |
| `pages_manage_ads` | Promover posts da página dentro da BM |
| `instagram_basic` + `instagram_manage_insights` | Métricas IG (hoje só FB) |
| `read_insights` | Insights da página (alcance orgânico) |
| `catalog_management` (opcional) | Só se for usar Advantage+ Catalog |

**Saldo real** (`facebook-platform-balance` + `facebook-sync-metrics`):
- Hoje lê `balance` e `amount_spent` da conta — **mas só roda quando alguém abre o card** ou quando o cron de sync passa.
- Não há **webhook** da Meta avisando débito → saldo no dashboard fica defasado.
- `wallet_transactions` debita pelo `spend` das insights (delta), o que tem latência de ~15min–3h da Meta.
- Sem `Conversions API` configurada com `actions_data_processing_options` → algumas compras/leads não chegam → CPL fica errado → IA otimiza com dado ruim.

## Plano

### 1. Ampliar scopes OAuth
Editar `supabase/functions/facebook-oauth-start/index.ts` adicionando ao `SCOPES`:
```
business_management, leads_retrieval, pages_read_engagement,
pages_manage_metadata, pages_manage_ads,
instagram_basic, instagram_manage_insights, read_insights
```
Você precisa **reconectar a BM uma vez** depois (botão "Reconectar Facebook" no card admin) pra aceitar as novas permissões.

### 2. App Review da Meta (manual, fora do código)
Permissions avançadas exigem revisão:
- `leads_retrieval`, `pages_read_engagement`, `pages_manage_ads`, `instagram_manage_insights` → submeter no **App Dashboard → App Review → Permissions and Features** com vídeo mostrando uso.
- Enquanto não aprovar, funcionam só pra admins/devs do app (você já é, então funciona no seu BM imediatamente).

### 3. Saldo real em tempo (quase) real
Criar `facebook-balance-webhook` (edge function) + assinar webhook da Meta:
- Inscrever campos `account` no objeto `ad_account` → Meta dispara quando `balance`/`amount_spent` muda.
- Webhook atualiza `consultant_wallet.last_synced_at` e dispara reconciliação imediata.

E **encurtar o intervalo de polling** do `facebook-sync-metrics` de N min para **5 min** (cron via `pg_cron`), com debounce.

### 4. Reconciliação precisa do saldo
Hoje `wallet_transactions` debita só baseado em insights. Adicionar:
- Job diário `facebook-balance-reconcile` que compara `consultant_wallet.total_spent_cents` com `lifetime_amount_spent_cents` da Meta e cria transação `adjustment` se divergir > R$ 0,50.
- Mostrar no card admin: **"Saldo Meta R$ X · Sistema R$ Y · Δ R$ Z (última conferência: HH:MM)"**.

### 5. Sinais extras pra IA aprender (Conversions API + offline events)
Já existe `facebook-capi`. Melhorar:
- Enviar **todos** os eventos: `ViewContent`, `Lead`, `CompleteRegistration`, `Purchase`, `Contact` (clique no WhatsApp) com `event_id` único pra dedupe com Pixel.
- Adicionar `customer_information_parameters` hasheados (em, ph, fn, ln, ct, st, zp, country) → +30% match quality → IA otimiza melhor.
- Subir **eventos offline** (status `aprovado`/`ativo` no CRM) via `/offline_conversions` → Meta aprende quem virou cliente de verdade, não só lead.

### 6. UI no card "Facebook da Plataforma"
- Badge "Match Quality: X/10" (vem de `/events_received`).
- Botão "Solicitar nova permissão" que dispara OAuth com `auth_type=rerequest`.
- Lista das permissões concedidas vs faltantes (lê `/me/permissions`).

## Detalhes técnicos

**Arquivos a mudar:**
- `supabase/functions/facebook-oauth-start/index.ts` — adicionar scopes + `auth_type=rerequest` opcional
- `supabase/functions/facebook-sync-metrics/index.ts` — incluir IG insights + breakdown por idade/gênero
- `supabase/functions/facebook-capi/index.ts` — hash de todos os PII, `event_id` único, suporte offline events
- `supabase/functions/facebook-platform-balance/index.ts` — incluir comparação Meta vs Sistema + `/me/permissions`
- `supabase/functions/facebook-balance-webhook/index.ts` *(novo)*
- `supabase/functions/facebook-balance-reconcile/index.ts` *(novo, agendado)*
- `src/components/admin/super/PlatformFacebookCard.tsx` — mostrar delta, permissões, botão re-request
- Migração: tabela `facebook_permissions_audit` (consultant_id, granted jsonb, declined jsonb, checked_at)
- Cron `pg_cron`: balance-reconcile diário 03:00 BRT

**Resposta direta à sua pergunta:**
> "já está bom?"

Não. Tá funcional, mas faltam **6 scopes** que destravariam aprendizado contínuo da IA e **falta webhook de saldo** + reconciliação — por isso o saldo no painel não bate com a Meta em tempo real.

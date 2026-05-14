## O que muda com sua decisão

Você quer **CTWA oficial via WABA** (Click-to-WhatsApp nativo da Meta), não mais o `wa.me`. Isso muda 3 coisas importantes a melhor:

1. **Otimização real por `CONVERSATIONS`** (e não `LINK_CLICKS`) → Meta entrega o anúncio para quem efetivamente abre conversa, CPL cai 10–25%.
2. **Atribuição nativa** do clique até a primeira mensagem, sem depender de `fbclid` na URL → o algoritmo aprende muito mais rápido.
3. **Pixel + CAPI casados** com `promoted_object` apontando para `page_id + whatsapp_phone_number` → eventos `Lead`/`Purchase` voltam para o anúncio correto e alimentam Lookalike.

Pré-requisito: o número precisa estar **oficialmente em uma WABA conectada à Página** no Meta Business Suite (com WhatsApp Business API, não o app pessoal nem o app Business). O `facebook-validate-account` já checa isso e retorna a mensagem `WHATSAPP_BUSINESS_REQUIRED` quando falta — só vou reativar esse caminho como **bloqueante** em vez de fallback para `wa.me`.

---

## Plano final (4 frentes)

### Frente 1 — Migrar publicação para CTWA oficial (WABA)

Arquivo: `supabase/functions/facebook-create-campaign/index.ts`

- **Objective**: `OUTCOME_ENGAGEMENT` (atual e correto pra CTWA WABA) ou `OUTCOME_SALES` quando o pixel tem histórico de `Purchase`. Hoje está `OUTCOME_TRAFFIC` — vamos trocar.
- **Optimization goal**: `CONVERSATIONS` (em vez de `LINK_CLICKS`).
- **Destination type**: `WHATSAPP` no AdSet.
- **`promoted_object`**: `{ page_id, whatsapp_phone_number, custom_event_type: "OTHER" }` — é o que liga anúncio ↔ número WABA.
- **`tracking_specs`**: `[{action.type:["onsite_conversion.messaging_first_reply"]}, {action.type:["offsite_conversion"], fb_pixel:[pixel_id]}]` quando há pixel — Meta reporta "Conversas iniciadas" + `Lead` da CAPI atribuído ao mesmo ad.
- **Creative**: `object_story_spec.link_data.call_to_action = { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP", page: page_id, link: "https://api.whatsapp.com/send?phone=<numero>" } }` — esse é o formato oficial CTWA, sem link `wa.me` solto.
- **Mensagem inicial**: passa para `payload.welcome_message` do `link_data` (Meta abre o WhatsApp já com o texto pronto e atrelado ao ad_id).
- **Bloqueio**: se o `facebook-validate-account` retornar `WHATSAPP_BUSINESS_REQUIRED`, o front (`SmartPublishButton`) mostra modal explicando como conectar WABA, com link direto para `business.facebook.com/wa/manage/phone-numbers/`. **Sem fallback `wa.me`.**

### Frente 2 — Concorrentes com imagem real

Arquivo: `supabase/functions/ad-competitor-scraper/index.ts` (reescrita)

- Trocar Gemini-text-only por **Meta Ad Library Graph API** (`/ads_archive` com token de System User da plataforma).  
  Campos: `ad_snapshot_url, ad_creative_bodies, ad_creative_link_titles, ad_creative_link_captions, page_name, ad_delivery_start_time, ad_creative_link_descriptions`.
- Para cada anúncio, fazer `GET ad_snapshot_url`, extrair `og:image` + thumbnail de vídeo, baixar e salvar em **MinIO** (`competitors/<advertiser>/<archive_id>.jpg`), gravar `image_url`/`thumbnail_url`/`video_url` em `ad_competitor_creatives`.
- Manter Gemini só como **enriquecimento** do `angle` (classificação `economia_concreta | quebra_objecao | ...`) a partir do texto real do anúncio.
- Backfill manual dos 38 registros existentes após o deploy.

### Frente 3 — Painel "IA Aprendendo" no SuperAdmin

Arquivo novo: `src/components/admin/super/AILearningHealthPanel.tsx` + nova aba em `src/pages/SuperAdmin.tsx`.

- **4 cards de status verde/amarelo/vermelho** com base na idade da última execução de cada cron (consulta `ai_usage_log` + `ad_creative_insights.updated_at` + `ad_competitor_creatives.ingested_at`):
  - 🕵️ Scraper concorrentes (≤8 dias = verde)
  - 🧠 Learner de criativos (≤26 h = verde)
  - 🔄 Rotator (≤14 h = verde)
  - 📊 Sync de métricas (≤45 min = verde)
- **Timeline unificada** dos últimos 30 eventos (scraper, learner, rotator, auto-pause, CAPI events).
- **"Top 5 padrões vencedores agora"** — agregação de `ad_creative_insights.winning_patterns` por contagem global.
- **"Top 5 padrões a evitar"** — idem `losing_patterns`.
- **Atribuição CAPI saudável?** — taxa últimos 7 dias de `customers` com `lead_source.fbclid` preenchido / total de `Lead` em `facebook_capi_events`.
- **Botão "Forçar agora"** em cada cron via `supabase.functions.invoke`.
- **Auto-refresh 60 s.**

### Frente 4 — Auto-aprendizado fechando o ciclo

Garantias de que cada execução **realmente melhora a próxima publicação** (auditei e vou reforçar onde está fraco):

| Cron | Já funciona | O que vou reforçar |
|---|---|---|
| `ad-creative-learner` (diário 07:00) | Gera `ad_creative_insights` por consultor | Passar a também gravar **insights globais** (`consultant_id IS NULL`) que o `ad-creative-builder` lê como prior. |
| `ad-creative-builder` | Já consome insights do consultor | Passar a também consumir o insight global + **top concorrentes ativos com imagem** como referência visual no prompt. |
| `facebook-creative-rotator` (12 h) | Pausa losers | Adicionar **promoção automática** (subir budget +20 % do winner do mês até teto). |
| `facebook-auto-pause` (06:00) | Pausa campanhas estouradas | Marca causa em `ad_recommendations` p/ aparecer no painel novo. |
| `ad-competitor-scraper` (semanal) | Coleta texto | (Frente 2) Coleta imagem real + alimenta o builder. |

---

## Arquivos afetados

```
supabase/functions/facebook-create-campaign/index.ts   → CTWA oficial WABA
supabase/functions/facebook-validate-account/index.ts  → bloqueio firme se sem WABA
supabase/functions/ad-competitor-scraper/index.ts      → /ads_archive + snapshot + MinIO
supabase/functions/_shared/meta-ads-library.ts         → novo helper
supabase/functions/ad-creative-learner/index.ts        → +insight global
supabase/functions/ad-creative-builder/index.ts        → consome insight global + concorrentes c/ imagem
supabase/functions/facebook-creative-rotator/index.ts  → promoção automática do winner
src/components/admin/super/AILearningHealthPanel.tsx   → novo
src/pages/SuperAdmin.tsx                               → nova aba "IA & Aprendizado"
src/components/admin/ads/SmartPublishButton.tsx        → modal "conectar WABA" sem fallback
```

## Validação após deploy

1. `facebook-validate-account` com número não-WABA → retorna `WHATSAPP_BUSINESS_REQUIRED` e o front mostra modal claro.
2. Publicar campanha de teste → conferir no Gerenciador que o anúncio aparece como **"Cliques no WhatsApp"** com `optimization_goal=CONVERSATIONS` e `destination_type=WHATSAPP`.
3. `ad-competitor-scraper` manual → 38 registros passam de 0 → ≥30 com `image_url`.
4. SuperAdmin → nova aba "IA & Aprendizado" mostra 4 cards verdes e timeline com últimos 30 eventos.
5. Disparar `Lead` de teste via formulário → `facebook_capi_events` registra com `event_id` único e `fb_response.events_received=1`.

## Pergunta antes de implementar

Confirma que o número que vai ser usado nos anúncios **já está em uma WABA oficial conectada à Página do Facebook** (Meta Business Suite → WhatsApp Manager → número aparece como "Conectado" e não "Pessoal")? Se ainda não está, eu sigo com o código pronto e te entrego o passo-a-passo de conexão WABA junto — mas o anúncio só publica depois que isso estiver feito.

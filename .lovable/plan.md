# Dashboard de Custo por Cliente (Meta Ads)

## O que vamos resolver

Hoje você gasta em anúncios no Facebook/Meta mas não sabe **quanto custou cada lead que entrou no WhatsApp** nem **quanto custou cada cliente aprovado**. Vamos integrar a Meta Ads API por consultor e criar gráficos claros.

## Conceitos (para ficar claro)

Cada contato que chega vai ser contado em **2 métricas diferentes**, lado a lado:

| Métrica | O que é | Como calcular |
|---|---|---|
| **CPL** (Custo por Lead) | Quanto custou alguém **entrar no WhatsApp** | Gasto ÷ nº de novos contatos (estágio `novo_lead`) |
| **CPA** (Custo por Aquisição) | Quanto custou alguém **virar cliente iGreen** | Gasto ÷ nº de contatos que chegaram em `aprovado` |

Exemplo: gastou R$ 100, entraram 7 no WhatsApp, 2 viraram aprovados → CPL = R$ 14,28 · CPA = R$ 50,00

**Resposta direta da sua pergunta:** o contato entra primeiro como **Lead** (estágio `novo_lead`). Só vira "cliente" quando chega em `aprovado`. Os 7 que você mencionou contam para o CPL agora; quando algum for aprovado, conta também para o CPA.

## Como funciona a coleta de gasto

1. Cada consultor conecta sua **conta de anúncios Meta** (via token de acesso da Meta Ads API).
2. Edge Function `meta-ads-sync` roda **1x por dia (07:00 BRT)** via `pg_cron` e busca o gasto de ontem por campanha.
3. Os dados ficam guardados em `meta_ads_daily_spend`.
4. O CRM já sabe quantos leads entraram por dia (tabela `customers` + `kanban_stages`), então calculamos CPL/CPA cruzando as duas fontes.

## Estrutura técnica

### Banco de dados

**Novas colunas em `consultants`:**
- `meta_access_token` (texto, criptografado via RLS owner-only)
- `meta_ad_account_id` (ex: `act_317035519061535`)
- `meta_business_id` (opcional)

**Nova tabela `meta_ads_campaigns`:**
- `id`, `consultant_id`, `campaign_id` (Meta), `campaign_name`, `status`, `created_at`

**Nova tabela `meta_ads_daily_spend`:**
- `id`, `consultant_id`, `campaign_id`, `date` (DATE), `spend` (numeric), `impressions`, `clicks`, `leads_meta` (leads que a Meta reporta)
- Unique: `(consultant_id, campaign_id, date)`
- RLS: consultor lê só os seus; admin lê tudo.

### Edge Functions

- `meta-ads-sync` — cron diário: para cada consultor com token, chama `/insights` da Meta Ads API e faz upsert.
- `meta-ads-connect` — recebe o token do consultor, valida em `/me/adaccounts`, salva.
- `meta-ads-disconnect` — limpa credenciais.

### Frontend

**Nova página `/admin/ads-roi`** com 4 seções:

1. **KPIs no topo** (cards): Gasto total · Leads · Aprovados · CPL médio · CPA médio · Período (date range picker).

2. **Gráfico de linha** — CPL e CPA ao longo do tempo (recharts `LineChart`, eixo X = data, 2 linhas).

3. **Funil de conversão com custos** — barras horizontais:
   ```text
   Novo Lead       ████████████ 100  (R$ 5,00/lead)
   Qualificando    ████████ 70       (R$ 7,14)
   Valor da Conta  ██████ 50         (R$ 10,00)
   Conta Enviada   ████ 30           (R$ 16,67)
   Doc Enviado     ███ 20            (R$ 25,00)
   Finalizando     ██ 12             (R$ 41,67)
   Aprovado        █ 8               (R$ 62,50 ← CPA)
   ```

4. **Tabela: Ranking de campanhas** — colunas: Campanha · Gasto · Leads · Aprovados · CPL · CPA · CTR. Ordenável por CPA.

5. **ROI por consultor** (só admin) — tabela: Consultor · Gasto · Leads · Aprovados · CPL · CPA · Taxa de conversão.

**Página `/admin/configuracoes` (aba "Integrações")** — botão "Conectar Meta Ads" para cada consultor colar o access token + selecionar ad account.

### Atribuição (lead ↔ campanha)

Para casar lead com campanha específica, vamos usar **UTM/CTWA** (Click-to-WhatsApp):
- O link `wa.me/...` na campanha leva parâmetro `?ref=campanha_X`
- O bot da Whapi captura `referral` do primeiro evento e salva em `customers.source_campaign`
- Se não houver `ref`, lead é atribuído à campanha ativa do consultor (fallback proporcional).

## Implementação em fases

**Fase 1 — Estrutura + conexão (1 migração + 2 edge functions)**
- Migração: tabelas + colunas + RLS
- Edge: `meta-ads-connect`, `meta-ads-disconnect`
- UI: aba "Integrações" com formulário

**Fase 2 — Sync de gasto**
- Edge: `meta-ads-sync` + cron 07:00 BRT
- Captura `source_campaign` no webhook Whapi

**Fase 3 — Dashboard**
- Página `/admin/ads-roi` com os 4 gráficos
- Hook `useAdsRoi(dateRange, consultantId?)` que agrega gastos × leads × aprovados

## O que você precisa providenciar

Para conectar sua conta agora, precisarei do **Access Token da Meta Ads API** (gerado em https://developers.facebook.com → seu app → Marketing API → Get Token, com escopo `ads_read`). Eu te explico o passo a passo quando aprovar o plano.

---

**Aprovar o plano?** Posso começar pela Fase 1 (estrutura + tela de conexão) e depois seguimos.

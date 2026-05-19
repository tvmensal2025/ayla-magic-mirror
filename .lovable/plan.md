# Dashboard Ads no /admin (por consultor) + visão multi-conta

## O que aparece no dashboard de cada consultor (/admin)

Cards no topo (período: 7d / 30d / custom):

- **Gasto Ads** (R$) — soma `ad_spend_daily.spend_cents`
- **Leads gerados** — count de `customers` criados no período (origem `whatsapp` + `facebook`)
- **CPL** — gasto / leads
- **Visitas LP** — count `page_views` no período
- **Custo por visita LP** — gasto / visitas
- **Taxa LP → Lead** — leads / visitas
- Mini-gráfico diário (gasto vs leads) — 14 dias

Tudo já filtrado por `consultant_id = auth.uid()` (RLS atual de `ad_spend_daily`, `customers`, `page_views`).

## Visão multi-conta (Rafael e futuros gestores)

Rafael (`rafael.ids@icloud.com`) precisa ver o dashboard dele **+ de outros consultores** que ele gerencia. Solução:

1. **Nova tabela `ad_account_managers**`
  ```
   manager_user_id uuid   -- auth.users.id do Rafael
   consultant_id   uuid   -- consultor gerenciado
   created_at, created_by
   PK (manager_user_id, consultant_id)
  ```
   RLS: super_admin gerencia; manager lê só as próprias linhas.
2. **Função SQL `get_managed_consultant_ids(_user uuid)**` retorna array de UUIDs:
  - sempre inclui o próprio `_user`
  - - tudo de `ad_account_managers` onde `manager_user_id = _user`
  - super_admin → todos
3. **Atualizar RLS** de `ad_spend_daily`, `page_views`, e leitura de `customers` para também permitir SELECT quando `consultant_id = ANY(get_managed_consultant_ids(auth.uid()))`.
4. **UI no /admin**: se o usuário gerencia >1 consultor, mostra um **seletor "Conta de anúncio"** no topo do dashboard (default = próprio). Trocar a conta refiltra todos os cards e gráficos.
5. **Tela em SuperAdmin → "Gestores de Conta"** para vincular consultores a um manager (multi-select). Só super_admin enxerga.

## Origem dos dados de gasto

`ad_spend_daily` já existe. Para popular:

- Edge function `facebook-spend-sync` (cron diário 06:00 BRT) lê `facebook_connections` de cada consultor, busca Insights da API Marketing (campaigns + spend + impressions + clicks + leads) e faz upsert por `(consultant_id, date)`.
- Reusa segredos `FACEBOOK_APP_ID`/`SECRET` já configurados.
- Fallback: se consultor sem conexão FB, mostra cards zerados com aviso "Conecte sua conta Meta Ads".

## Entregáveis técnicos

1. Migration:
  - tabela `ad_account_managers` + RLS
  - função `get_managed_consultant_ids`
  - update RLS de `ad_spend_daily` e `page_views` (adiciona policy "managed")
2. Edge function `facebook-spend-sync` + cron
3. Hook `useAdMetrics(consultantId, range)` agregando spend/leads/visits/CPL
4. Componente `AdMetricsCards` + `AdAccountSwitcher` em `DashboardTab.tsx`
5. Componente `ManagersTab` no SuperAdmin para vincular consultores ao Rafael
6. Seed inicial: vincular Rafael aos consultores que ele gerencia (você me passa a lista, ou eu mostro UI pra você selecionar)

## Perguntas rápidas

1. criar a UI agora e vincular depois
2. Sincronização do Facebook Ads: rodar  1x ao dia 06:00 (1x/dia 
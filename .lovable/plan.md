
# Dashboard Ads — WhatsApp Only + Gráficos

Reformular o bloco "Ad Metrics" no `/admin` (DashboardTab) para:
1. Remover métricas de Landing Page (visitas LP, custo/visita, LP→Lead).
2. Tratar **lead = novo customer no WhatsApp** dentro do período (origem `whatsapp` ou qualquer customer criado, conforme decisão abaixo).
3. Adicionar gráficos de evolução diária.

## Cards (KPIs) — versão final

| Card | Cálculo |
|---|---|
| Gasto Ads | sum(`ad_spend_daily.spend_cents`) no período |
| Leads WhatsApp | count(`customers`) criados no período do consultor selecionado |
| CPL | Gasto / Leads |
| Impressões | sum(`ad_spend_daily.impressions`) |
| Cliques | sum(`ad_spend_daily.clicks`) |
| CTR | cliques / impressões |

## Gráficos novos (Recharts, já no projeto)

1. **Gasto x Leads por dia** — LineChart duplo eixo (gasto em R$, leads em count) — últimos 30 dias.
2. **CPL diário** — AreaChart (spend_dia / leads_dia).
3. **Leads por consultor** (apenas para managers com >1 conta) — BarChart horizontal: total de leads no período por consultor gerenciado.
4. **Distribuição por estágio do CRM** — PieChart dos leads do período por `deals.stage` (novo_lead, qualificado, etc.).

## Mudanças técnicas

- **`useAdMetrics.ts`**: remover `pageViews`, `costPerVisit`, `lpConversion`. Adicionar `impressions`, `clicks`, `ctr`, e `daily: { date, spend, leads, cpl }[]`.
  - Leads = `customers` count agrupado por `date(created_at)` filtrado por `consultant_id`.
  - Gasto/cliques/impressões agrupados por `date` de `ad_spend_daily`.
- **Novo hook `useLeadsByConsultant(range, consultantIds[])`** — para o gráfico de barras (managers).
- **Novo hook `useLeadsByStage(consultantId, range)`** — agrega `deals` por `stage` no período.
- **`AdMetricsCards.tsx`**: trocar os 3 cards de LP por Impressões / Cliques / CTR.
- **Novo `AdMetricsCharts.tsx`**: 4 gráficos acima usando Recharts + tokens do design system (cores via `hsl(var(--primary))` etc.).
- **`DashboardTab.tsx`**: renderizar `<AdMetricsCards />` + `<AdMetricsCharts />` logo abaixo do `AdAccountSwitcher`.

## Pergunta antes de implementar

Como definir "Lead WhatsApp" no contador?
- (A) Todo `customer` criado no período do consultor.
- (B) Apenas `customers` com `customer_origin = 'lead_whatsapp'`.
- (C) Apenas customers que entraram em algum `deal` no período (estágio `novo_lead`).

Vou assumir **(A)** salvo indicação contrária — é o que melhor reflete "lead gerado pelo anúncio do WhatsApp".

## Arquivos a alterar/criar

- `src/hooks/useAdMetrics.ts` (refactor)
- `src/hooks/useLeadsByConsultant.ts` (novo)
- `src/hooks/useLeadsByStage.ts` (novo)
- `src/components/admin/dashboard/AdMetricsCards.tsx` (refactor)
- `src/components/admin/dashboard/AdMetricsCharts.tsx` (novo)
- `src/components/admin/DashboardTab.tsx` (montagem)

Sem migrations — tudo lido das tabelas já existentes (`ad_spend_daily`, `customers`, `deals`).

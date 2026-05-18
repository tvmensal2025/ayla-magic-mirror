# Plano: Reset de Performance + Dashboard Ampliado

## Situação atual

Banco tem dados acumulados desde **26/mar/2026**:
- `page_views`: 375 registros (visitas às LPs)
- `page_events`: 32 registros (cliques nos botões)
- `crm_page_events`: 91 registros (eventos do CRM)
- `facebook_capi_events`: 24 registros (eventos enviados ao Facebook)
- `facebook_metrics_daily`: 7 dias (gastos/resultados de anúncios)

Dashboard hoje mostra: Visitas totais, Cliques, Horários de pico, Dispositivos, UTM, Cliques por botão, Novos clientes/semana, Comparativo diário.

---

## Parte 1 — Limpar histórico (começar do zero a partir de hoje)

Apagar **apenas para o seu consultor logado** (não mexer nos outros licenciados que usam a plataforma), das tabelas:
- `page_views`
- `page_events`
- `crm_page_events`
- `facebook_capi_events`

**Não apagar:**
- `customers` / `crm_deals` (são clientes reais cadastrados, não métricas)
- `facebook_metrics_daily` (vem sincronizado da API do Facebook Ads — se apagar, volta no próximo sync)
- Mensagens WhatsApp (não é "performance", é histórico de conversa)

Confirmar com você antes de rodar o DELETE.

---

## Parte 2 — Novos gráficos no Dashboard

Adicionar 6 novos blocos puxando dados completos:

### 1. **Funil de Conversão** (gráfico de funil horizontal)
Visitas → Cliques no WhatsApp/Cadastro → Leads → Cadastros completos → Aprovados iGreen
Mostra % de conversão entre cada etapa. Identifica onde está perdendo cliente.

### 2. **Performance por Dia da Semana** (BarChart)
Visitas + cliques agrupados por seg/ter/qua… Descobre qual dia rende mais para concentrar anúncios.

### 3. **Tempo médio Lead → Cliente Aprovado** (StatCard + linha do tempo)
Calcula `customers.approved_at - customers.created_at`. Mostra ciclo de venda médio em dias.

### 4. **Top Campanhas UTM** (tabela ranqueada)
Não só `utm_source`, mas combinação `source + medium + campaign` com:
- Visitas
- Cliques
- Cadastros gerados
- Taxa de conversão
- CPL estimado (se vier do Facebook)

### 5. **Mensagens WhatsApp por dia** (AreaChart)
Volume de mensagens enviadas + recebidas do `bot_messages`/`conversations`. Mostra atividade do bot.

### 6. **ROI dos Anúncios Facebook** (cards + gráfico)
Cruza `facebook_metrics_daily` (gasto, impressões, cliques) com `customers` cadastrados no mesmo período:
- Custo por Lead (CPL real)
- Custo por Cliente Aprovado (CAC)
- ROAS estimado

### 7. **Comparativo semana atual vs semana anterior** (StatCards com setas ↑↓)
Visitas, Cliques, Leads, Aprovados — com % de variação.

---

## Detalhes técnicos

- **Reset**: `DELETE FROM page_views WHERE consultant_id = ?` (e demais tabelas). Via migration ou query direta após confirmação.
- **Hook `useAnalytics`** ganha campos novos: `funnel`, `weekday`, `cycleTime`, `topCampaigns`, `weekComparison`.
- **WhatsApp daily**: novo hook `useWhatsAppActivity` consultando `bot_messages` agregado por dia.
- **Facebook ROI**: novo hook que combina `facebook_metrics_daily` + count de `customers` por dia.
- **Componente novo**: `src/components/admin/FunnelChart.tsx`, `WeekdayChart.tsx`, `CampaignsTable.tsx`, `WeekComparisonCards.tsx`.
- **DashboardTab.tsx**: importa os novos blocos abaixo dos atuais.

---

## Pergunta antes de executar

1. **Reset confirmado?** Apagar 375 visitas + 32 cliques + 91 eventos CRM + 24 eventos Facebook do **seu consultor** (outros licenciados não são afetados)?
2. **Quais novos gráficos priorizar?** Posso fazer todos os 7, ou você prefere começar pelos 3 mais críticos (Funil, ROI Facebook, Comparativo semanal)?

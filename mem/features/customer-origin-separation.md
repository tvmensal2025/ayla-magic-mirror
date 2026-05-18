---
name: Customer Origin Separation
description: Isolamento total entre Leads WhatsApp, Clientes iGreen sincronizados e Rede em Kanban, métricas, dashboards, envio em massa e anúncios
type: feature
---

`customers.customer_origin` divide o universo de pessoas em três grupos que NUNCA podem misturar:

- `whatsapp_lead` / `manual` → leads do bot WhatsApp / cadastro manual. Entram no Kanban CRM, contam como "Leads" em KPIs e gráficos.
- `igreen_sync` → carteira sincronizada do portal iGreen pelo edge `sync-igreen-customers`. NUNCA viram cards no Kanban de leads. Aparecem só na aba "Clientes iGreen" e em métricas de carteira (Total de Clientes, kW, Top Licenciados, Status Donut, semanas de novos clientes).
- Rede / Licenciados (`network_members`) → tabela separada, só na aba Rede.

## Hard locks

- Trigger `prevent_non_lead_deals` em `crm_deals` BEFORE INSERT/UPDATE: bloqueia se `customer.customer_origin = 'igreen_sync'`.
- `useKanbanDeals` filtra `customer_origin in ('whatsapp_lead','manual', null)`.
- `useAnalytics` separa `leadCustomers` × `walletCustomers`:
  - Funil "Leads"/"Aprovados", `curLeads/prevLeads/sparkLeads` → leadCustomers.
  - "Aprovados" hero KPI, `topLicenciados`, `customersByStatus`, `totalCustomers`, `totalKw`, `avgKw`, `weeklyNewCustomers` → walletCustomers.
- `DashboardTab.filteredMetrics` e `licenciadoOptions` → walletCustomers.
- `BulkSendPanel`: status filters mudam por tab (carteira: Aprovado/Reprovado/Em análise; leads: Em conversa/Convertido/Falha). Devolutiva e Licenciado só aparecem em `igreen_sync`. Trocar de tab reseta os demais filtros.
- `LeadSourceCard` já filtrava `whatsapp_lead`.
- `ResultsDashboard` (anúncios) conta `acquired` só com `customer_origin in ('whatsapp_lead','manual')` E `lead_source` ads.
- Página `WhatsAppClientsPage` tem abas que isolam visualmente.

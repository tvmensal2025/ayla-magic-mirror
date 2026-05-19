
# Reorganização /admin — Dashboard só iGreen, tudo de Ads na Central

## Estado atual
- `DashboardTab` tem 3 sub-tabs: **Visão Geral** (cards Ads + MainChart + CpcPanel + RecentClicks + FunnelStrip), **Anúncios & Origem** (ResultsDashboard + LeadSourceCard) e **Clientes iGreen**.
- `AdsCentralTab` (aba "Central de Anúncios") tem 3 views: Modelos / Campanhas / Inteligência.
- `PerformanceTab` é uma aba separada no topo.

## Objetivo
- **Dashboard** volta a ser exclusivamente "Clientes iGreen" — como era antes (StatCards + CustomerCharts + filtro de licenciado + botão Sincronizar iGreen).
- **Central de Anúncios** absorve tudo de anúncio/performance, organizado em sub-views.

## Mudanças

### 1. `DashboardTab.tsx` — enxugar
- Remover as 3 sub-tabs.
- Remover imports/uso de: `AdMetricsCards`, `AdMetricsCharts`, `AdAccountSwitcher`, `MainChart`, `CpcPanel`, `RecentClicks`, `FunnelStrip`, `ResultsDashboard`, `LeadSourceCard`, `WalletChip`, `TerminalTicker`, `useManagedConsultants`, `adAccountId`.
- Manter toolbar slim: período + PDF + Resetar (resetar continua útil para limpar tracking).
- Renderizar direto o bloco "Clientes iGreen" (header com filtro + Sincronizar, StatCards, `CustomerCharts`).
- Limpar imports de ícones não usados (Megaphone, Target, LayoutDashboard, Eye etc.).

### 2. `AdsCentralTab.tsx` — virar hub completo
Reestruturar as views (toggle no topo) para:
- **Dashboard** (novo, default) — toolbar com `WalletChip` + `AdAccountSwitcher` + período; depois `AdMetricsCards` + `AdMetricsCharts` + `MainChart` + `CpcPanel` + `RecentClicks` + `FunnelStrip` + `LeadSourceCard`.
- **Modelos** (atual gallery)
- **Campanhas** (atual)
- **Performance** (atual `ResultsDashboard`, movido pra cá — embute o conteúdo de `PerformanceTab` aqui)
- **Inteligência** (atual)

Toggle vira: `Dashboard | Modelos | Campanhas | Performance | Inteligência`. Default = Dashboard.

Period selector local (state interno na Central, padrão 30) já que o `periodDays` global do Dashboard não chega aqui — passar via prop é opcional, mas mais simples manter local.

### 3. `Admin.tsx` — remover aba Performance duplicada
- Remover item `{ id: "performance", ... }` do array `tabs` e o bloco `activeTab === "performance"`.
- Manter import lazy só se ainda for usado pela Central (vou importar direto `ResultsDashboard` dentro da Central, então `PerformanceTab` pode sair).
- Atualizar tipo do `activeTab` removendo `"performance"`.

## Arquivos a alterar
- `src/components/admin/DashboardTab.tsx` (enxugar drasticamente)
- `src/components/admin/ads/AdsCentralTab.tsx` (adicionar views Dashboard + Performance)
- `src/pages/Admin.tsx` (remover aba Performance)

Sem migrations. Sem mudanças de business logic — apenas reorganização de UI/composição.

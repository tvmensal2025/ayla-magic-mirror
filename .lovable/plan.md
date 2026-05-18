
## Objetivo

A aba **Dashboard** (`/admin → Dashboard`) hoje destaca Visualizações de LP, Página Cliente, Página Licenciado e cliques na LP. Como o tráfego real virá quase 100% de anúncios → WhatsApp (CTWA), vamos reformular o Dashboard para mostrar **performance de anúncios em primeiro plano**, com clientes iGreen logo abaixo e LP no rodapé (apenas como referência opcional).

Tudo aproveita componentes que já existem: `ResultsDashboard`, `HealthSummaryCard`, `InsightCards`, `LeadSourceCard`, `WalletChip`. Não cria tabelas novas — só reorganiza a tela.

## Resposta rápida à 1ª pergunta

Sim — tudo da pesquisa (Adicionou auto-tag do Meta Ads, `lead_source` na DB, auto-tag no backend, gráfico de fontes, variante LP CTWA) **já está implementado** (commits anteriores). Falta apenas refletir isso no Dashboard.

## Nova estrutura do Dashboard

```text
┌─ Cabeçalho ───────────────────────────────────────┐
│ Período (7/15/30/90)   [Exportar PDF]   [Wallet]  │
├─ 1. ANÚNCIOS (foco principal) ───────────────────┤
│ HealthSummaryCard (semáforo geral)                │
│ InsightCards (recomendações da IA)                │
│ 6 StatCards: Gasto | Viram | Tocaram |            │
│              Conversas zap | Viraram cliente |    │
│              Lucro estimado/mês                   │
│ Card "Custo real por cliente novo"                │
│ Gráfico diário (gasto × leads × cadastros)        │
│ Tabela por campanha                               │
├─ 2. ORIGEM DOS LEADS ─────────────────────────────┤
│ LeadSourceCard (meta_ads vs organic vs indicação) │
├─ 3. CLIENTES iGREEN ──────────────────────────────┤
│ Filtro licenciado + botão Sincronizar             │
│ StatCards: Total | kW | Conversão                 │
│ CustomerCharts                                    │
├─ 4. LANDING PAGE (colapsável, recolhido) ─────────┤
│ "Ver tráfego da landing page" ▾                   │
│   - Visualizações, Página Cliente, Licenciado     │
│   - Cliques nos botões                            │
│   - AnalyticsCharts                               │
└───────────────────────────────────────────────────┘
```

## Arquivos a modificar

1. **`src/components/admin/DashboardTab.tsx`** — reordenar layout:
   - Adicionar no topo (após cabeçalho): seção **"📊 Performance dos seus anúncios"** que renderiza `<ResultsDashboard consultantId={userId} />` (sem o `onCreateClick`, ou apontando para mudar de aba).
   - Mover `LeadSourceCard` para logo abaixo.
   - Manter bloco "Clientes iGreen" como está.
   - Envolver os 4 StatCards de LP + `AnalyticsCharts` em um `<Collapsible defaultOpen={false}>` rotulado **"Tráfego da landing page (opcional)"**.

2. **Pequeno ajuste em `ResultsDashboard.tsx`**:
   - Quando renderizado dentro do Dashboard, o seletor de período próprio (7/30/90) fica redundante com o do Dashboard. Adicionar prop opcional `hidePeriodSelector?: boolean` e `range?: Range` controlados de fora — quando recebido, usar o `periodDays` do Dashboard (mapeado para o range mais próximo: 7→7, 15/30→30, 90→90).

3. **`WalletChip`** — adicionar no cabeçalho do Dashboard (ao lado do Exportar PDF) pra mostrar saldo da conta de anúncios em destaque.

## Detalhes técnicos

- Nada de migração; `facebook_campaigns`, `facebook_metrics_daily`, `customers.lead_source` já existem.
- Componentes reusados: `ResultsDashboard`, `HealthSummaryCard`, `InsightCards`, `LeadSourceCard`, `WalletChip`, `CustomerCharts`, `AnalyticsCharts`, `StatCard`.
- Colapsável: usar `@/components/ui/collapsible` (Radix) que já existe no shadcn.
- O PDF exportado (`handleExportPdf`) continua funcionando — captura o `dashboardRef.current` que envolve toda a árvore, incluindo a nova seção de anúncios.
- Sem mudanças em edge functions, RLS ou esquema.

## Fora do escopo

- Não tocar em `AdsTab`, wizard, ou na lógica de criação de campanha.
- Não criar novos endpoints — apenas reorganização de UI.
- LP traffic continua sendo coletado normalmente, só fica recolhido por padrão.

# Redesign do Dashboard — visual premium e organizado

## Problema atual
- Vários blocos empilhados sem hierarquia (PerformanceCharts, Ads, LeadSource, Clientes, Tráfego colapsável) — parece "lista", não dashboard.
- KPIs principais escondidos no meio.
- "Cliques nos botões" mostra apenas total — não detalha o valor de cada CTA (WhatsApp, Cadastro, Telefone, Instagram…).
- Toolbar superior com 4 botões soltos no canto, sem identidade.

## Solução

### 1. Hero header do dashboard
Faixa superior com gradiente sutil (verde primário) contendo:
- Saudação + nome do consultor + período ativo
- 4 KPIs grandes em destaque: **Visitas**, **Cliques totais**, **Leads novos**, **Aprovados** — cada um com mini-sparkline dos últimos 7 dias e chip de variação (↑/↓ %).
- Toolbar discreta à direita (período, exportar, resetar, sincronizar) — agrupada num único container glass.

### 2. Novo card "Valor de cada clique" (substitui o atual genérico)
Grid de **CTAs reais** com ícone, label amigável e contagem destacada:

```text
┌───────────────────┬───────────────────┬───────────────────┐
│ 💬 WhatsApp       │ 📋 Cadastro       │ 📞 Telefone       │
│   142 cliques     │   58 cliques      │   12 cliques      │
│   ↑ 23% vs sem.   │   ↓ 8% vs sem.    │   estável         │
│   ▂▃▅▆▇ sparkline │   ▂▂▃▃▂          │   ▁▁▁▂▁          │
├───────────────────┼───────────────────┼───────────────────┤
│ 📸 Instagram      │ 💼 Licenciada     │ 📘 Facebook       │
│   ...             │   ...             │   ...             │
└───────────────────┴───────────────────┴───────────────────┘
```

Usa `clicksByTarget` que já existe + `friendlyClickLabel` + nova série diária por target para sparkline.

### 3. Reorganização em 3 abas internas (dentro do Dashboard)
Substituir a pilha vertical por **Tabs**:

- **Visão Geral** — Hero KPIs + Funil + Comparativo semanal + Valor de cada clique
- **Anúncios & Origem** — ResultsDashboard (Facebook Ads) + LeadSourceCard + Top Campanhas UTM + Performance por dia da semana
- **Clientes iGreen** — StatCards de clientes + filtro licenciado + CustomerCharts + sincronizar

Tráfego da LP vira sub-bloco colapsável dentro de "Visão Geral".

### 4. Polimento visual
- Todos os cards: mesma `premium-card` com `border border-border/40`, `rounded-2xl`, hover sutil com glow verde.
- Tipografia: títulos em `font-heading font-bold text-base` (subir do `text-sm` atual), descrições em `text-xs text-muted-foreground`.
- Espaçamento padrão `gap-5` entre cards, `space-y-6` entre seções.
- Ícones sempre num círculo `bg-primary/10 text-primary p-2 rounded-xl` (consistência).
- Funil ganha animação de largura ao montar (CSS transition já existe — aumentar para 800ms com delay escalonado).

## Arquivos

**Novos**
- `src/components/admin/dashboard/HeroKpis.tsx` — header com 4 KPIs + sparklines
- `src/components/admin/dashboard/ClickValueGrid.tsx` — grid de CTAs com valor de cada clique
- `src/components/admin/dashboard/DashboardToolbar.tsx` — toolbar agrupada (período/export/reset/sync)

**Editados**
- `src/components/admin/DashboardTab.tsx` — reestruturar com Tabs (`@/components/ui/tabs`), montar HeroKpis no topo, mover blocos para abas
- `src/hooks/useAnalytics.ts` — adicionar série diária por click target (`clicksByTargetDaily`) para sparklines + comparação semanal por target
- `src/components/admin/PerformanceCharts.tsx` — remover bloco "Esta Semana vs Semana Anterior" (vira parte do HeroKpis), manter funil/weekday/campaigns

## Detalhes técnicos
- Sparklines: usar `recharts` `<AreaChart>` mini (sem eixos, height 32px) ou inline SVG simples para performance.
- Tabs: shadcn `Tabs/TabsList/TabsTrigger/TabsContent` — manter URL hash `#visao`, `#anuncios`, `#clientes` opcional (não bloqueia).
- Não toca em backend, RLS, edge functions, schema ou edge-function logic.
- Mantém compatibilidade com `useAnalytics` existente — só estende o retorno.

## Fora do escopo
- Não mexer em métricas WhatsApp (mensagens, presence) — feito na rodada anterior.
- Não criar novos hooks de backend.
- Não alterar `ResultsDashboard`, `LeadSourceCard`, `CustomerCharts` internamente — só repor.

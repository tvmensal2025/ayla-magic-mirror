## Diagnóstico do que está ruim

Olhando a tela atual:
- **Carteira Ativa** ocupa 1/4 do hero mas é número estático que confunde junto com KPIs de período
- **Visual editorial** ficou polido demais, sem "wow" — você quer terminal denso
- **Funil + Heatmap + Origens** empilhados verticalmente = muito scroll, pouca informação por tela
- **Não tem o gráfico de evolução grande** que mostra o pulso do negócio
- **Cliques** estão diluídos numa lista — você quer destaque para CPC, quem clicou, quantos clientes únicos

## Nova direção: Bloomberg Terminal

Paleta travada:
- Fundo: `#000000` puro
- Painéis: `#0a0f0a` com borda `#1a2e1a` (1px hairline)
- Verde fósforo: `#22c55e` (dados positivos / volume)
- Âmbar: `#fbbf24` (alertas / CTAs secundários)
- Cinza terminal: `#3f3f3f` (labels), `#737373` (axis)
- Tipo: **JetBrains Mono** para todos os números (tabular, terminal vibe). Heading Montserrat preto para títulos de painel.
- Sem gradientes, sem glow, sem rounded-2xl. Tudo `rounded-sm` ou reto. Tickers e separadores `│`.

## Layout novo (top → bottom)

```text
┌─ STATUS BAR ────────────────────────────────────────┐
│ ● LIVE  PERIOD: 30D  │  21:34 BRT  │  [Sync] [PDF]  │
├─ TICKER STRIP (3 KPIs slim, sem Carteira) ──────────┤
│ VISITAS 39 ▲12%  │  CLIQUES 14 ▲40%  │  LEADS 10 ▬ │
├─ MAIN CHART (60vh) ─────────────────────────────────┤
│  EVOLUÇÃO DIÁRIA — visitas/cliques/leads sobrepostos│
│  linhas finas, grid invisível, eixos mono, crosshair│
├─ CLIQUES PANEL (2 colunas) ─────────────────────────┤
│ ┌─ CPC POR CTA ──────┐ ┌─ CLIENTES QUE CLICARAM ──┐│
│ │ #1 WhatsApp  R$2.14│ │ • João Silva  3 cliques  ││
│ │    9 cliques  64%  │ │ • Maria Souza 2 cliques  ││
│ │ #2 Cadastro  R$3.80│ │ • +12 anônimos           ││
│ │    5 cliques  36%  │ │ Total único: 14 visitantes││
│ └────────────────────┘ └──────────────────────────┘│
├─ FUNIL HORIZONTAL (slim) ───────────────────────────┤
│ VISITAS 39 → CLIQUES 14 (36%) → LEADS 10 (71%) → APR 0 (0%)
└─────────────────────────────────────────────────────┘
```

Carteira Ativa, Receita Potencial e KPIs de cliente vão para aba **"Clientes iGreen"** (já existe). Visão Geral foca 100% em **tráfego e conversão da landing page**.

## Componentes afetados

- `src/components/admin/dashboard/HeroKpis.tsx` — vira **TickerStrip** (3 colunas slim, sem Carteira, fonte mono).
- `src/components/admin/dashboard/MainChart.tsx` (**novo**) — Recharts AreaChart minimal preto/verde/âmbar, altura ~360px, crosshair customizado, tooltip terminal-style.
- `src/components/admin/dashboard/CpcPanel.tsx` (**novo**) — Custo por clique por CTA. Pega gasto total do `ResultsDashboard`/Facebook Ads (já tem `WalletChip`) e divide por cliques da CTA. Se não houver gasto, mostra "—".
- `src/components/admin/dashboard/ClickerList.tsx` (**novo**) — Lista de clientes que clicaram (join `page_events.click` com `customers` via session_id/phone), agrupado por cliente com count de cliques. Anônimos agregados.
- `src/components/admin/PerformanceCharts.tsx` — vira **FunnelStrip** horizontal compacto (uma linha só) + Origens vira tabela densa mono. Heatmap movido para baixo / collapsable.
- `src/components/admin/DashboardTab.tsx` — reorganiza ordem e remove `ClickValueGrid` antigo, adiciona status bar terminal no topo.
- `src/index.css` — adiciona tokens `--terminal-bg`, `--terminal-line`, `--terminal-green`, `--terminal-amber`; importa **JetBrains Mono** do Google Fonts.
- `tailwind.config.ts` — registra `font-mono: ['JetBrains Mono', ...]`.

## Hook `useAnalytics.ts`

Adicionar:
- `uniqueClickers`: contagem distinta de `session_id` em `page_events` tipo click no período.
- `clickerList`: top N (`session_id` + telefone/nome se houver customer match) com count.
- `cpcByTarget`: para cada CTA, divide gasto (precisa de input do Facebook Ads — se ausente, retorna `null`).

Manter `walletSnapshot` mas **não consumir mais** na Visão Geral (fica para tab Clientes).

## Dados ainda errados — confirmar

Os KPIs já respeitam `periodDays` desde a última iteração. Se ainda parece errado, o mais provável é:
1. `page_views` zerados porque GA não dispara em preview — verificar contagem real no Supabase.
2. Cliques não atribuídos a leads (sem `session_id` no `customers`). Esse plano expõe isso na lista de clickers.

Vou rodar uma query rápida em `page_views` + `page_events` antes de implementar para confirmar volumes reais.

## Fora do escopo
- Abas Anúncios e Clientes iGreen ficam intocadas nesta rodada.
- Heatmap pode virar collapsible no rodapé (manter só se você quiser).

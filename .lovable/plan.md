
# Redesign: Página de Parceiros → Dashboard de Performance

A aba atual (`ParceirosTab`) é só um card simples com lista de parceiros + bloco de "leads por parceiro". Vamos transformá-la num **dashboard analítico** estilo `/admin/saude-producao`, mantendo a CRUD existente mas adicionando KPIs, gráficos e ranking visual.

## O que muda visualmente

```text
┌─────────────────────────────────────────────────────────────┐
│  Parceiros Indicadores                       [+ Novo]       │
│  Acompanhe captação, conversão e cashback por parceiro      │
├─────────────────────────────────────────────────────────────┤
│ [KPI] Parceiros ativos  [KPI] Leads 30d                     │
│ [KPI] Conversão média   [KPI] Top parceiro do mês           │
├──────────────────────────┬──────────────────────────────────┤
│ Leads por parceiro       │  Evolução 30 dias (linha)        │
│ (barras horizontais)     │  por parceiro, multi-série       │
├──────────────────────────┼──────────────────────────────────┤
│ Funil por parceiro       │  Origem dos leads                │
│ Lead → Conta → Aprovado  │  (QR vs Palavra-chave - donut)   │
├──────────────────────────┴──────────────────────────────────┤
│  Ranking detalhado (tabela) — substitui PartnerList         │
│  Nome | Keywords | Leads | Aprovados | Conv% | Últ.30d | ⋯ │
└─────────────────────────────────────────────────────────────┘
```

## KPIs no topo (4 cards)

Usar `StatCard` já existente (`src/components/admin/StatCard.tsx`) com ícones lucide:
- **Parceiros ativos** — `partners.length`
- **Leads 30 dias** — soma de `customers` com `referral_partner_id` not null nos últimos 30d
- **Taxa de conversão média** — % de leads que chegaram em `pos_venda_stage` aprovado
- **Top parceiro do mês** — nome + nº leads

## Gráficos (Recharts — já no projeto)

1. **Barras horizontais** — Leads totais por parceiro (substitui o `PartnerMetrics` atual, mais visual)
2. **Linha multi-série 30d** — `referral_detected_at` agrupado por dia, uma série por parceiro (top 5)
3. **Funil empilhado** — por parceiro: novo_lead → enviou_conta → aprovado (a partir de `customers.conversation_step` / `pos_venda_stage`)
4. **Donut origem** — distribuição entre QR Code (`lead_source_detail->>'source' = 'qr_code'`) vs palavra-chave (texto) vs outros

## Ranking (substitui PartnerList)

Tabela densa com:
- Avatar/iniciais coloridas, nome
- Keywords como chips
- Métricas numéricas tabulares (leads, aprovados, conv%, últimos 30d com mini-sparkline)
- Trend arrow (↑/↓ vs 30d anteriores)
- Ações (QR, editar, excluir) num menu `⋯`
- Ordenação por coluna; busca por nome/keyword

## Estados vazios

- Sem parceiros: hero ilustrado convidando a criar o primeiro
- Sem leads ainda: KPIs em 0 e gráficos com placeholder "Aguardando primeiros leads"

## Detalhes técnicos

**Arquivos novos:**
- `src/components/admin/parceiros/PartnerDashboard.tsx` — container do novo layout
- `src/components/admin/parceiros/PartnerKpiRow.tsx` — 4 StatCards
- `src/components/admin/parceiros/PartnerLeadsBarChart.tsx` — barras horizontais
- `src/components/admin/parceiros/PartnerTrendChart.tsx` — linha 30d
- `src/components/admin/parceiros/PartnerFunnelChart.tsx` — funil
- `src/components/admin/parceiros/PartnerOriginDonut.tsx` — donut origem
- `src/components/admin/parceiros/PartnerRankingTable.tsx` — substitui `PartnerList`
- `src/components/admin/parceiros/hooks/usePartnerAnalytics.ts` — query consolidada

**Arquivos editados:**
- `src/components/admin/parceiros/ParceirosTab.tsx` — usar `PartnerDashboard` no lugar de `PartnerMetrics` + `Card<PartnerList>`
- (manter `PartnerForm` e `PartnerQrCode` inalterados)

**Backend (1 migração nova):**
RPC `get_referral_partner_analytics()` retornando, por parceiro do `auth.uid()`:
- `partner_id`, `nome`, `keywords`
- `leads_total`, `leads_30d`, `leads_prev_30d` (para trend)
- `aprovados`, `conv_rate`
- `qr_count`, `keyword_count`
- `daily_series JSONB` (array `{date, count}` últimos 30d)
- `funnel JSONB` (`{novo_lead, conta_recebida, aprovado, reprovado}`)

Mantém `get_referral_partner_metrics()` (não quebra nada). Função `STABLE SECURITY DEFINER` com `search_path = public`, filtrando por `consultant_id = auth.uid()`. Sem alterações de tabela, sem novas RLS.

**Design system:** usa apenas tokens semânticos (`bg-card`, `text-primary`, `border-border`), Recharts com cores HSL do tema, mesmo estilo glassmorphism dark já usado em `/admin/saude-producao` e `StatCard`.

## Fora do escopo

- Não mexe em `PartnerForm`, `PartnerQrCode`, `useReferralPartners` (CRUD intacto)
- Não altera webhook, lógica de atribuição de parceiro, ou tabelas
- Não toca em outras abas do `/admin`

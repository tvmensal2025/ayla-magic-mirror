# Captação > Parceiros — redesign com header do licenciado e ranking gamificado

## Objetivo

Deixar a aba **Parceiros** mais clara, com o licenciado em destaque no topo (dados que já chegam automáticos do consultor logado) e um ranking elaborado que cria competição entre os parceiros. Tudo com a pasta `parceiros/` organizada em subpastas por papel.

## O que muda na tela

1. **Topo — Cartão do Licenciado (novo)**
   - Avatar (foto do consultor) + nome + CLI/igreen_id + telefone
   - Badge "Você" para deixar claro que é o dono da página
   - Botões: copiar link público da LP + abrir QR code do próprio licenciado
   - 3 KPIs mini do mês: leads totais, conversão %, cashback estimado
   - Fonte dos dados: vem das props que `Admin.tsx` já passa (`consultantName`, `consultantPhone`, `consultantIgreenId`) + foto/igreen_id via `useConsultant` se necessário. Sincronização do api-voffice já mantém esses campos atualizados — nenhum input manual.

2. **Faixa de KPIs gerais** (mantém `PartnerKpiRow`, só com refino visual)

3. **Pódio Top 3 do mês (novo)** — substitui o início da tabela
   - 1º, 2º e 3º lugares em cards grandes com medalha (ouro/prata/bronze)
   - Mostra: leads no mês, variação vs mês anterior, badge especial ("🔥 Em alta", "🆕 Novato", "👑 Campeão")
   - Animação leve de entrada (framer-motion) — só pulse sutil no 1º lugar

4. **Tabela de ranking elaborada** (refatora `PartnerRankingTable`)
   - Coluna nova "Posição" com #1, #2, #3 destacados
   - Coluna "Streak" (dias seguidos com lead) — gamificação
   - Coluna "Badges" com selos (Campeão do mês, Em alta, Novato, Consistente)
   - Barra de progresso na coluna "Leads" comparando com o líder
   - Filtros: período (7/30/90 dias), apenas ativos, busca (já existe)
   - Mantém ações (QR, editar, excluir)

5. **Gráficos** (mantém os 4 existentes — `LeadsBarChart`, `TrendChart`, `FunnelChart`, `OriginDonut`) em grid 2x2 mais compacto

## Organização da pasta (refactor sem mudar comportamento)

Antes:
```text
parceiros/
  ParceirosTab.tsx
  PartnerDashboard.tsx
  PartnerForm.tsx
  PartnerFunnelChart.tsx
  PartnerKpiRow.tsx
  PartnerLeadsBarChart.tsx
  PartnerList.tsx          (não usado mais — remover)
  PartnerMetrics.tsx       (não usado mais — remover)
  PartnerOriginDonut.tsx
  PartnerQrCode.tsx
  PartnerRankingTable.tsx
  PartnerTrendChart.tsx
  hooks/
```

Depois:
```text
parceiros/
  ParceirosTab.tsx                  (entrypoint, fino)
  PartnerDashboard.tsx              (orquestra as seções)
  header/
    LicenseeHeader.tsx              (NOVO — topo do licenciado)
    LicenseeKpis.tsx                (NOVO — 3 mini KPIs do dono)
  ranking/
    PodiumTop3.tsx                  (NOVO — pódio 1º/2º/3º)
    RankingTable.tsx                (renomeado de PartnerRankingTable)
    RankingBadges.tsx               (NOVO — lógica de selos)
    useRankingRows.ts               (NOVO — derivação dos rows)
  charts/
    KpiRow.tsx
    LeadsBarChart.tsx
    TrendChart.tsx
    FunnelChart.tsx
    OriginDonut.tsx
  forms/
    PartnerForm.tsx
    PartnerQrCode.tsx
  hooks/
    useReferralPartners.ts
    usePartnerAnalytics.ts
    useLicenseeStats.ts             (NOVO — KPIs agregados do dono)
```

Arquivos **removidos** (já não referenciados): `PartnerList.tsx`, `PartnerMetrics.tsx`.

## Lógica de badges (RankingBadges.tsx)

Pura, derivada dos dados que já vêm de `get_referral_partner_analytics`:

- 👑 **Campeão do mês** — 1º colocado em `leads_30d`
- 🔥 **Em alta** — `trend >= +30%` vs mês anterior
- 🆕 **Novato** — `created_at` nos últimos 30 dias e já tem ≥1 lead
- 🎯 **Alta conversão** — `aprovados/leads_total >= 40%` com mínimo 5 leads
- ⚡ **Sequência** — `streak >= 3` dias seguidos (derivado de `daily_series`)

Tudo calculado no cliente, sem migration nova.

## Detalhes técnicos

- **Zero backend novo**. Reusa `get_referral_partner_analytics` que já retorna `daily_series`, `leads_30d`, `leads_prev_30d`, `aprovados`, etc.
- **Streak** é derivado contando dias consecutivos com `count>0` no final de `daily_series`.
- **Cashback estimado** do licenciado: `aprovados_totais * valor_medio_lead`. Se ainda não houver coluna de valor médio, mostra apenas "leads aprovados".
- **Imports atualizados** em `Admin.tsx` e em `ParceirosTab.tsx` para os novos caminhos.
- **Sem mudança de schema**, sem mudança de RLS, sem nova edge function.

## Fora de escopo

- Mexer no `referral_partners` table (schema fica intacto)
- Adicionar valor monetário de cashback (sem coluna no banco hoje)
- Notificações/email de ranking (pode vir depois)
- Telas de licenciada / SuperAdmin (só Admin do consultor)

## Próximo passo

Aprovar este plano. Na execução vou: (1) criar as subpastas e mover os arquivos com imports atualizados, (2) criar `LicenseeHeader`, `LicenseeKpis`, `PodiumTop3`, `RankingBadges`, `useRankingRows`, `useLicenseeStats`, (3) reescrever `PartnerDashboard` para a nova composição, (4) deletar `PartnerList.tsx` e `PartnerMetrics.tsx`.

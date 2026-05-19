# Inteligência de Captação — SuperAdmin

Objetivo: parar de perder cliente. Centralizar tudo que envolve **trazer lead → converter → fechar** numa única tela no SuperAdmin, com IA cruzando funil + criativos + concorrentes.

---

## 1. Reorganização do /admin (consultor)

A aba de Tráfego atual (Horários de Pico, Dispositivos, Origem, Comparativo diário) sai do dashboard do consultor — esses dados são gerenciais, não acionáveis para o consultor individual.

- Mover esses 4 cards para o SuperAdmin → aba nova **"Captação"**.
- No `/admin` do consultor, deixar só o que ele usa: leads, WhatsApp, CRM, materiais.

## 2. Nova aba no SuperAdmin: "Captação"

Estrutura em 3 blocos:

### Bloco A — KPIs do topo (cards)

```text
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Gasto Total Ads │ Leads Gerados   │ CPL Real        │ Valor Carteira  │
│ R$ 12.450 (Meta)│ 287 (page_views │ R$ 43,37        │ R$ 1.2M         │
│ últimos 30d     │ → customers)    │ gasto/leads     │ (deals open+won)│
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ Taxa Conversão  │ Ticket Médio    │ ROAS            │ Leads Perdidos  │
│ LP → Lead: 8.2% │ R$ 4.180        │ 3.4x            │ 42 (sem resposta│
│ Lead → Cliente  │ por venda fechada│ retorno/gasto  │ +7d ou parado)  │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

Origem dos dados:

- **Facebook Ads API** (já temos `useFacebookConnection` + `facebookAds.ts`): gasto, impressões, cliques, CPC por consultor.
- **Interno** (Supabase): `page_views`, `customers`, `deals`, `customer_deals` para leads, conversão, carteira.
- **CPL Real** = gasto Meta / leads efetivamente criados (não cliques).
- **Valor Carteira** = soma de `deals.value` por status (aberto vs fechado).

### Bloco B — Os 4 gráficos que vieram do /admin

Horários de Pico, Dispositivos, Origem do Tráfego, Comparativo diário — agora globais (todos consultores) com filtro por consultor.

### Bloco C — Inteligência de Captação (IA)

Painel único que junta o que já existe disperso (`InsightsPanel`, `CompetitorsPanel`, `LearnedPatternsPanel`, `ad_competitor_creatives`) + análise nova de funil:

```text
┌───────────────────────────────────────────────────────────────────────┐
│  🧠 IA — Diagnóstico de Captação (atualizado há 2h)                   │
├───────────────────────────────────────────────────────────────────────┤
│  📉 ONDE VOCÊ ESTÁ PERDENDO:                                          │
│  • 38% dos leads param no estágio "aguardando_documentos" >5 dias     │
│  • Variante de fluxo B (sem áudio) converte 22% menos que A           │
│  • Anúncios com headline "economia" CPL R$ 67 vs "desconto" R$ 31     │
│                                                                       │
│  ✅ O QUE ESTÁ FUNCIONANDO:                                            │
│  • Criativos com pessoa real + valor de conta = CTR 3.1x média        │
│  • Leads que recebem áudio nos primeiros 5min fecham 2.4x mais        │
│                                                                       │
│  🎯 AÇÕES RECOMENDADAS:                                                │
│  [Pausar variante B] [Replicar criativo X] [Reaquecer 42 leads frios] │
└───────────────────────────────────────────────────────────────────────┘
```

### Bloco D — Inteligência de Concorrentes (já existe, reposicionado)

`ad_competitor_creatives` aparece aqui como inspiração visual para super gerar novos criativos baseados nos vencedores da concorrência.

---

## 3. Nova edge function: `captacao-intel`

Cron diário 08:00 BRT. Cruza:

- `ad_creative_insights` (já existe) — padrões vencedores próprios
- `ad_competitor_creatives` (já existe) — vencedores concorrentes
- `page_views` + `customers` + `deals` + `messages` — funil interno
- Facebook Ads spend (via `facebookAds.ts`)

Saída: tabela nova `capture_diagnostics` (jsonb com bottlenecks, winners, actions, kpis).

Modelo: oficial do google, `google/gemini-3-flash-preview`.

---

## 4. Mudanças técnicas

```text
DB (migration):
  + capture_diagnostics (tenant_id, kpis jsonb, bottlenecks jsonb,
                         actions jsonb, computed_at)
  + ad_spend_daily (consultant_id, date, spend_cents, impressions,
                    clicks, leads — cache do Facebook)

Edge Functions:
  + captacao-intel       (novo cron — diagnóstico unificado)
  + facebook-spend-sync  (novo cron — puxa gasto Meta diário)

Frontend:
  - src/components/admin/DashboardTab.tsx
      → remover seção de tráfego (Horários, Dispositivos, Origem, Comparativo)
  + src/pages/SuperAdmin.tsx
      → adicionar aba "Captação"
  + src/components/superadmin/CaptacaoTab/
      ├── KpisRow.tsx             (8 cards do bloco A)
      ├── TrafficCharts.tsx       (4 gráficos migrados)
      ├── IntelDiagnostic.tsx     (bloco C — lê capture_diagnostics)
      └── CompetitorInspiration.tsx (reaproveita CompetitorsPanel)
```

---

## 5. Pré-requisito (antes de implementar)

CADA CONSULTOR VAI TER SEU NOME E SUA CAMAPNHA DEVIDO TER O TELEFONE DELE O NOME DELE MAS O RESTANTE DAS PAGINAS PIXEL VAI SER UMA UNICA, TODOS OS DADOS QUE VAI APARECER PARA ELE SAO DAS CAMAPNHAS DELE

---

## Entregáveis

1. Migration: 2 tabelas novas.
2. 2 edge functions novas (cron).
3. Remoção da seção de tráfego do `/admin`.
4. Nova aba "Captação" no SuperAdmin com 4 blocos.
5. IA gerando diagnóstico diário acionável (não só "insight", mas com botões de ação).

Tempo estimado: implementação em 1 sessão (DB + functions + UI base), refinos visuais em segunda passada.
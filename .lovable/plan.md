
# Anúncios à prova de leigo + IA que aprende sozinha

## Diagnóstico (do print que você mandou)

Você pausou o anúncio com um saldo de R$ 179, 644 impressões, 1 clique e **0 leads** em 24h. Dois problemas reais:

1. **Linguagem técnica demais** — "impressão", "CPL", "CPA", "conversão" não significam nada pro consultor médio. Ele olha "11 impressões · 0 cliques · 0 leads · −R$ 0,47" e não sabe se é bom, ruim ou normal.
2. **A IA gera copy uma vez e nunca mais aprende** — `ad-creative-builder` cria 6 títulos + 3 textos no momento da campanha e acabou. Não há ciclo de aprendizado: copy ruim continua rodando, copy boa não vira referência. 644 impressões com 1 clique é CTR de 0,15% (ruim) e ninguém ajusta nada.
3. **Sem objetivo claro de fechamento** — o painel mostra "Leads" mas o que importa pra você é **cadastro completo** (cliente assinou). Hoje não há um indicador único "quantos viraram cliente por R$ gasto".

---

## O que vamos construir

### 1. Painel em português de gente normal (Resultados + Carteira)

Substituir todos os termos técnicos por linguagem do Rafael:

| Hoje (técnico) | Vai virar (humano) |
|---|---|
| 644 impressões | **644 pessoas viram seu anúncio** |
| 1 clique | **1 pessoa tocou** |
| 0 leads | **0 conversas começaram no zap** |
| 0 cadastros | **0 viraram cliente** |
| CPL R$ 13,69 | **Custo por conversa: R$ 13,69** |
| CPA R$ 28 | **Custo pra ganhar 1 cliente: R$ 28** |
| CTR 0,15% | **De cada 1.000 que viram, só 1 tocou — anúncio fraco 🔴** |
| Conversion rate | **Taxa de fechamento** |

**Mini-tooltip "?"** ao lado de cada métrica com explicação de 1 linha + benchmark ("bom: > 1%", "ruim: < 0,3%").

**Card de saúde** no topo do `ResultsDashboard`:
```
┌──────────────────────────────────────────────────────┐
│ 🟢 Anúncio saudável                                  │
│    Cada R$ gasto está trazendo 0,8 conversas no zap. │
│    Continua rodando.                                 │
└──────────────────────────────────────────────────────┘
```
Estados: 🟢 saudável / 🟡 atenção / 🔴 vai pausar em 1h se não melhorar.

**Wallet feed** em `WalletCard.tsx` — trocar a linha "11 impressões · 0 cliques · 0 leads (4 sincronizações)" por:
> *"11 pessoas viram. Ninguém tocou ainda."* (sem mencionar "sincronização")

### 2. IA que aprende com cada anúncio (Creative Learner)

Nova edge function `ad-creative-learner` rodando 1x/dia (cron):

```
Para cada consultor:
  1. Pega os últimos 30 dias de facebook_metrics_daily
  2. Junta com os textos/imagens reais (facebook_ads tem o creative_id)
  3. Calcula score por variação:
       score = (cadastros × 100) + (conversas × 10) + (cliques × 1) − (R$ gasto)
  4. Ranqueia top-5 vencedoras e bottom-5 perdedoras
  5. Salva em ad_creative_insights (nova tabela):
       - winning_patterns: ["headlines com número", "tom de pergunta", "menciona CPFL"]
       - losing_patterns: ["genérico", "sem CTA", "emoji demais"]
       - best_image_traits: ["foto real", "boleto visível", "rosto humano"]
  6. Quando o consultor abrir "Nova campanha", o ad-creative-builder
     recebe esses padrões no prompt e SÓ gera variações no estilo vencedor.
```

Tabela nova:
```sql
ad_creative_insights (
  consultant_id, distribuidora,
  winning_patterns jsonb, losing_patterns jsonb,
  best_ctr numeric, best_cpa_cents int,
  sample_size int, updated_at timestamptz
)
```

Mudança no `ad-creative-builder/index.ts`: antes do prompt do Gemini, busca insights do consultor e injeta:
```
HISTÓRICO DESTE CONSULTOR (use como guia):
- Padrões vencedores: títulos com número específico, menciona "CPFL"
- Evitar: genérico, sem CTA, mais de 1 emoji
- Melhor CTR atingido: 2,3% (use isso como referência mínima)
```

### 3. Auto-rotação A/B (kill the losers)

Hoje a campanha sobe 6 títulos + 3 textos = 18 combinações, mas o Facebook escolhe sozinho e não temos controle.

Novo cron `facebook-creative-rotator` (a cada 12h):
- Pra cada ad ativo com > 500 impressões nos últimos 3 dias
- Se CTR < 0,5% **E** zero conversas → **pausa esse criativo automaticamente**
- Se CTR > 1,5% **E** ≥ 1 conversa → marca como `is_winner=true`
- Cria 3 novas variações INSPIRADAS no vencedor (chama ad-creative-builder com `seed_winner=<id>`)

Resultado: o set de criativos evolui sozinho. Em 2 semanas, só sobram os que convertem.

### 4. Foco real no fechamento (cadastro)

O KPI "Cadastros" hoje depende do Pixel `CompleteRegistration` — checar via `facebook-capi` se está disparando. Se não estiver, adicionar um disparo automático **quando `customers.status` muda pra `approved`** (trigger SQL → edge `facebook-capi/track-conversion`).

Adicionar ao Wallet feed coluna nova: **"Virou cliente?"** com 🎯 verde quando aquela conversa chegou em `status=approved`.

Card-resumo no topo do `ResultsDashboard`:
```
🎯 Custo real pra ganhar 1 cliente: R$ 47
   (R$ 186 gastos → 4 cadastros aprovados)
   Meta: < R$ 60 ✅
```

### 5. Recomendações pró-ativas (Insight Cards)

Toda vez que o `ad-creative-learner` roda, gera 1-3 cards no painel:

```
┌─────────────────────────────────────────────────────┐
│ 💡 Recomendação                                     │
│ Seus anúncios com a palavra "boleto" no título      │
│ converteram 3× mais que os outros.                  │
│ [ Aplicar em todas as próximas campanhas ]          │
└─────────────────────────────────────────────────────┘
```

Tabela `ad_recommendations` (consultant_id, type, message, action_payload, dismissed).

---

## Arquivos a criar/editar

```
NOVOS:
  supabase/functions/ad-creative-learner/index.ts        # cron diário
  supabase/functions/facebook-creative-rotator/index.ts  # cron 12h
  supabase/migrations/<ts>_creative_insights.sql         # 2 tabelas + cron
  src/components/admin/ads/HealthSummaryCard.tsx         # card 🟢/🟡/🔴
  src/components/admin/ads/InsightCards.tsx              # recomendações
  src/components/admin/ads/MetricTooltip.tsx             # "?" com explicação
  src/lib/adGlossary.ts                                  # mapa termo→linguagem leiga

EDITAR:
  src/components/admin/ads/ResultsDashboard.tsx          # labels humanas + tooltips + card de saúde
  src/components/admin/ads/WalletCard.tsx                # feed em linguagem simples
  supabase/functions/ad-creative-builder/index.ts        # injeta insights do consultor no prompt
  supabase/functions/facebook-capi/index.ts              # garante disparo de CompleteRegistration
```

## Detalhes técnicos

- **Cron**: `pg_cron` para `ad-creative-learner` (03:00 BRT) e `facebook-creative-rotator` (a cada 12h).
- **RLS**: insights e recomendações são `consultant_id`-scoped, policies idênticas a `facebook_campaigns`.
- **Custo de IA**: aprendizado roda 1x/dia/consultor com `google/gemini-3-flash-preview` (barato).
- **Backfill**: na primeira execução, processa últimos 30 dias.
- **Segurança**: rotator só pausa criativo, nunca pausa campanha inteira sem confirmação humana.

## Tempo

Sessão única de build (~10 arquivos, 1 migration, 2 edge functions novas).

---

## Antes de eu implementar — 1 decisão

A IA pode tomar 3 níveis de iniciativa. Qual você quer?

**A) Conservador** — IA só *recomenda*, você clica pra aplicar.
**B) Equilibrado** *(recomendado)* — IA pausa criativos perdedores sozinha, mas pra criar novos pede sua aprovação.
**C) Agressivo** — IA pausa, cria novos e sobe sozinha. Você só revisa relatório semanal.

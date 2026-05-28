
# Análise completa — Central de Anúncios

Diagnóstico feito direto nos dados (últimos 30 dias, 1 consultor conectado, 10 campanhas, 25 anúncios, R$ 286,87 gastos).

## O retrato dos números

| Métrica 30d | Valor | Leitura |
|---|---|---|
| Gasto | R$ 286,87 | OK |
| Impressões | 39.772 | OK |
| Cliques | 528 | CTR 1,33% — mediano |
| Conversas iniciadas (WhatsApp) | 59 | ~11% dos cliques viram conversa |
| **Leads salvos no CRM** | **0** | **🚨 atribuição quebrada** |
| **Customers acquired** | **0** | **🚨 nunca preenchido** |
| Frequência média | 1,01 – 1,21 | OK (sem fadiga) |
| Recomendações IA geradas (30d) | 41 | Geradas, mas 0 aplicadas/dispensadas |
| Insights IA | "inconclusivo — falta de dados de copy" | Confirma o bug abaixo |

## Os 6 gargalos (em ordem de impacto)

### 1. 🚨 Copy do anúncio não está sendo salva (P0)
`ad_creative_performance.headline` e `primary_text` são **NULL em 100% das 25 linhas**. Consequência em cascata:
- A IA (`ad-creative-learner`) já disse explicitamente: *"análise inconclusiva por ausência de dados de copy"*.
- Sem copy salva, `framework`, `angle`, `creative_format` também ficam NULL → painel de Inteligência não consegue agrupar vencedores/perdedores.
- `best_image_briefs` fica vazio → o gerador de novos criativos não tem do que se inspirar.

**Fix:** no `meta-ads-import` / `facebook-sync-metrics`, popular `headline` e `primary_text` puxando o `creative` do ad via Graph API (`fields=creative{body,title,object_story_spec}`).

### 2. 🚨 Atribuição lead→anúncio quebrada (P0)
59 conversas iniciadas pelo Meta, mas `leads=0` em `ad_creative_performance` e `customers_acquired=0` em `facebook_metrics_daily`. O CTWA está chegando, mas o cron que casa `customers` ↔ campanha (via `ctwa_clid` / `fbclid`) ou não está rodando ou está com filtro errado.

**Fix:** auditar `_shared/lead-attribution.ts` + cron `facebook-sync-metrics`; validar com 1 lead de teste se `customers.utm_campaign_id` está vindo do webhook do Whapi.

### 3. ⚠️ Recomendações da IA viram lixo (P1)
41 recomendações geradas, **0 aplicadas, 0 dispensadas**. Ou estão escondidas no UI, ou não têm CTA claro. Pior: como dependem dos insights (que estão "inconclusivos"), provavelmente são genéricas.

**Fix:** depois de #1 e #2, regerar; e mover `ad_recommendations` para o topo do `AdsCentralTab` com botão "Aplicar / Ignorar" inline.

### 4. ⚠️ Score do criativo é incoerente (P1)
- Anúncio com CTR 1,49% e 0 leads → `is_winner=true` (score 25,87)
- Outro com mesmo CTR → `is_winner=false` (mesma linha de score)
- Ads com 0 leads sendo classificados como winners porque o score é só CTR (já que `leads=0` em tudo).

**Fix:** após corrigir #2, recalibrar `evaluateCreatives` para exigir mínimo de leads antes de coroar winner; e marcar `is_winner`/`is_loser` de forma determinística (por anúncio, não por linha duplicada — hoje há 4 linhas idênticas para o mesmo criativo).

### 5. ⚠️ Linhas duplicadas em `ad_creative_performance`
4 ads diferentes (`120243439...`) com **exatamente** os mesmos números (40 cliques, 2.688 impr, R$ 36,28). Indica que o import está repetindo a mesma linha agregada para cada ad_id de um adset, em vez de pegar insights por ad.

**Fix:** trocar o request do Graph para `level=ad` com breakdown correto e usar `ON CONFLICT (fb_ad_id, date)` no upsert.

### 6. 💡 Painel de Qualidade não bloqueia copy ruim (P2)
`adQualityScore.ts` já calcula score (políticas + estrutura + imagem) e tem `canPublish: score >= 70`. Mas o `SmartPublishButton` aceita publicar mesmo sem rodar o score — não há gate efetivo.

**Fix:** travar publicação se `score < 70` ou `blocks > 0`, mostrando os `checks` que falharam no botão.

## Pequenos extras que dão retorno rápido

- **A/B test guiado por concorrentes:** já existem 38 `ad_competitor_creatives` na base, mas o `IntelligenceTab` não mostra "ângulos que seus concorrentes estão usando e você não". Comparação direta = ideia pronta de novo criativo.
- **CPL por placement** (`cpl_by_placement` existe na tabela mas não é exibido). Mostrar permite cortar placement caro (geralmente Audience Network).
- **Frequência alerta:** colocar badge amarelo quando `frequency_x100 > 200` (frequência > 2,0) — hoje está OK, mas é um early-warning.

## Plano de execução proposto

```text
Fase 1 (P0 — desbloqueia tudo):
  └ #1 Persistir copy no import
  └ #2 Religar atribuição lead→ad

Fase 2 (P1 — qualidade dos dados):
  └ #5 Dedupe + upsert por (fb_ad_id, date)
  └ #4 Score exige leads mínimos
  └ Reprocessar ad-creative-learner

Fase 3 (P2 — UX):
  └ #3 Recomendações no topo, com Aplicar/Ignorar
  └ #6 Gate de qualidade no SmartPublish
  └ Extras: gap de ângulos, CPL/placement, alerta de frequência
```

## Detalhes técnicos

- Arquivos prováveis: `supabase/functions/meta-ads-import/index.ts`, `supabase/functions/facebook-sync-metrics/index.ts`, `supabase/functions/_shared/fb-graph.ts`, `supabase/functions/_shared/lead-attribution.ts`, `supabase/functions/ad-creative-learner/index.ts`, `src/services/smartPublish.ts`, `src/components/admin/ads/{InsightsPanel,IntelligenceTab,AdsCentralTab,SmartPublishButton}.tsx`.
- Sem migration nova nas Fases 1-2 (só backfill). Fase 2 pode pedir índice único `(fb_ad_id, date)` em `ad_creative_performance`.
- Quero aprovação para começar pela Fase 1 (#1 + #2) — é o que destrava o resto.

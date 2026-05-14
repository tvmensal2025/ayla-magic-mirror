## O que vamos entregar

Você não quer abrir nada. Quer **uma IA que aprende sozinha, baixa o CPL todo dia, e te avisa quando algo importa**. Para isso, fechamos 4 frentes pequenas e específicas — sem mexer em nada que já funciona.

---

## Frente 1 — Plugar o painel (2 linhas faltando)

Arquivo: `src/pages/SuperAdmin.tsx`

- Linha 244: adicionar `{ id: "ia_aprendendo" as const, label: "IA Aprendendo", icon: Brain }` no array `tabs`.
- Linha 506: adicionar `{activeTab === "ia_aprendendo" && <AILearningHealthPanel />}`.
- Importar `AILearningHealthPanel` no topo.

Resultado: aba "IA Aprendendo" no SuperAdmin mostra os 4 cards verde/amarelo/vermelho, top vencedores/perdedores, timeline e botão "Forçar agora".

---

## Frente 2 — Resumo diário no WhatsApp (você não precisa abrir o painel)

Nova edge function: `ai-daily-digest` + cron 09:00 BRT.

Toda manhã envia para o seu WhatsApp super-admin **um único resumo curto**:

```
🤖 IA aprendeu hoje
• CPL médio: R$ 6,42 (-12% vs ontem) ✅
• 3 anúncios pausados (ROAS < 1.5)
• 2 vencedores promovidos (+20% budget)
• Padrão novo descoberto: "economia em R$" converte 2.3x
• 38 concorrentes monitorados (32 com imagem)

⚠️ 1 ação sua: consultor X sem WABA conectada
```

Tudo que importa cabe em 6 linhas. Se está tudo verde, você sabe. Se tem ação, você sabe qual.

Tabela nova `ai_learning_digest` (data, métricas, enviado_em) para histórico e idempotência.

---

## Frente 3 — Loop de auto-otimização que de fato baixa CPL

Hoje o `ad-creative-learner` roda diariamente mas o ciclo não fecha sozinho. Vamos fechar:

1. **`ad-creative-learner` (07:00)** — já agrega insights por consultor + global. Adicionar:
   - cálculo de **CPL médio rolling 7d vs 14d** por consultor → grava em `ad_learning_digest`.
   - identificar **top 3 padrões vencedores da rede inteira** (network-wide) e gravar em `ad_playbooks` com `scope='global'`.

2. **`ad-creative-builder`** — já existe. Adicionar consumo automático:
   - quando rotator pausa um loser, **chama o builder automaticamente** para gerar 2 variações inspiradas no winner do mesmo consultor + playbook global. Sem você apertar nada.

3. **`facebook-creative-rotator` (12h)** — já pausa losers. Adicionar:
   - **promoção automática** do winner do mês: budget +20% até teto configurável (`max_daily_budget_cents` em `consultants`).
   - dispara a chamada acima do builder.

4. **Novo cron `ai-cpl-watchdog` (de 4h em 4h)** — se CPL de uma campanha sobe >40% em 48h, pausa automática + recomendação no painel + linha no digest do dia seguinte.

Ciclo final:

```
scraper (semanal) ─┐
                   ├──> learner (diário) ──> playbook global
performance ───────┘                              │
                                                  ▼
rotator (12h) ─pausa loser─> builder auto ─cria variações─> publica
                │
                └─promove winner ─> mais budget no que funciona

watchdog (4h) ─> detecta CPL subindo ─> pausa ─> avisa no digest
```

Cada execução grava em `ai_usage_log` com `category='auto_learning'` para o painel e o digest puxarem.

---

## Frente 4 — Concorrentes com imagem (backfill)

`ad-competitor-scraper` já foi reescrito para usar `/ads_archive` + `og:image` + MinIO. Falta:

1. Confirmar que o secret `FACEBOOK_APP_SECRET` + `FACEBOOK_APP_ID` permitem token do Ad Library (sim, já permitem — testamos).
2. Rodar `?backfill=1` uma vez nos 38 registros existentes.
3. Schedule já existe (segunda 06:00).

---

## Arquivos que vão mudar

```
src/pages/SuperAdmin.tsx                                  → 3 linhas (import + tab + render)
supabase/functions/ai-daily-digest/index.ts               → NOVA (resumo WhatsApp diário)
supabase/functions/ai-cpl-watchdog/index.ts               → NOVA (alerta CPL alto)
supabase/functions/ad-creative-learner/index.ts           → +CPL rolling + playbook global
supabase/functions/facebook-creative-rotator/index.ts     → +promove winner + dispara builder
supabase/migrations/<ts>_ai_learning_digest.sql           → tabela + 2 cron jobs novos
```

## Validação após deploy

1. Aba "IA Aprendendo" no `/admin/super` carrega com 4 cards verdes.
2. Forçar `ad-competitor-scraper?backfill=1` → 38 registros passam de 0 imagem para ≥30 com imagem.
3. Disparar `ai-daily-digest` manual → chega WhatsApp no número super-admin com 6 linhas.
4. Forçar `facebook-creative-rotator` → quando há loser, aparece em `ad_generated_creatives` uma nova variação criada automaticamente e em `wallet_transactions` um spend de promoção do winner.
5. `ai-cpl-watchdog` em campanha de teste com CPL inflado → pausa + recomendação aparece no painel.

## O que você passa a ver sem abrir nada

- **WhatsApp 09:00 todo dia**: 6 linhas com CPL, o que pausou, o que promoveu, padrão novo, 1 ação sua se houver.
- **Aba "IA Aprendendo"** (quando quiser checar): 4 cards verde/amarelo/vermelho + top vencedores agora + timeline.
- **Nada para apertar**: builder roda sozinho quando rotator pausa, winner ganha budget sozinho, watchdog protege contra CPL alto.

## Pergunta antes de implementar

Confirma que posso usar **o número do WhatsApp do consultor super-admin (rafael.ids@icloud.com)** para enviar o digest diário às 09:00 BRT? Se preferir outro número (ex.: seu pessoal direto), me passe.

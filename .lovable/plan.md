# Análise IA da Saúde do Bot (últimos 7 dias)

Adicionar no topo do `/admin/saude-bot` um painel premium com **diagnóstico Gemini** que cruza tudo que rolou nos últimos 7 dias com o consultor — texto, áudio, vídeo, imagem, transições de passo, handoffs, conversão por variante A/B/C — e devolve um plano de ação para converter mais.

## 1. Nova edge function `bot-health-intel`

Inspirada em `captacao-intel`, mas **por consultor** e janela de **7 dias**.

Coleta para o `consultant_id`:
- **`conversations`** (últimos 7d): agrupa por `message_type` (text/audio/video/image), `message_direction` (in/out), top 30 mensagens recebidas, top 30 enviadas, contagem por `conversation_step`.
- **`bot_step_transitions`** (7d): from_step → to_step com `intent` e `confidence` médios; identifica passos onde a IA fica com confiança baixa.
- **`bot_handoff_alerts`** (7d, abertos+resolvidos): agrupa por `reason`.
- **`customers`** do consultor com `flow_variant`: total / aprovados por variante A/B/C; tempo médio parado por `conversation_step` (via `last_step_advanced_at`).
- **`bot_message_ab_results`**: variantes de mensagem que estão ganhando.
- **`ad_creative_insights` + `ad_competitor_creatives`**: contexto do que está convertendo no anúncio para o prompt amarrar "anúncio → primeira mensagem do bot".

Monta prompt para **`google/gemini-2.5-pro`** (via Lovable AI Gateway, header `Lovable-API-Key`, modelo Gemini para análise rica multimodal-textual). Fallback `google/gemini-3-flash-preview` se 429/402. JSON estrito:

```json
{
  "summary": "≤140 chars",
  "health_score": 0-100,
  "bottlenecks": [{ "title", "detail", "step", "severity" }],
  "winners": [{ "title", "detail" }],
  "lead_drops": [{ "step", "stuck_count", "why", "fix" }],
  "media_insights": [{ "type": "audio|video|image|text", "observation", "action" }],
  "ab_recommendation": { "best_variant": "A|B|C", "why", "action" },
  "actions": [{ "label", "detail", "impact", "type" }]
}
```

Persiste em `capture_diagnostics` com `scope='bot_health'` e `consultant_id` setado (campos já existem). Sem migração.

## 2. UI no `src/pages/SaudeBot.tsx`

Novo card glassmorphism no topo (antes dos 3 cards de resumo):

- Header: "🧠 Análise IA — últimos 7 dias" + botão "Atualizar análise" (chama a edge function) + timestamp do `computed_at`.
- **Health score** em destaque (gauge/anel verde→vermelho).
- **Summary** em uma linha grande.
- Tabs internas: `Gargalos` · `Vencedores` · `Onde perde lead` · `Mídia (áudio/vídeo/imagem)` · `A/B/C` · `Ações`.
- Cada `action` vira chip clicável com badge de impacto; ações do tipo `tune_handoff` linkam para `/admin/fluxos`, `replicate_creative` para `/admin/anuncios`, etc.
- Carrega ao montar via `select * from capture_diagnostics where scope='bot_health' and consultant_id=$me order by computed_at desc limit 1`. Se vazio ou >24h, mostra CTA "Gerar primeira análise".

Mantém os blocos atuais (alertas, parados +24h, funil) abaixo.

## 3. Cron diário (opcional, mesma função)

Quando chamada sem body roda para **todos consultores ativos** com leads nos últimos 7d. `pg_cron` 06:30 BRT. Não obrigatório no MVP — botão manual já cobre.

## Detalhes técnicos

- Função: `supabase/functions/bot-health-intel/index.ts`, CORS padrão, aceita `{ consultant_id }` no body; se ausente usa JWT do caller.
- Sample size guard: se <10 conversas em 7d, devolve `summary: "Poucos dados ainda — rode mais leads"` sem chamar IA (economia).
- Trunca texto das mensagens em 300 chars no prompt; resume mídia citando só `message_type` + `slot_key` + `conversation_step` (não baixa binário — Gemini analisa o **comportamento** em torno da mídia, não o conteúdo bruto).
- Reusa helper `openaiChat` se já roteia pro gateway, senão usa fetch direto pro `https://ai.gateway.lovable.dev/v1/chat/completions` com `LOVABLE_API_KEY`.
- Custo controlado: 1 call por consultor por dia (cache 24h no UI).

## Arquivos

- `supabase/functions/bot-health-intel/index.ts` (novo)
- `src/pages/SaudeBot.tsx` (adicionar card no topo + hook de carregamento + botão refresh)
- `src/components/admin/saude/BotHealthIntel.tsx` (novo componente do painel IA)

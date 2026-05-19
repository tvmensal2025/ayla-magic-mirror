## Diagnóstico

1. **Texto do "como funciona"** — Os passos com `slot_key='como_funciona'` no `bot_flow_steps` estão TODOS com `message_text` vazio (validei no DB). Ou seja, o bot está caindo no fallback de IA: ou no `ai-faq-answerer` (Lovable AI) ou no `ai-sales-agent`, que monta a resposta a partir de:
  - `ai_knowledge_sections` → "FAQ 2 — DESCONTO E COBRANÇA": *"O desconto varia entre 10% e 20%…"* → IA arredonda para "≈15%".
  - `ai-sales-agent/index.ts:256, 689` → prompt diz `**≈12% sobre o valor**` e calcula `billNum * 0.12`. Esse 12% combinado com texto solto vira o "15%" inconsistente.
  - `evolution-webhook` e `whapi-webhook/handlers/bot-flow.ts` já usam `* 0.20` para `{economia_mensal/anual}` — está certo, mas convive com o 12% do agente.
2. **Tempo de digitação** — `supabase/functions/_shared/human-pace.ts`:
  `ms = clamp(1500 + len*35, 1500, 7000)` com jitter ±20%. Textão curto sai em ~1,5 s, texto médio em 2-3 s — soa "bot-rápido", especialmente sem mostrar "digitando…".

## Plano de correção

### 1. Preencher o passo "como funciona" com o texto curto e agradável

Edge function nova/uso de migration para `update bot_flow_steps set message_text = $TEXTO where slot_key='como_funciona' and coalesce(message_text,'')=''` (não sobrescreve quem já personalizou).

**Texto novo** (markdown WhatsApp leve, 3 linhas, com `{{nome}}`, fechando com CTA):

```
Funciona assim, {{nome}}: você continua recebendo a conta da sua distribuidora normal — só que a iGreen entra com *até 20% de desconto* todo mês.

Sem obra, sem instalação, sem mudar fiação. 💚
```

### 2. Padronizar desconto em 20% (eliminar 12% e 15% da IA)

- `supabase/functions/ai-sales-agent/index.ts`
  - Linha 256: trocar "≈12% sobre o valor" por **"≈20% sobre o valor"**.
  - Linha 689: `billNum * 0.12` (mês e ano) → `billNum * 0.20`.
- `ai_knowledge_sections` (migration update) — seção "FAQ 2 — DESCONTO E COBRANÇA":
  - "O desconto varia entre **10% e 20%**" → "O desconto é de **até 20%** sobre o valor da energia consumida, conforme sua distribuidora e perfil."
  - Demais menções a "15%" em LP (`HowItWorksSection.tsx`, `LicConexaoGreen.tsx`, `ConsultantPage.tsx` meta description) → **20%** para ficar consistente em todo lugar onde o lead pode ver.

### 3. Tempo de digitação mais humano

`supabase/functions/_shared/human-pace.ts`:

```ts
// antes: base = 1500 + len*35; min 1500; max 7000
// depois:
const base = 2200 + len * 55;     // ~60% mais lento
const jitter = (Math.random()*0.5 - 0.25) * base; // ±25%
const min = opts?.minMs ?? 2200;
const max = opts?.maxMs ?? 11000;
```

Resultado prático:

- Texto de 30 chars: ~3,8 s (antes ~2,5 s)
- Texto de 120 chars: ~8,8 s (antes ~5,7 s) — soa lendo + digitando, não bot.

`pauseBetweenMessages`: subir para `1800 + Math.random()*2000` (1,8-3,8 s entre mensagens consecutivas).

### 4. Memória

Atualizar `mem://features/whatsapp-message-variables` (ou criar `mem://copy/discount-rate-20`) registrando: **desconto oficial em todos os textos e cálculos = 20%** (substitui 12%/15% antigos).

## Arquivos tocados

- `supabase/functions/_shared/human-pace.ts` — novos tempos
- `supabase/functions/ai-sales-agent/index.ts` — 12% → 20%
- `src/components/HowItWorksSection.tsx` — 15% → 20%
- `src/components/licenciada/LicConexaoGreen.tsx` — 15% → 20% (2 ocorrências)
- `src/pages/ConsultantPage.tsx` — meta description 15% → 20%
- **Migration** — `update ai_knowledge_sections` na seção FAQ 2; `update bot_flow_steps` preenchendo `message_text` em passos `como_funciona` vazios

## Não faremos

- Não vou ativar presence "digitando…" no WhatsApp agora (você não pediu — fica para próximo passo se quiser).
- Não vou sobrescrever passos `como_funciona` que algum consultor já personalizou no editor.
- Não vou mexer no Conexão Club / Career Plan (15% lá é comissão de licenciado, não desconto do cliente).
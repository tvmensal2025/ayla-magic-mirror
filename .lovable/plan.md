# Garantir que a IA pare quando o humano assume

## Diagnóstico

Testei o fluxo no replay e no banco. Achei **4 bugs** que fazem o "Assumir" parecer que não funciona:

### Bug 1 — Coluna inexistente no auto-pause do WhatsApp
`supabase/functions/whapi-webhook/index.ts:74` faz:
```ts
.eq("phone_digits", outPhone)
```
A coluna `phone_digits` **não existe** em `customers` (só `phone_whatsapp`). Então, quando o consultor responde direto pelo WhatsApp Web/celular, o webhook detecta `outboundHuman=true` mas a query devolve `null` e **o bot nunca é pausado**. Resultado: IA continua respondendo em paralelo com o humano.

### Bug 2 — Auto-takeover só dispara no envio de texto
`src/hooks/useMessages.ts:320-357` só chama o auto-takeover dentro de `sendMessage` (texto). Se o consultor envia áudio/imagem/documento pelo painel, **não pausa o bot**.

### Bug 3 — Outbound API não pausa nada
Quando o consultor manda do painel (Whapi com `source=api`), o `parseWhapiMessage` retorna `null` (linha 369-371 do `_shared/whapi-api.ts`) e o webhook nem chega no bloco de pausa. O auto-pause depende 100% do front-end ter chamado o update — que falha silenciosamente em mídia (Bug 2) e em RLS sem fallback claro.

### Bug 4 — Helper `isCustomerPausedByHuman` existe mas ninguém usa
`supabase/functions/_shared/bot/paused.ts` define o helper de verdade ("bot_paused OR assigned_human_id OR paused_until>now"), mas **0 imports** no projeto. O webhook (`index.ts:449-451`) só checa `bot_paused` e `bot_paused_until`, **ignora `assigned_human_id`**. Então se um humano está vinculado mas o `bot_paused` foi pra `false` por qualquer caminho (Devolver mal-feito, race condition, edge case), a IA volta a falar.

### Bonus: não existe botão "Parar TUDO"
Hoje só existe pause por lead. Não há um interruptor "desliga a IA de todos os meus leads agora" — o `admin_unpause_global_bot` é só pra religar.

---

## O que vou fazer

### A. Corrigir o auto-pause do WhatsApp (Bug 1)
Em `whapi-webhook/index.ts` linha 71-77, trocar:
```ts
.eq("phone_digits", outPhone)
```
por:
```ts
.eq("phone_whatsapp", outPhone.replace(/\D/g, ""))
```
e usar `consultant_id` quando disponível para evitar pegar lead de outro consultor.

### B. Auto-takeover universal (Bugs 2 e 3)
Centralizar em um helper `src/lib/whatsapp/auto-takeover.ts` chamado por **toda** ação de envio do consultor (texto, áudio, imagem, documento, template, follow-up manual). O helper:
1. Atualiza `customers` com `bot_paused=true`, `assigned_human_id=userId`, `bot_paused_reason="humano_assumiu"`.
2. Se RLS falhar, cai em `customer-takeover` edge function (já existe).
3. Loga no console o sucesso/falha pra debug.

Chamar antes do `sendWhapi…` ou imediatamente em paralelo, não depois — assim a IA já está silenciada quando o envio é processado.

### C. Usar o helper compartilhado em todos os pontos de saída de IA (Bug 4)
Importar `isCustomerPausedByHuman` em:
- `whapi-webhook/index.ts` (substituir o check manual da linha 449-451)
- `whapi-webhook/handlers/bot-flow.ts` (no início do `dispatchStepFromFlow`)
- `whapi-webhook/handlers/conversational/index.ts`
- `ai-sales-agent/index.ts`
- `bot-followup-checker`, `bot-stuck-recovery`, `ai-followup-cron`, `send-scheduled-messages` (revisar e padronizar — alguns já fazem certo, outros só checam `bot_paused`)

Garantir que TODO caminho de envio passe por `isCustomerPausedByHuman(customer)` antes do dispatch.

### D. Botão "🛑 Parar IA de todos os meus leads"
Adicionar em `/admin/whatsapp` (e `/admin/saude-bot`) um botão grande no topo:
- Pausa global por consultor: `UPDATE customers SET bot_paused=true, bot_paused_reason='manual_global_pause', assigned_human_id=<userId> WHERE consultant_id=<userId> AND bot_paused=false`.
- Mostra "X leads silenciados".
- Botão paralelo "Religar IA" usa o RPC existente `admin_unpause_global_bot` (ou variante por consultor).
- Confirmação dupla pra evitar clique acidental.

### E. Migration de saneamento
Backfill: `UPDATE customers SET bot_paused=true WHERE assigned_human_id IS NOT NULL AND bot_paused=false` — fecha o gap pra leads onde o humano está vinculado mas o flag está errado.

---

## Detalhes técnicos

**Arquivos editados:**
- `supabase/functions/whapi-webhook/index.ts` — fix coluna, usar `isCustomerPausedByHuman`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — checar pause antes de `dispatchStepFromFlow`
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — idem
- `supabase/functions/ai-sales-agent/index.ts` — idem no entrypoint
- `supabase/functions/bot-followup-checker/index.ts`, `bot-stuck-recovery/index.ts`, `ai-followup-cron/index.ts`, `send-scheduled-messages/index.ts` — padronizar via helper
- `src/hooks/useMessages.ts` — extrair auto-takeover pra helper
- `src/lib/whatsapp/auto-takeover.ts` (novo) — função `autoTakeover(customerId, reason?)`
- Pontos de envio de mídia/template no painel — chamar `autoTakeover` (vou mapear quais são durante a edição)
- `src/components/admin/AIAgentTab/LiveConversationsPanel.tsx` ou novo componente — botão "Parar IA de todos"
- Migration: backfill `bot_paused` quando `assigned_human_id` está setado

**Sem mudança em:**
- UI por lead (Assumir/Devolver continuam iguais)
- Schema (só backfill)
- `customer-takeover` edge function (continua sendo fallback)

---

## Memory a atualizar

`mem://whatsapp/human-takeover-silence` — registrar que o enforcement agora é via helper compartilhado `_shared/bot/paused.ts` (importado em todos os crons + webhook + ai-sales-agent), que o auto-pause cobre texto+mídia+API+app, e que existe botão de panic stop por consultor.

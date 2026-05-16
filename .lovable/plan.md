## Plano: (C) Aviso de mídia + fix de timeout

### Parte A — Aviso visual "⚠️ sem áudio/vídeo" no `/admin/fluxos`

**Arquivos:** `src/pages/FluxoCamila.tsx` e/ou `src/components/admin/StepMediaPanel.tsx`

1. Em `FluxoCamila.tsx`, ao carregar os steps, fazer uma query agregada em `ai_media_library` agrupando por `slot_key` (e `step_tags`) para o `consultant_id` ativo, retornando contagem por `kind` (`audio`, `video`, `image`).
2. Para cada step renderizado no card, comparar `media_order` (ex.: `["audio","image","video","text"]`) com os kinds disponíveis no `slot_key` daquele step.
3. Se faltar `audio` ou `video` que está pedido no `media_order`, mostrar badge amarelo:
   - `⚠️ Sem áudio` / `⚠️ Sem vídeo` / `⚠️ Sem áudio e vídeo`
   - Usar `bg-yellow-500/10 text-yellow-400 border-yellow-500/30`
4. Tooltip explicando: "Este passo está configurado para enviar áudio/vídeo mas nenhuma mídia foi cadastrada. Clique para abrir o painel de mídia."
5. Clicar no badge abre o `StepMediaPanel` daquele step direto na aba correspondente.

### Parte B — Fix de timeout do Whapi (`Signal timed out` em vídeos grandes)

**Arquivo:** `supabase/functions/_shared/whapiSender.ts` (ou onde está `sendMedia`/`sendText`) + `supabase/functions/whapi-webhook/handlers/conversational/index.ts`

Problema atual: `await sendMedia(...)` em vídeo de 27MB demora >30s, Edge Function timeout dispara, mas o vídeo **é entregue** ao WhatsApp depois. Como o `await` falhou, o engine não marca como enviado e reprocessa → duplicação.

Fix:
1. Em `whapiSender.ts`, envolver `sendMedia` com timeout configurável (ex.: 25s) usando `AbortController`.
2. **Antes** do `await fetch`, registrar a tentativa em `conversations` com `delivery_status: 'pending'` e `dispatch_key` (hash de `customer_id + step_id + media_id`).
3. Se o `fetch` der timeout/abort, **NÃO** lançar erro — retornar `{ ok: true, status: 'pending_confirmation', dispatch_key }`.
4. No `_smartRepeat` / dedupe check (já implementado), além de checar texto idêntico nos últimos 90s, checar também `delivery_status IN ('pending', 'sent')` por `dispatch_key` → se existe, pular reenvio de mídia.
5. Webhook de status do Whapi (já recebido em `Whapi webhook received: {"statuses":[...]}`) atualiza `conversations.delivery_status` de `pending` → `sent`/`delivered`/`read` via `whapi_message_id`.

### Parte C — Migração

Adicionar colunas em `conversations`:
- `dispatch_key text` (nullable, indexed)
- `delivery_status text default 'sent'` (`pending|sent|delivered|read|failed`)
- `whapi_message_id text` (nullable, indexed) — para casar com o webhook de status

### Parte D — Validação

1. No painel `/admin/fluxos`, ver badges amarelos aparecerem nos Steps 2–8 (que não têm mídia).
2. Disparar teste com 1 número → verificar logs da `whapi-webhook`: deve aparecer `pending_confirmation` no envio do vídeo Step 2 (quando configurado), seguido de `delivered` via webhook de status. Nenhuma duplicação.
3. Confirmar que `_smartRepeat` não reenvia mídia quando `delivery_status='pending'`.

### Detalhes técnicos

- O AbortController em Deno: `const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 25000); fetch(url, { signal: ctrl.signal })`.
- O hash `dispatch_key`: `crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${customer_id}:${step_id}:${media_id}`))` truncado para 16 chars.
- Webhook de status já chega — só preciso adicionar handler em `whapi-webhook/index.ts` na branch `event.type === 'statuses'` que faz `UPDATE conversations SET delivery_status = ? WHERE whapi_message_id = ?`.

### Fora de escopo
- Não vou subir mídias para Steps 2–8 (o usuário precisa fazer isso pelo painel agora que o badge mostra onde falta).
- Não vou mudar a ordem do `media_order` nem o engine de envio sequencial.

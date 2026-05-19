## Objetivo

Hoje o auto-takeover (pausar bot + marcar `assigned_human_id`) só acontece quando o consultor envia mensagem pelo painel (`useMessages.sendMessage`). Quando ele responde direto no WhatsApp Business / Whapi app, o webhook descarta a mensagem (`from_me=true` → `parseWhapiMessage` retorna `null`) e o bot continua ativo. Precisamos detectar esses outbounds humanos e pausar o bot automaticamente.

## Como o Whapi marca a origem

Mensagens com `from_me: true` chegam no webhook tanto quando:
- Nós enviamos via API (sender = bot / painel) — NÃO deve pausar
- O consultor digita no celular/web do WhatsApp — DEVE pausar

O Whapi inclui o campo `source` no payload (`"api" | "mobile" | "web" | "desktop"`). Vamos usar isso como discriminador. Fallback adicional: comparar `msg.id` com IDs recentes enviados pelo bot (já temos `whatsapp_messages` com `external_id` salvo nos envios).

## Mudanças

### 1. `supabase/functions/_shared/whapi-api.ts`
- `parseWhapiMessage`: em vez de retornar `null` quando `from_me=true`, retornar um objeto leve `{ outboundHuman: true, chatId, source, messageId }` quando `source !== "api"`. Quando `source === "api"`, continuar ignorando.

### 2. `supabase/functions/whapi-webhook/index.ts`
- Logo após `parseWhapiMessage`, se o retorno indicar `outboundHuman`:
  1. Normalizar telefone do `chatId`
  2. `UPDATE customers SET bot_paused=true, bot_paused_reason='humano_assumiu_whatsapp', bot_paused_at=now(), updated_at=now() WHERE phone_digits = ... AND (bot_paused = false OR bot_paused IS NULL)`
  3. Não setar `assigned_human_id` (não temos user_id do consultor a partir do app — apenas pausar; consultor pode "Devolver para o passo" no painel)
  4. Retornar `{ ok: true, msg: "outbound_human_takeover" }` sem rodar fluxo
- Mensagens com `source === "api"` continuam ignoradas como hoje.

### 3. UI (painel de conversa) — opcional, só leitura
- Já mostramos badge "Humano assumiu" quando `bot_paused=true`. Sem mudanças necessárias; o motivo `humano_assumiu_whatsapp` aparece igual.

### 4. Memória
- Atualizar `mem://whatsapp/human-takeover-silence` para registrar o novo gatilho via webhook (outbound humano no WhatsApp Business pausa o bot).

## Arquivos tocados

- `supabase/functions/_shared/whapi-api.ts` (parse aceita outbound humano)
- `supabase/functions/whapi-webhook/index.ts` (handler de takeover antes do fluxo)
- `mem://whatsapp/human-takeover-silence`

## Não faremos

- Não vamos tentar identificar qual consultor digitou (Whapi não envia user). Só pausar.
- Não desfaz takeover automaticamente — só via botão "Devolver para o passo" no painel.

## Problema

1. **IA não obedece o "Assumir"**: clicar em "Assumir" no painel "IA ao vivo" seta `customers.bot_paused = true`, mas os webhooks (`whapi-webhook/index.ts` e `evolution-webhook/index.ts`) só checam `bot_paused_until` (timestamp). O boolean é ignorado → bot continua respondendo.
2. **Sem template rápido dos passos do fluxo**: hoje `/comando` no chat só busca templates manuais; não inclui os passos configurados em `/admin/fluxos`.
3. **Sem envio passo-a-passo manual**: quando assumo, quero escolher um passo do fluxo e disparar peça por peça (áudio → imagem → texto), confirmando cada uma.

## Mudanças

### 1. Respeitar `bot_paused` em todos os webhooks

Arquivos:
- `supabase/functions/whapi-webhook/index.ts` (~linha 414)
- `supabase/functions/evolution-webhook/index.ts` (bloco equivalente)

Antes do bloco de `bot_paused_until`, adicionar:

```text
if (customer.bot_paused === true) {
  // loga inbound, não responde
  insert conversations { inbound, messageText, step }
  return 200 { ok: true, msg: "bot_paused_manual" }
}
```

Isso vale para qualquer motivo (`humano_assumiu`, `lead_pediu_humano`, `muitas_duvidas`, etc.). Cobre o caso reportado: assumi → IA cala.

Também adicionar a mesma guarda no início de `runConversationalFlow` e no início de `processBotFlow` (defesa em profundidade, caso alguma rota chame direto).

### 2. Painel "IA ao vivo": botão "Enviar passo" quando humano assumiu

Arquivo: `src/components/admin/AIAgentTab/LiveConversationsPanel.tsx`

Na linha de cada lead em "Você está atendendo", além de "Devolver para…", adicionar **"Enviar passo do fluxo"**:

- Abre um dialog listando todos os `bot_flow_steps` ativos (já temos `flowSteps` no estado).
- Ao escolher um passo, mostra preview do conteúdo (texto + mídias associadas: áudio, imagem, vídeo).
- Botões: **"Enviar tudo agora"** (sequencial com delays) **e** **"Enviar 1 a 1"** — neste modo o dialog vira uma fila: cada item tem botão "Enviar próximo", o usuário dispara um por um sem fechar a tela.
- Cada envio chama uma nova edge function `manual-step-send` (abaixo). **Não despausa o bot** — segue pausado até o usuário clicar "Devolver para…".

### 3. Edge function `manual-step-send`

Nova função `supabase/functions/manual-step-send/index.ts`:

Entrada:
```text
{ consultantId, customerId, stepId, partIndex }
```
- `partIndex` indica qual peça enviar (0=áudio, 1=imagem/vídeo, 2=texto), ou `"all"` para sequencial.
- Resolve o passo, baixa mídias, envia via Whapi/Evolution (usa o sender já existente).
- Loga em `conversations` como `outbound` com `sent_by = "human_via_step"`.
- **Não altera `conversation_step`** (humano não está avançando o fluxo, só usando como template).
- Mantém `bot_paused = true`.

### 4. Quick reply "/" inclui passos do fluxo

Arquivo: `src/components/whatsapp/QuickReplyMenu.tsx` + `MessageComposer.tsx`

- Carregar `bot_flow_steps` ativos do consultor junto com os templates.
- No menu, adicionar seção **"Passos do fluxo"** abaixo de "Respostas rápidas".
- Selecionar um passo:
  - Se só texto → cola no composer (comportamento atual de template).
  - Se tem mídias → abre um mini-prompt: "Enviar áudio? Imagem? Texto?" com checkboxes e botão "Enviar selecionados" (reaproveita `manual-step-send`).

## Fora de escopo

- Não muda lógica do fluxo automático.
- Não muda `bot_paused_until` (handoff por tempo continua igual).
- Não muda intents, OCR, cadastro, schema (exceto se faltar `sent_by` na enum de `conversations` — verifico ao implementar).

## Validação mental

- Clico "Assumir" → mando msg pelo WhatsApp → bot **não responde**. ✅
- Clico "Enviar passo > pitch_conexao_club > 1 a 1" → áudio sai, espero, clico "próximo" → imagem sai, clico "próximo" → texto sai. Bot continua pausado. ✅
- No chat, digito `/pitch` → vejo o passo na lista, escolho, envio o áudio sozinho. ✅
- Clico "Devolver para… > Continuar de onde parou" → bot volta ao normal. ✅

## Arquivos

```text
supabase/functions/whapi-webhook/index.ts            ~ guarda bot_paused
supabase/functions/evolution-webhook/index.ts        ~ guarda bot_paused
supabase/functions/whapi-webhook/handlers/conversational/index.ts  ~ guarda defensiva
supabase/functions/whapi-webhook/handlers/bot-flow.ts              ~ guarda defensiva
supabase/functions/manual-step-send/index.ts         + nova função
src/components/admin/AIAgentTab/LiveConversationsPanel.tsx         ~ dialog "Enviar passo"
src/components/admin/AIAgentTab/ManualStepDialog.tsx               + novo componente
src/components/whatsapp/QuickReplyMenu.tsx                         ~ seção "Passos do fluxo"
src/components/whatsapp/MessageComposer.tsx                        ~ carregar steps + handler
```

Posso seguir?
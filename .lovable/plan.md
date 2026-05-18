## Problema

O Passo 10 (Confirmação / `finalizar_cadastro`) é entregue só como texto:

> 📋 Todos os dados foram preenchidos! 1 ✅ Finalizar  
> _Digite 1 ou FINALIZAR para concluir:_

O cliente precisa digitar — não aparece o botão interativo do WhatsApp como nos outros passos.

## Causa raiz

Em `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas 2711-2725), após o passo "Conta de energia" o motor chama `dispatchStepFromFlow(nextCustom.step_key)` que envia o `message_text` configurado como **texto puro**. O `sendFinalizarButton()` só é executado como fallback (`if (!ok)`), ou seja, quando o passo está vazio. Como a admin configurou texto customizado, o dispatch retorna `ok=true` e o botão nunca é enviado.

O mesmo problema existe no estado `ask_finalizar` (linha 3729): se o cliente entrar nesse estado vindo do dispatch custom, a mensagem original já foi enviada sem botão.

## Solução

Quando o próximo passo for `step_type === "finalizar_cadastro"`, enviar a mensagem do passo (custom ou fallback) sempre via `sendOptions(...)` com o botão `btn_finalizar`, em vez do dispatch de texto puro.

### Mudanças

1. **`supabase/functions/whapi-webhook/handlers/bot-flow.ts` (~linha 2720)** — no branch `else if (nextCustom.step_type === "finalizar_cadastro")`:
   - Buscar `message_text` do passo (com fallback para `FINAL_FALLBACK_TEXT`).
   - Substituir variáveis (`{{nome}}`, etc.) usando os `_vars` já disponíveis.
   - Chamar `sendOptions(remoteJid, texto, [{ id: "btn_finalizar", title: "✅ Finalizar" }])` em vez de `dispatchStepFromFlow`.
   - Registrar em `conversations` (outbound).
   - Definir `updates.conversation_step = "ask_finalizar"`.

2. **Manter** o handler `ask_finalizar` (linha 3729) como está — ele já reenvia com botão se o cliente responder algo inválido.

### Pontos fora do escopo

- Não mexer no `message_text` do passo no banco — a admin continua editando o texto livremente no `/admin/fluxos`.
- Não alterar mídia (áudio/imagem/vídeo) anexada ao passo: se houver, ainda enviar antes do texto com botão (manter ordem `text→audio→video→image` adaptada — texto vira `sendOptions`).
- Não mexer em outros `step_type`.

## Resultado esperado

O Passo 10 chega ao cliente com a mensagem configurada **+ botão interativo "✅ Finalizar"**, exatamente como os passos intermediários (Adicionar / Pular, etc.).

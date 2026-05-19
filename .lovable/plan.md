# Devolver lead já entrando no fluxo (com áudio)

## Problema (caso Nilma)

Hoje, quando você clica em **"Devolver para… → [Passo X do fluxo]"** no painel de conversas ao vivo, o código só:

1. Despausa o bot (`bot_paused = false`).
2. Reposiciona `conversation_step` para o passo escolhido.
3. Limpa `last_custom_prompt_at`.

Ele **não dispara nada na conversa**. O bot fica em silêncio até o lead mandar a próxima mensagem — e só aí re-emite o passo. Resultado: a Nilma "travou" porque ninguém mandou o áudio/pergunta de novo, e ela não tinha mais o que responder.

## Solução

Quando o admin escolhe **um passo específico** do fluxo no menu "Devolver para…", o sistema deve:

1. Despausar o bot e setar o `conversation_step` (igual hoje).
2. **Imediatamente** disparar o passo completo no WhatsApp na ordem correta (texto → áudio → imagem → vídeo), reusando a `manual-step-send` com `part: "all"`.
3. Para "Continuar de onde parou" e "Passos clássicos" (legados): manter comportamento atual (só despausa, sem re-emitir) — não temos passo de fluxo definido pra disparar.

## Mudanças

### `src/components/admin/AIAgentTab/LiveConversationsPanel.tsx`

- Em `returnToStep`, depois do update bem-sucedido, se `stepValue` corresponde a um passo do `flowSteps` (UUID), invocar `supabase.functions.invoke("manual-step-send", { body: { consultantId, customerId, stepId, part: "all" } })`.
- Toast novo: `"↩️ Devolvido e disparado: <título do passo>"`.
- Se a invocação falhar, mostrar toast de erro mas manter o despause (não reverter).
- "Continuar de onde parou" (`stepValue === null`) e os `LEGACY_STEPS` continuam sem auto-disparo.

### Nada muda no backend

A `manual-step-send` já envia tudo na ordem (`media_order` do passo, default `audio → image → video → text → document`) e já registra cada item em `conversations`. O guard de anti-duplicação que adicionamos (60s por texto idêntico) continua protegendo de eventuais cliques duplos.

## Detalhes técnicos

- O `part: "all"` da `manual-step-send` já ordena por `media_order` do step. Se o admin quiser áudio antes de texto, basta configurar `media_order: ["audio","text",...]` no passo (já existe).
- `manual-step-send` NÃO mexe em `conversation_step` nem em `bot_paused` — então a ordem (1) update do customer, (2) invoke da função, é segura.
- Para Nilma especificamente, depois do deploy basta abrir o painel, escolher "Devolver para… → Passo 2 (qualificação)" e o áudio sai na hora.

## Fora de escopo

- Não tocar em `evolution-webhook`, `bot-flow.ts`, ou na lógica de auto-dispatch quando o lead responde — só mudo o gatilho manual no painel.
- Não criar passo novo nem mudar `media_order` de passos existentes.

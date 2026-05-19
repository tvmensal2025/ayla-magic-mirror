## Problema (caso Marcelo, 18/05 23:52)

Conversa real:
```
23:52:07  inbound  "Sou Marcelo"              (step passo_mp8yc0bp)
23:52:19  inbound  "Amanhã eu mando os documentos"
23:52:23  outbound "Marcelo, qual o valor médio da sua conta de luz?"
23:52:30  outbound "Marcelo, qual o valor médio da sua conta de luz?"   ← duplicada
```

O lead mandou 2 mensagens com 12 s de diferença. Cada uma virou uma invocação do `whapi-webhook`. O lock por cliente serializou — mas a segunda invocação rodou logo após a primeira liberar e re-emitiu o MESMO prompt do passo `3e7fb4cd` ("valor da conta de luz"), mesmo o anti-rep de 10 min existindo em `dispatchStepFromFlow`.

Causa raiz combinada:
1. **Sem coalescing**: 2 inbounds próximos são processados como 2 turnos independentes. A 2ª invocação re-entra no resolver de step custom e, como o `step_type="message"` tem capture inline (`electricity_bill_value`), tenta capturar de "Amanhã eu mando os documentos" → extração falha → re-emite.
2. **Anti-rep contornado**: a re-emissão acontece por um caminho que insere `conversations.conversation_step` com prefixo `flow:` enquanto a 1ª gravou sem prefixo. O `dispatchStepFromFlow` normaliza, mas o segundo envio veio do fluxo final de `reply`/`respondAndReentry`, que NÃO passa pela checagem de anti-rep.
3. **`last_custom_prompt_at` só é gravado para `capture_*`/`confirm_phone`** (linha 2228 de `bot-flow.ts`). Step `message` com capture inline fica de fora — o guard legacy nunca aciona.

## Plano (escopo cirúrgico)

### 1. Debounce de inbound em rajada (coalescing)
`supabase/functions/whapi-webhook/index.ts` (perto do bloco de lock, linhas 584‑618):
- Antes de adquirir o lock: se `customers.last_bot_interaction_at` (ou último outbound) < 4 s, **dormir 3 s** e re-buscar mensagens recebidas nesse intervalo via tabela `whatsapp_message_buffer`, concatenando os textos como um único turno.
- Se já chegou inbound mais novo do que o que estamos processando, abandonar este e deixar o mais novo prosseguir (descarte idempotente — não envia nada).

Resultado prático: duas mensagens do lead em 12 s viram **1 turno** ("Sou Marcelo. Amanhã eu mando os documentos").

### 2. Anti-rep unificado em TODA emissão de step custom
`supabase/functions/whapi-webhook/handlers/bot-flow.ts`:
- Extrair a verificação de "já emiti esse step nos últimos 10 min" para um helper `wasStepRecentlyEmitted(stepKey)`.
- Aplicar esse helper em **3 lugares** (não só em `dispatchStepFromFlow`):
  a) Antes do `emittedCurrent` na linha 2042.
  b) Dentro de `respondAndReentry` antes de re-anexar a pergunta final.
  c) No `default:` do switch (linha ~2241) antes do redispatch idempotente.
- Normalizar `flow:` prefix nos DOIS lados (já faz, mas garantir cobertura).

### 3. `last_custom_prompt_at` para steps `message` com capture inline
`supabase/functions/whapi-webhook/handlers/bot-flow.ts` linha 2228:
- Mudar a condição para também marcar `last_custom_prompt_at` quando o step atual for `message` E tiver `captures[].enabled === true` E `dispatchedAny === true`.
- Isso fecha a porta para o handler legacy de capture (que já checa esse campo) re-emitir.

### 4. Contador de retry para captures inline falhos
Quando o step é `message` com capture inline e a captura não conseguiu extrair valor da mensagem do lead:
- Incrementar `custom_step_retries` (mesma coluna já usada).
- 1ª falha: enviar mensagem CURTA de reformulação ("Me passa só o valor em R$, ex: 250") — **sem re-enviar áudio/vídeo/imagem do step**.
- 2ª falha: pausar bot e disparar `notifyHandoff` (mesma lógica já existente, linhas 2104‑2138).

### 5. Espelhar em `evolution-webhook`
Aplicar exatamente as mudanças 2, 3, 4 em `supabase/functions/evolution-webhook/handlers/bot-flow.ts` (paridade já garantida hoje — não pode divergir).

## Validação

1. Reproduzir o caso enviando 2 mensagens em < 5 s para o bot no step "valor da conta": **deve enviar o prompt apenas 1 vez**.
2. Enviar resposta inválida ("amanhã eu mando"): deve responder com reformulação curta, **não** repetir o áudio/imagem do step.
3. Enviar 2 respostas inválidas seguidas: bot pausa e notifica consultor.
4. Conferir `conversations` do Marcelo (af00073b‑8ba1‑4bed‑9e22‑e010304f3230) em teste — sem 2 outbounds idênticos consecutivos.

## Fora de escopo

- Não mexer no resolver de transitions/intents (já funciona).
- Não mexer no fluxo de cadastro legacy (aguardando_conta/doc_auto).
- Não mexer na UI de admin/fluxos.

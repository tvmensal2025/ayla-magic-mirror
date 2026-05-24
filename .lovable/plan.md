## Diagnóstico

- O simulador está chamando `flow-simulate-run`, que por sua vez chama o motor real `whapi-webhook` em modo teste.
- Para a variante D, o primeiro passo (`d_welcome`) tem botões configurados, mas está com `wait_for: none` e `media_order: [audio, image, video, text]`.
- No caminho de restart (`conversation_step = welcome`), o código envia texto via `sendStepMedia` ou `sendText`, mas não usa `sendButtons`; por isso o banco registra `kind: text`, e o simulador não tem botões para renderizar.
- O fluxo fica processando cerca de 8–9s porque `flow-simulate-run` sempre espera polling até estabilizar por 1,5s após o webhook, mesmo quando já recebeu um evento final.
- A repetição ainda acontece porque o reset inicial apaga o customer, mas não limpa `conversations`/`ai_slot_dispatch_log`; e o caminho de restart não compartilha o mesmo anti-repetição/botões do `emitStep`, criando divergência entre “começo do fluxo” e “próximos passos”.

## Plano de implementação

1. **Unificar o envio do passo inicial com o envio real de passos**
   - Em `supabase/functions/whapi-webhook/handlers/conversational/index.ts`, ajustar o bloco `unknown step -> restart` para usar o mesmo helper de emissão que já trata mídia, texto, botões e ordem configurada.
   - Quando o passo tiver `captures._buttons`, enviar `ctx.sender.sendButtons(...)` com os IDs reais, inclusive no primeiro welcome.
   - Preservar a ordem configurada: áudio/imagem/vídeo/texto, mas se o texto final tem botões, o texto deve sair como mensagem interativa com botões e não como texto simples.

2. **Evitar repetição no simulador sem mudar dados reais**
   - Garantir que `flow-simulate-reset` limpe também os rastros do sandbox em `conversations` e `ai_slot_dispatch_log`, além dos `bot_test_runs`.
   - No `fresh: true` de `flow-simulate-run`, aplicar a mesma limpeza leve do sandbox antes de rodar o fluxo, para não sobrar anti-dup/dedupe antigo causando pulo ou repetição.

3. **Reduzir o “processando...” do simulador**
   - Em `flow-simulate-run`, encerrar o polling mais cedo quando já houver evento de texto/botões final ou quando o webhook terminou e não há novos eventos por um intervalo curto.
   - Manter margem suficiente para capturar áudio + texto + botões na ordem correta.

4. **Renderizar botões exatamente como enviados pelo Whapi**
   - Confirmar que o `bot_test_outbound` registre `kind: buttons` com JSON `{ text, buttons: [{ id, title }] }`.
   - O `FlowSimulator.tsx` já renderiza `kind: buttons`; se necessário, ajustar apenas para preservar espaçamento/formatação WhatsApp sem inventar texto.

5. **Validação final**
   - Testar `flow-simulate-run` com variante D e `fresh: true`.
   - Verificar que o retorno contém áudio quando configurado e depois `kind: buttons` com os 3 botões reais.
   - Verificar que responder clicando no botão do simulador envia `button_id` real e avança para o passo configurado, sem repetir o welcome.
   - Verificar logs do `whapi-webhook` para confirmar que o caminho Whapi real continua usando botões, enquanto Evolution segue aceitando `1`, `2`, `3`.
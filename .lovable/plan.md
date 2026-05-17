Diagnóstico confirmado:

- O link final foi gerado e salvo no banco para a cliente `c52d49af...`:
  `https://digital.igreenenergy.com.br/validacao-codigo/1460954?id=129414&sendcontract=true`
- O problema é que o worker do portal ainda envia OTP e link facial via Evolution em `notificarClienteOTP()` e `sendFacialLinkToCustomer()`. Como a instância Evolution do consultor está `needs_reconnect` e o projeto está configurado com `whapi_token`, a mensagem final não chegou ao cliente.
- O Whapi webhook atual não tem interceptação de OTP antes do roteamento normal do bot. Se o cliente mandar só o código, pode cair como mensagem comum/nova conversa em vez de alimentar `/confirm-otp` do worker.
- A confirmação de telefone repetiu porque o fluxo manda texto numerado `1/2` e também tenta botão. Além disso, o texto `1` foi bloqueado para evitar falso positivo, então o cliente precisou confirmar de novo com o botão.
- O complemento hoje é só texto: não existe botão de `Pular` nem botão de `Acrescentar complemento` mapeado.
- As demoras vêm de dois pontos: envios de mídia/Whapi aguardando tempo demais dentro da Edge Function e perguntas do cliente/off-topic que podem repetir o passo em vez de responder e retomar o mesmo ponto do funil.

Plano de implementação:

1. Tornar o worker 100% compatível com Whapi para OTP e link facial
   - Criar helper de envio no `worker-portal/playwright-automation.mjs` com prioridade Whapi.
   - Usar `settings.whapi_token` / `WHAPI_TOKEN` e `whapi_api_url` para enviar texto em `/messages/text`.
   - Manter Evolution só como fallback opcional, nunca como canal principal nesse fluxo.
   - Reusar esse helper em:
     - `notificarClienteOTP()`
     - `sendFacialLinkToCustomer()`
   - Registrar claramente no log se a mensagem foi enviada por Whapi, Evolution ou falhou.

2. Garantir captura de OTP no Whapi
   - Adicionar no `supabase/functions/whapi-webhook/index.ts` um interceptador de OTP antes de criar/retomar lead e antes de rodar o bot.
   - Procurar cliente do mesmo telefone/consultor com status `awaiting_otp` ou `portal_submitting`.
   - Salvar `otp_code` e `otp_received_at` no cliente.
   - Chamar o worker `POST /confirm-otp` usando `portal_worker_url`/`WORKER_PORTAL_URL` e `worker_secret`.
   - Responder ao cliente: “Código recebido, estou processando”.
   - Não deixar OTP cair no fluxo conversacional normal.

3. Garantir envio obrigatório do link facial
   - Depois que o worker detectar ou construir `validacao-codigo/...`, salvar `link_facial` e `link_assinatura` como já faz.
   - Enviar o link via Whapi imediatamente.
   - Se o primeiro envio falhar, tentar novamente com backoff curto.
   - Se ainda falhar, registrar alerta em `bot_handoff_alerts` e manter `error_message`, mas sem perder o link salvo.
   - Evitar link duplicado colado duas vezes: normalizar antes do envio quando vier repetido no texto.

4. Corrigir botões de telefone para não aparecer duplicado
   - Em Whapi, quando houver botão real, enviar a pergunta sem lista `1/2` no corpo.
   - O fallback numerado só aparece se `sendButtons` falhar.
   - Aceitar `1` e `2` também como texto válido apenas nos steps de confirmação, para não travar o cliente caso ele responda digitando.
   - Mapear:
     - `sim_phone` ou `1` → confirmar telefone
     - `editar_phone` ou `2` → pedir outro número

5. Adicionar botões no complemento
   - No step `ask_complement`, enviar botões Whapi:
     - `skip_complement` → salvar complemento vazio e avançar
     - `add_complement` → pedir para digitar o complemento e manter no mesmo step
   - Mapear também texto livre:
     - `não`, `nao`, `pular`, `sem complemento`, `skip_complement` → pular
     - qualquer outro texto após escolher adicionar → salvar como complemento
   - Ajustar a mensagem para não depender só de “digite NÃO/PULAR”.

6. Proteger perguntas do cliente sem quebrar o funil
   - Antes de repetir um step de cadastro, detectar pergunta/off-topic.
   - Se houver FAQ/QA configurado, responder a dúvida e manter o mesmo `conversation_step`.
   - Depois da resposta, mandar um lembrete curto do passo atual, sem avançar indevidamente.
   - Aplicar isso nos steps críticos: documento, confirmação, telefone, email, complemento, finalizar.

7. Reduzir travamentos e demora
   - Diminuir waits longos dentro do envio Whapi para texto/botões.
   - Para mídia pesada, não deixar a Edge Function depender de timeout longo para avançar o estado.
   - Persistir o próximo `conversation_step` antes de operações demoradas quando for seguro.
   - Melhorar logs de transição para identificar exatamente em qual step parou.

8. Validação após implementar
   - Testar fluxo Whapi com lead de teste do início ao fim:
     - abertura → nome → valor → conta → documento → telefone → email → complemento → finalizar → OTP → link facial.
   - Conferir no banco:
     - `conversation_step`
     - `status`
     - `otp_code`
     - `link_facial`
     - `conversations`
     - `bot_step_transitions`
   - Confirmar que telefone não repete botão/texto, complemento tem botões e o link final é enviado ao cliente.

Resultado esperado:

- O fluxo passa a funcionar pela Whapi, sem depender da Evolution desconectada.
- OTP sempre é pedido e capturado.
- Link facial sempre é enviado quando existir.
- Perguntas do cliente não quebram nem reiniciam o funil.
- Telefone e complemento ficam com botões claros e mapeados.
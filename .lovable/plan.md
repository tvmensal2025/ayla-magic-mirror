## Diagnóstico — Donizete

O OTP `732320` foi salvo no banco (`otp_received_at: 14:00:38`), mas o portal iGreen ainda mostra a tela de "Confirmação de código" com o campo vazio. Significa que a VPS/Playwright NÃO digitou o código no campo certo e/ou NÃO clicou em "Confirmar" antes de finalizar o job.

### Por que falhou

Analisando `worker-portal/playwright-automation.mjs` (linhas 1773-1837):

1. Após clicar "Finalizar", o worker detecta a tela de OTP e chama `aguardarOTP(customerId, 300000)` (5 min de timeout).
2. O `aguardarOTP` faz polling em `/otp/{customerId}` e no Supabase a cada 1.5s.
3. Quando o código chega, ele tenta achar o campo OTP com esses seletores em cascata:
   - `input[name="token|otp|otpCode|code|verificationCode]`
   - fallback: `input[maxlength="6|4|8"]`
   - fallback: `input[placeholder*="código"], input[type="tel"]`
   - último fallback: qualquer input visível vazio
4. Em seguida procura um botão `"Confirmar|Verificar|Enviar|Validar|Continuar"`.

Problemas que provavelmente ocorreram:
- O campo OTP no portal não bateu com nenhum dos seletores acima (o portal usa um Material UI input genérico, sem `name`), então o worker pode ter digitado em outro campo ou silenciosamente pulado.
- O log do worker mostra `"⚠️ Nenhum botão de confirmar OTP encontrado (auto-submit?)"` quando isso acontece — mas o job continua mesmo assim.
- Como o `try/catch` engole o erro e a "Estratégia 5 (fallback construtivo)" cria o link facial só com `igreen_code + igreen_id`, o worker salvou `link_facial` e encerrou o job mesmo com a etapa OTP inacabada no portal. O `aguardarOTP` pode até ter dado timeout e foi engolido — o portal ficou aberto esperando o código.

Outro detalhe crítico: o `link_facial` salvo é o `https://digital.igreenenergy.com.br/validacao-codigo/1463252?id=142381&sendcontract=true` — esse link é justamente a tela do segundo OTP que o cliente vê no print. Sem o primeiro OTP ter sido confirmado pela VPS, o cadastro do portal não chegou a entrar no estágio de assinatura/facial real.

## Plano de correção

1. Resgatar o cadastro do Donizete agora
   - Recolocar o lead na fila do worker (`/force-submit`) com o OTP `732320` já salvo no banco para que, ao chegar na fase OTP, o worker o use imediatamente sem aguardar.
   - Antes de reenviar, limpar `link_facial`, `link_assinatura`, `facial_link_sent_at`, `otp_code` e voltar `conversation_step` para `aguardando_otp` (mantendo todos os dados já preenchidos).
   - Restaurar o `name` para "APARECIDO DONIZETE DE OLIVEIRA" (foi sobrescrito por engano para "Código Recebido" pelo multi-field extractor).

2. Endurecer a fase OTP no Playwright (`worker-portal/playwright-automation.mjs`)
   - Adicionar seletores específicos do Material UI usado pelo portal iGreen: `input[id*="token" i]`, `input[id*="otp" i]`, `input[id*="codigo" i]`, `input[aria-label*="código" i]`, `input[autocomplete="one-time-code"]`.
   - Validar APÓS digitar: ler `value` do input e conferir que bate com o OTP; se não bater, tentar próximo seletor.
   - Confirmar APÓS clicar "Confirmar": esperar 5s e verificar se a URL mudou ou se apareceu mensagem de sucesso/erro. Se NADA mudou, registrar `error_message = "otp_not_confirmed"` e NÃO seguir para a estratégia 5.
   - Falhar o job (`throw`) quando OTP não foi confirmado em vez de continuar para fallback construtivo — assim o link facial só é gravado quando o portal realmente passou pra próxima etapa.

3. Proteger a Estratégia 5 (fallback construtivo)
   - Só construir o link `validacao-codigo` se houve confirmação OTP bem-sucedida (flag `otpConfirmado === true`). Caso contrário, marcar `automation_failed` e logar `pendência: OTP não confirmado no portal`.

4. Notificar o cliente quando o OTP falhar
   - Quando o worker falhar a etapa OTP, atualizar `conversation_step` para `otp_falhou` e o whapi-webhook envia uma mensagem natural pedindo para o cliente reenviar o código (ou aguardar nova tentativa).

5. Corrigir bug secundário do nome
   - Em `supabase/functions/_shared/multi-field-extractor.ts`, incluir `user_confirmed` e `ocr_conta` em `strongNameSources` para impedir que mensagens livres do cliente sobrescrevam nome confirmado.

6. Validar
   - Observar logs do worker-portal e confirmar `"✅ OTP confirmado (botão Confirmar)"` + screenshot `11-apos-otp` mostrando a tela seguinte (não mais o campo OTP).
   - Confirmar no banco que `facial_link_sent_at` foi preenchido.
   - Confirmar com o Donizete (WhatsApp) que recebeu o link e conseguiu fazer a selfie.

## Arquivos envolvidos

- `worker-portal/playwright-automation.mjs` — endurecer fase OTP + Estratégia 5
- `supabase/functions/_shared/multi-field-extractor.ts` — proteger nome
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — novo step `otp_falhou`
- Migration: resetar Donizete (limpar `link_facial`, `facial_link_sent_at`; restaurar `name`; manter `otp_code`; `conversation_step = aguardando_otp`)
- Chamada HTTP `/force-submit` ao worker-portal logo após a migration

Importante: as mudanças no `worker-portal/` rodam na VPS (Easypanel) e exigem deploy manual lá. O Lovable só consegue fazer as mudanças no repositório — o usuário precisa atualizar o serviço no Easypanel para que entrem em vigor.
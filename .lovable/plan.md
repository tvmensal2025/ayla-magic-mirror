## Deploy do que foi alterado

Mudanças pendentes desta sessão que precisam ir pro ambiente:

### 1. Migration de banco
- `supabase/migrations/20260525022641_*.sql` — adiciona coluna `otp_test_phone` em `customers`.
- Já está commitada; só confirmar que rodou no projeto Supabase. Se não rodou, aplicar.

### 2. Edge functions a fazer deploy
- `flow-simulate-run` — removeu modo real, aceita `otp_real_phone`, persiste em `customers.otp_test_phone`, força sandbox + fast clock.
- `flow-step-suggest` — fix do parse de JSON truncado do Gemini (erro 500 que você viu).
- `whapi-webhook` — handler `bot-flow.ts` com botão "IA / Ainda tenho dúvida" + suporte a `otp_test_phone` no Portal Worker.

### 3. Validação pós-deploy
- Abrir `/admin/fluxos` → simulador → rodar turno texto: resposta < 2s, nada chega no WhatsApp real.
- Clicar "Gerar próximos passos (IA)" no inspector → sem erro 500.
- Preencher "Telefone p/ OTP" e rodar fluxo até `finalizando` → SMS real chega no número, código digitado no simulador avança.
- Conferir que o tab "Avançado" do StepInspector está oculto para consultor (visível só super admin).

### Comandos
```
supabase functions deploy flow-simulate-run flow-step-suggest whapi-webhook
```
Migration roda automática pelo workflow do Lovable Cloud — só verificar no painel se a coluna existe.

Aprove para eu executar.
## Objetivo

Simulador 100% rápido (mock + delays curtos). **Modo Real run-wide some** — em vez disso, apenas a chamada do Portal Worker (que dispara o SMS de OTP da distribuidora) acontece de verdade, usando o telefone real informado. Toda a conversa (texto, áudio, vídeo, OCR) continua no simulador.

## Mudanças

### 1. UI — `src/components/admin/flow-builder/FlowSimulator.tsx`
- Remover o toggle "🔴 Modo Real" e estados `realMode` relacionados.
- Substituir por um campo único **"📲 Telefone real para receber OTP (opcional)"** (input com máscara 55 + DDD + número).
- Se preenchido e válido → enviar `otp_real_phone` no body do `flow-simulate-run`. Se vazio → continua tudo mock (stub do OTP atual: "digite qualquer 4-6 dígitos").
- Atualizar os badges/legendas para refletir o novo modelo (sem "fluxo 100% real").

### 2. `supabase/functions/flow-simulate-run/index.ts`
- Aceitar `otp_real_phone` (string, opcional) no body. Validar 12-13 dígitos.
- **NÃO** enviar mais `x-bot-real-services` para o webhook.
- Continuar usando o customer sandbox (`5500000...`), `is_sandbox: true`.
- Persistir o telefone real no customer em um novo campo `otp_test_phone` (ver migration) para o passo do portal usar.
- Manter `x-bot-fast-clock` e `x-bot-bypass-quiet-hours`.

### 3. Migration
```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS otp_test_phone text;
```
Coluna nullable, só usada quando `is_sandbox=true` e o simulador informou um telefone real para receber OTP.

### 4. `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas ~4910-4960)
No bloco que entra em `portal_submitting`:
- Manter o stub `isMockMode()` atual **como default** (rápido, sem portal).
- **Exceção:** se `isMockMode()` **e** `customer.otp_test_phone` estiver preenchido → pular o stub e executar o caminho real do Portal Worker, **mas** sobrescrevendo o telefone enviado ao worker pelo `otp_test_phone` (para o SMS chegar no número certo). O `sender` continua sendo o `mockSender`, então as mensagens "Aguarde..." e "Código recebido" ficam apenas no simulador.
- O intercept de OTP existente (whapi-webhook linhas 327-400) já confirma o código no worker quando o usuário digita no simulador — funciona sem mudança.

### 5. Limpeza
- Remover/ocultar o caminho `realServices = true` do `whapi-webhook/index.ts` para sandbox phones (deixar apenas o sandbox mock + a exceção do portal acima). `mirrorSender` pode ficar para um eventual uso futuro, mas não é mais acionado pelo simulador.

## Validação manual

1. Sem telefone preenchido: rodar fluxo até `finalizando` → bot responde "modo teste, digite qualquer 4-6 dígitos" instantaneamente.
2. Com telefone real preenchido: rodar até `finalizando` → recebo SMS no celular real → digito no simulador → bot avança para `cadastro_em_analise`/`complete`.
3. Cronometrar um turno texto simples: deve voltar em <2s (sem ida ao Whapi real).

## Notas técnicas

- Nenhuma mensagem do bot é enviada para o WhatsApp real em nenhum cenário — só o Portal Worker é chamado, e ele que dispara SMS via distribuidora.
- O `otp_test_phone` é limpo no "Zerar" junto com os outros campos no `patch` de fresh reset.

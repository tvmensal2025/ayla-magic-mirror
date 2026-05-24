# Simulador 100% fiel ao fluxo (boas-vindas → OCR conta → cadastro → OTP → facial)

## Situação atual

Hoje o simulador só consegue chegar até "Quero simular / Como funciona" e parar no resultado mock do OCR. Os passos seguintes (`aguardando_doc_auto`, `cadastro_portal`, `aguardando_otp`, `aguardando_facial`, `finalizar_cadastro`) dependem de serviços externos reais:

- **OCR conta de luz** → chama worker de OCR (Gemini Vision) com a imagem real
- **OCR documento** → mesma pipeline, exige PDF/foto real do RG/CNH
- `**cadastro_portal**` → edge function `submit-cadastro` que faz scraping no portal iGreen
- `**aguardando_otp**` → edge function `submit-otp` valida no portal
- `**aguardando_facial**` → edge function `start-facial` gera link real de biometria
- `**finalizar_cadastro**` → marca status no portal

No modo simulador (`testMode` / `is_sandbox`) nada disso pode bater nos serviços reais — caso contrário polui o portal de produção e o WhatsApp.

## Objetivo

Permitir rodar **o fluxo inteiro** dentro do simulador, com stubs determinísticos para cada passo externo, mantendo a mesma ordem de mensagens/botões que o cliente real veria.

## Plano

### 1. Stubs sandbox no webhook

Em `whapi-webhook/handlers/bot-flow.ts` (cases `aguardando_otp`, `validando_otp`, `otp_falhou`, `aguardando_doc_auto`, `cadastro_portal`, `aguardando_facial`, `finalizar_cadastro`) e nos pontos de OCR (`conversational/index.ts` linhas ~754 e ~1115), envolver as chamadas `fetch` para `submit-otp`, `submit-cadastro`, `start-facial` e worker OCR em um guard:

```ts
if (testMode || customer.is_sandbox) {
  // stub determinístico
} else {
  // fluxo real
}
```

Stubs por passo:

- **OCR conta**: usa valor fake (`R$ 350,00`, economia 20%) e nome “Cliente Teste” já presentes no mock atual
- **OCR documento**: aceita qualquer anexo e devolve CPF/nome fake (`123.456.789-00`, mesmo nome)
- **submit-cadastro**: marca `conversation_step = aguardando_otp` em ~1s e emite a mensagem “📲 Te enviei um código…”
- **submit-otp**: aceita qualquer código 4-8 dígitos, avança para `aguardando_facial`
- **start-facial**: devolve link fake (`https://sandbox.igreen.cloud/facial/teste`) e avança para `finalizar_cadastro`
- **finalizar_cadastro**: emite mensagem final “🎉 Cadastro concluído (modo teste)”

### 2. Anti-loops e timing

- Stubs respondem síncronos no mesmo turno (sem fire-and-forget) para o polling do simulador detectar o avanço dentro do `deadlineMs` atual (8s).
- Não chamam `whapi/send` real — apenas gravam `conversations` (que o simulador lê).

### 3. Auto-anexos no simulador

`flow-simulate-run/index.ts`: quando o passo atual exigir mídia (`aguardando_conta`, `aguardando_doc_auto`) e o usuário clicar em um botão equivalente (“Enviar conta”, “Enviar documento”), o front (`FlowSimulator.tsx`) já oferece upload, mas precisamos garantir que o backend gere uma `image`/`document` mockada se o usuário digitar `mock` ou clicar em “Usar conta de teste”. Adicionar botão visível “🧪 Usar conta/doc de teste” no simulador para anexar URL pública fake.

### 4. Regressão automatizada

Criar `flow-simulate-run/regression_test.ts` que roda end-to-end:

1. Zerar
2. “oi” → captura nome
3. “Quero simular” → conta mock → resultado
4. “Cadastrar agora” → doc mock → `aguardando_otp`
5. “123456” → `aguardando_facial`
6. Clique no link facial → `finalizar_cadastro`

Verifica em cada turno: `step_before → step_after`, presença de texto/botões esperados, nenhuma repetição.

### 5. Validação

- Rodar regression test
- Abrir simulador da variante A e D, percorrer manualmente o fluxo completo, confirmar mensagem final “Cadastro concluído (modo teste)”
- Conferir logs do `whapi-webhook` para garantir que nenhuma chamada real a `submit-otp`/`submit-cadastro`/`start-facial` foi feita em modo sandbox

## Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (guards sandbox nos cases de OTP/cadastro/facial)
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (guards no pipeline de OCR)
- `supabase/functions/flow-simulate-run/index.ts` (mock de anexos sob demanda)
- `supabase/functions/flow-simulate-run/regression_test.ts` (novo)
- `src/components/admin/fluxos/FlowSimulator.tsx` (botão “Usar conta/doc de teste”)

## Perguntas antes de implementar

1. Confirmar: em modo sandbox **E IR PARA R**eais (portal iGreen, OCR Gemini, biometria TEM QUE FAZERO FLUXO REAL DO INICOAO FINAL
2. OK usar valores REAIS DE ACORDO COM A FATURA, TODOS OS TESTES SERAO REAIS E TRATADOSCOMO SE FOSSE REAL
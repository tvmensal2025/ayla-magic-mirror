## Diagnóstico do que aconteceu

Analisei o lead mais recente (`17fceeee-...`) e o problema não está mais só no passo da facial. O erro principal agora está no motor do Flow Builder antes da coleta da conta.

Linha do tempo relevante:

```text
14:54:12 OUT  Pergunta valor médio da conta
14:56:16 OUT  "Vou explicar como funciona, ok?"       <- avançou sozinho sem resposta do cliente
14:59:35 IN   "Como funciona o boleto?"              <- cliente ficou em dúvida
15:00:22 OUT  Explicação genérica da iGreen + pede conta
15:01:40 IN   [foto da conta]
15:02:45 OUT  "Vou explicar como funciona, ok?"       <- repetiu passo antigo depois da foto
15:03:20 OUT  "Deu para entender... cadastro?"       <- veio atrasado
15:03:36 IN   "Sim"
15:04:12 OUT  "Deu para entender... cadastro?"       <- repetiu de novo
15:04:24 IN   "Sim"
15:04:31 OUT  Pede conta novamente
```

## Causas raiz

1. **O fluxo avança por timeout/follow-up mesmo sem resposta do cliente**
   - O passo do valor (`3e7fb4cd...`) deveria esperar resposta, mas algum follow-up/fallback avançou para `como_funciona`/`fazenda_solar` sem o cliente responder.
   - Isso gerou mensagem fora de hora às `14:56:16`.

2. **Mensagem de dúvida no meio do fluxo não preserva o lugar correto**
   - Quando o cliente perguntou “Como funciona o boleto?”, o bot respondeu a FAQ, mas continuou preso/voltando para o passo de mídia (`80188e5f...`).
   - Depois que ele mandou a foto da conta, o sistema ainda retomou o fluxo antigo e reenviou `a71ba814`/`559b8f1b`.

3. **Imagem enviada em step conversacional não é tratada como conta imediatamente**
   - O cliente mandou a foto às `15:01:40`, mas o motor conversacional estava no passo `flow:80188e5f...` e não redirecionou a imagem para `aguardando_conta`/OCR.
   - Por isso a foto ficou registrada como inbound no fluxo antigo e o bot continuou mandando mensagens de explicação.

4. **A correção anterior de anti-repetição pegou só `dispatchStepFromFlow` do bot determinístico**
   - A repetição atual vem do `runConversationalFlow` (`supabase/functions/whapi-webhook/handlers/conversational/index.ts`), outro motor.
   - Então ainda falta anti-repetição e guarda de mídia nesse motor.

## Correção proposta

### 1. Tratar arquivo/imagem como conta quando o cliente ainda está antes do cadastro

No `runConversationalFlow`, antes de FAQ/classificador/fallback:

- Se receber arquivo/imagem/documento em qualquer step conversacional antes da coleta (`flow:*`, `welcome`, `qualificacao`, etc.) e ainda não houver conta processada:
  - retornar `conversation_step = aguardando_conta`
  - deixar o `whapi-webhook` reprocessar/encaminhar para o pipeline determinístico de OCR, ou acionar diretamente o texto curto de “conta recebida, analisando”.

Objetivo: foto enviada no meio da explicação vira conta imediatamente, não dispara mais áudio/texto antigo.

### 2. Anti-repetição também no motor conversacional

Adicionar uma guarda em `emitStep/goToStep`:

- Antes de enviar texto/mídia de um step do Flow Builder, consultar outbound recente do mesmo `conversation_step`.
- Se o mesmo step já foi enviado nos últimos 10 minutos, não reenviar a mesma mensagem/mídia.
- Avançar para o próximo passo esperado quando for uma confirmação positiva, sem repetir `559b8f1b`.

Objetivo: `a71ba814` e `559b8f1b` não podem sair duas vezes seguidas para o mesmo cliente.

### 3. Corrigir fallback de dúvida para voltar ao próximo passo útil

Quando houver QA/FAQ hit durante um passo do flow:

- Responder a dúvida.
- Se o cliente já informou valor ou mandou conta, não voltar para `como_funciona`.
- Manter ou avançar para o próximo estado útil:
  - com valor mas sem conta: pedir conta;
  - com foto/arquivo recebido: OCR da conta;
  - sem valor: voltar para pergunta de valor, não para vídeo/explicação.

Objetivo: dúvida não reinicia nem embaralha o fluxo.

### 4. Bloquear auto-advance silencioso de perguntas que exigem captura

Para steps com `captures` e `wait_for=reply`:

- Se não houve resposta nova do cliente com captura válida, não avançar por fallback automático para mídia/explicação.
- Repetir/reformular a pergunta, no máximo, sem pular etapa.

Objetivo: o bot não sai do “qual valor da conta?” sem o cliente responder.

### 5. Validar com o histórico real

Depois da implementação, validar no banco com os dois leads:

- `17fceeee-...`: confirmar onde repetiu e que a nova lógica bloquearia.
- `06a3ed56-...`: confirmar que o fallback pós-SIM continua funcionando.

## Arquivos envolvidos

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- possivelmente `supabase/functions/whapi-webhook/index.ts` se for necessário reencaminhar arquivo do motor flow para o pipeline OCR determinístico.

Sem mudança de UI e sem alteração de banco.
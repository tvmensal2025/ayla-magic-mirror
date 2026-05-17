## Diagnóstico do fluxo atual

O último lead analisado (`cf3d7ea4...`) mostra que o problema não é mais só a captura do valor. O fluxo ainda quebra em três pontos:

1. **Início ainda entra duplicado/confuso**
   - O lead começou no fluxo customizado, mas o passo inicial de nome ficou com `wait_for=none`.
   - Mesmo perguntando `Qual seu nome...`, o motor trata como passo sem espera e pode cascatear/avançar fora de hora.
   - O `self-intro` da primeira mensagem também é ignorado se o chat foi zerado manualmente (`chat_cleared_at`), então mensagens como “sou X” podem não pular o nome durante testes.

2. **Depois da confirmação da conta, o sistema volta para o início do fluxo**
   - Após `✅ SIM` em `confirmando_dados_conta`, o `bot-flow.ts` chama `findNextActiveFlowStep(...)` sem informar a posição atual.
   - Como a consulta pega o primeiro passo ativo do fluxo, ele retorna a posição 2 (`Nome do cliente`) em vez de continuar na posição 10 (`Cadastro/documento`).
   - Resultado visto no histórico: depois da conta confirmada, o bot perguntou nome de novo e depois voltou para o passo de valor da conta.

3. **O lead não chega ao final porque os passos de cadastro/documento/finalizar não estão sendo encadeados corretamente**
   - O fluxo customizado tem:
     - posição 9: `capture_conta`
     - posição 10: `capture_documento`
     - posição 11: `finalizar_cadastro`
   - Mas o pipeline do cadastro volta para o fluxo customizado sem saber “depois de qual posição” continuar.
   - Isso causa regressão para o começo e impede avançar até documento/finalização.

## Plano de correção

### 1. Corrigir configuração e interpretação dos passos iniciais

- Tratar passo com captura de `name` como passo que espera resposta, mesmo se estiver configurado como `wait_for=none`.
- No `resolveLandingStep`, continuar pulando pergunta de nome quando o nome já estiver em fonte confiável (`self_introduced`, `user_confirmed`, `ocr_*`, `manual`, `freeform_multi`).
- Ajustar a captura de primeira mensagem para funcionar também depois de reset manual, mas sem reaproveitar automaticamente o nome do perfil do WhatsApp.

### 2. Fazer o pós-conta continuar na posição correta do fluxo

- Alterar `findNextActiveFlowStep` para aceitar `afterPosition` e usar isso no bloco `confirmando_dados_conta`.
- Após confirmar a conta, buscar o próximo passo ativo **depois da posição do `capture_conta`**, não o primeiro passo do fluxo.
- Para este fluxo, isso deve levar para posição 10 (`capture_documento`) e não para posição 2 (`Nome do cliente`).

### 3. Criar mapeamento robusto entre cadastro legado e fluxo customizado

- Quando o sistema estiver no pipeline legado (`aguardando_conta`, `confirmando_dados_conta`, `aguardando_doc_auto`, `confirmando_dados_doc`, `finalizando`), guardar/descobrir qual passo customizado originou aquela etapa.
- Regras esperadas:
  - `capture_conta` concluído → próximo passo por posição depois dele.
  - `capture_documento` concluído → próximo passo por posição depois dele.
  - `finalizar_cadastro` → manter no pipeline final, sem voltar ao início.

### 4. Corrigir fallback de `finalizar_cadastro`

- O passo terminal não deve chamar `resolveTransition({ goto_special: "cadastro" })`, porque isso pode voltar para documento/conta.
- Se já estiver em `finalizar_cadastro`, deve seguir para `finalizando`/portal quando o lead confirmar, ou repetir só a chamada final quando faltar confirmação.

### 5. Sanear dados do fluxo ativo no banco

- Ajustar `wait_for` do passo `Nome do cliente` para `reply`.
- Garantir fallbacks em ordem real:
  - Nome → Boas-vindas
  - Boas-vindas → Valor
  - Valor → Como funciona
  - Como funciona → Quebra de objeção → Deu para entender
  - Deu para entender → Conta
  - Conta → Documento
  - Documento → Finalização
- Remover qualquer fallback que aponte de volta para passos já concluídos.

### 6. Validar com cenários reais e de teste

Validar estes caminhos antes de considerar resolvido:

- **Início com nome na primeira mensagem:** `Oi, sou Paula` deve salvar `Paula`, pular pergunta de nome e ir para boas-vindas/valor.
- **Resposta ao nome:** `Lucas` deve sobrescrever `whatsapp_profile` e avançar para valor sem nudge.
- **Conta confirmada:** depois de `✅ SIM`, não pode voltar para nome; deve ir para documento.
- **Documento confirmado:** deve avançar para finalização, não voltar para conta/valor.
- **Finalização:** deve chegar ao estado final esperado sem cair no início do fluxo.

## Arquivos/áreas a alterar

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
  - Guard de `wait_for` para steps de captura.
  - Ajuste de terminal `finalizar_cadastro`.

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
  - Corrigir `findNextActiveFlowStep` no pós-confirmação da conta.
  - Aplicar continuação por posição após conta/documento.

- Banco Supabase
  - Migration/data-fix para corrigir `wait_for` e fallbacks do fluxo ativo.

## Resultado esperado

O fluxo deixa de “reiniciar” no meio: captura nome no início, segue valor → vídeos → conta → documento → finalização, e depois da confirmação da conta/documento continua sempre para o próximo passo por posição, nunca para o primeiro passo do fluxo.
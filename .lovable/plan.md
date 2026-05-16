## Problema

O bot não está "pulando" o áudio do passo 1 por bug — ele está **respeitando** o `customer.conversation_step` salvo de sessões anteriores. Quando o lead Rafael Ferreira Dias mandou "Oi" às 14:44, seu `conversation_step` já estava em `flow:80188e5f` (Passo 3 — `como_funciona`), porque ele já tinha passado pelos passos 1 e 2 em sessões anteriores hoje. Por isso o bot **resumiu** a partir do passo 3 (mandou áudio + vídeo de `como_funciona` e `fazenda_solar`) e parou no Passo 6 ("Deu para entender?"). O áudio "Boas-vindas" do Passo 1 e a pergunta "Qual o valor médio…" do Passo 2 não foram reenviados.

Você quer que o fluxo **comece sempre do passo 1**, executando todos os passos em ordem.

## Solução

Adicionar uma regra de **restart por saudação** no engine conversacional: sempre que o classificador detectar `intent="saudacao"` (ou regex pegar `oi|olá|ola|bom dia|boa tarde|boa noite|opa|e aí`) e o lead estiver em **qualquer step que não seja o primeiro ativo do fluxo**, o bot reinicia em `firstActive` (Passo 1) e executa a cascade normal a partir dali — respeitando os `wait_for=reply` configurados (então ele vai parar no Passo 1 esperando resposta, depois Passo 2, etc., e só cascateará a partir do Passo 3 que tem `wait_for=none`).

Mantém o comportamento atual para qualquer outra intent (não-saudação) — assim leads no meio do funil continuam de onde pararam quando respondem perguntas reais.

### Detalhes técnicos

Arquivo: `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (perto da linha 620, logo após `classifyIntent` e antes do bloco `quer_cadastrar` / `quer_humano`).

Pseudo:

```text
if (cls.intent === "saudacao" || /\b(oi|ola|olá|bom dia|boa tarde|boa noite|opa|e aí|eai)\b/i.test(messageText)) {
  if (currentStep.id !== firstActive.id) {
    // força restart: reusa o branch de "unknown step" que já cascata a partir do firstActive
    log("[conversational] saudação detectada → restart no Passo 1 (era %s)", currentStep.step_key);
    stepKey = "__restart__";  // força a fallback path
    // OU melhor: replicar o bloco do "if (!currentStep)" diretamente aqui
  }
}
```

Reutiliza o bloco de restart já existente nas linhas 500–554 (que já sabe cascatear corretamente, parar em `wait_for=reply` e gravar `conversation_step` no passo certo). Vou extrair esse bloco para uma função `restartAtStep(firstActive)` e chamar nos dois lugares.

### Verificação

1. Resetar manualmente o `conversation_step` do Rafael (5511971254913) para `null` no DB.
2. Mandar "Oi" → deve receber só o áudio de Boas-vindas e parar (passo 1 tem `wait_for=reply`).
3. Mandar qualquer texto → deve receber pergunta do valor da conta (Passo 2).
4. Mandar "900" → deve cascatear Passo 3 (áudio + vídeo como_funciona) → Passo 4 (áudio + vídeo + texto) → Passo 6 ("Deu para entender?") e parar.
5. Mandar "Oi" de novo no meio do funil → deve **reiniciar no Passo 1** (comportamento novo).
6. Mandar "SIM" no Passo 6 → segue para Passo 11 (cadastro), sem reiniciar.

## Fora do escopo

- Não vou preencher conteúdo dos Passos 11/12/14 (você decidiu antes que prefere ajustar manualmente em `/admin/fluxos`).
- Não vou alterar a lógica de transições do Passo 6 → 11.

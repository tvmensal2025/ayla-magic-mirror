## Diagnóstico confirmado

O erro continua porque, após clicar em **✅ SIM** nos dados da conta, o webhook ainda encontrou como próximo passo customizado:

```text
[post-confirm-conta] next=passo_mp8yc0bp type=message reason=customflow
```

Esse `passo_mp8yc0bp` é o passo **Nome do cliente**. No banco, o lead ficou assim:

```text
conversation_step = 33be68c1-44b6-4de1-8a1c-aa3758c4cdfa
name = CLEUSA EUNICE MARTINS DA SILVA
name_source = user_confirmed
```

Ou seja: o nome já estava confirmado, mas o pós-conta voltou para o primeiro passo do fluxo.

## Causa provável

A correção anterior calcula a posição do `capture_conta`, mas se essa busca falhar ou se o deploy ainda usar uma versão anterior, `_captureContaPos` fica `0` e `findNextActiveFlowStep(...)` retorna o primeiro passo ativo: **Nome do cliente**.

Além disso, mesmo quando `findNextActiveFlowStep` retorna um passo anterior que já está preenchido, o bloco pós-conta ainda aceita esse resultado e envia a mensagem.

## Plano de correção

1. **Blindar o pós-confirmação da conta**
   - No bloco `confirmando_dados_conta`, se o sistema não conseguir localizar `capture_conta`, não deve voltar para posição 0.
   - Em vez disso, deve buscar diretamente o próximo passo do tipo `capture_documento` ou `finalizar_cadastro`.

2. **Impedir regressão para passos anteriores preenchidos**
   - Depois do `SIM` da conta, ignorar qualquer `nextCustom` com posição menor ou igual à posição real de `capture_conta`.
   - Ignorar explicitamente passos de nome/valor já preenchidos nesse contexto.

3. **Adicionar fallback seguro específico**
   - Se não achar próximo passo válido, manter o lead em `aguardando_doc_auto` e pedir documento, nunca nome.

4. **Corrigir dados do lead atual**
   - Atualizar o lead que ficou preso no passo de nome para `aguardando_doc_auto`, para ele poder continuar do documento.

5. **Validar nos logs e no banco**
   - Conferir que após `✅ SIM`, o próximo estado fica `aguardando_doc_auto` ou o UUID do passo `capture_documento`.
   - Confirmar que nenhuma resposta pós-conta envia novamente “Qual seu nome para eu adicionar aqui?”.
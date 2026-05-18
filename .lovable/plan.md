## Auditoria do fluxo: por que pulou de novo

Confirmei no staging que ele pulou novamente.

No teste do telefone `5511971254913`, aconteceu isto:

```text
02 -> 04
04 -> 07
```

Ou seja: depois da resposta `800`, o fluxo saiu do passo 4 e foi direto para o passo 7. O passo 5 foi emitido parcialmente como mídia, mas o passo 6, que é a pergunta `{{nome}}, posso estar explicando abaixo como funciona?`, não foi enviado nem aguardado.

## Problemas encontrados

### 1. Passo 4 está mandando para o passo 5, mas o motor continuou cascateando até o 7

Passo 4:

```text
4. Qual o valor da conta de luz
Captura: electricity_bill_value
Destino configurado: passo 5
```

Após o cliente responder `800`, o bot deveria ir para o passo 5 e parar/organizar a sequência.

Mas o motor tratou o passo 5 como `wait_for=none` e continuou automaticamente.

### 2. Passo 5 está inconsistente: transição vai para o 6, mas Plano B vai para o 7

Passo 5:

```text
5. Valor da conta
slot_key: como_funciona
wait_for: none
transição default -> passo 6
fallback goto -> passo 7
```

Isso é uma inconsistência crítica.

O editor mostra que o passo 5 deve ir para o 6, mas o motor de cascata prioriza `fallback.goto_step_id`, então ele segue para o 7 e ignora o 6.

Correção necessária:

```text
passo 5 fallback.goto_step_id = passo 6
```

### 3. Passo 6 é pergunta, mas está configurado como `wait_for=none`

Passo 6:

```text
6. Pergutando se pode estar explicando abaixo
Texto: {{nome}}, posso estar explicando abaixo como funciona?
wait_for: none
Captura: kind=text, name=resposta_texto, required=false
Transição afirmacao -> passo 7
Fallback goto -> passo 7
```

Regra do usuário: não pode pular.

Então esse passo precisa esperar resposta. Hoje ele está marcado como `wait_for=none`, o que permite cascata se a heurística falhar ou se outro caminho pular por fallback.

Correção necessária:

```text
passo 6 wait_for = reply
passo 6 captura enabled = true
passo 6 fallback = repeat ou goto para si/aguardar, não avançar automaticamente para 7
```

Para avançar para o passo 7, somente após resposta afirmativa do cliente.

### 4. Passo 7 também está inconsistente: transição aponta para passo apagado

Passo 7:

```text
7. Como funciona
fallback goto -> passo 9
transição default -> c495e1b0... (passo apagado)
```

Isso aparece como erro no fluxo. O passo 7 deveria levar para o próximo passo real.

Como não existe passo 8 ativo, hoje a sequência real está:

```text
7 -> 9
```

Mas você pediu explicitamente:

```text
7 -> 8 -> 9 -> 10
```

Então existem duas possibilidades:

- Se o passo 8 foi apagado sem querer: recriar/reativar o passo 8.
- Se não existe conteúdo para o passo 8: ajustar a numeração/ordem para não haver buraco.

### 5. Passo 9 ainda tem regra de negação apontando para passo apagado

Passo 9:

```text
9. Deu para entender?
afirmação -> passo 10
negação -> c495e1b0... (passo apagado)
fallback -> passo 10
```

Se o cliente responder “não entendi”, o bot aponta para um passo que não existe. Isso precisa ser corrigido antes de considerar o fluxo organizado.

### 6. Passo 10 está OK como destino de afirmação, mas precisa vir somente depois do 9

Passo 10:

```text
10. Conta de energia
Captura imagem/documento
Destino -> passo 11
```

Ele não deve ser alcançado antes do cliente responder o passo 9.

## Plano de correção

### A. Corrigir a cadeia dos passos 4, 5, 6 e 7

Aplicar estes ajustes nos dados do fluxo:

```text
4 -> 5
5 -> 6
6 -> 7 somente depois da resposta do cliente
7 -> 8/9 conforme passo 8 existir
8 -> 9
9 -> 10 somente depois da resposta do cliente
```

Ajustes concretos:

- Passo 5: alinhar `fallback.goto_step_id` com a transição default para apontar para o passo 6.
- Passo 6: alterar `wait_for` para `reply`.
- Passo 6: marcar captura como `enabled: true`.
- Passo 6: impedir fallback automático para o passo 7 sem resposta.
- Passo 7: remover transição default quebrada para passo apagado.
- Passo 9: corrigir regra `negacao` para um passo real.

### B. Tratar o buraco do passo 8

Hoje não há passo 8 ativo no fluxo consultado. Para cumprir sua regra `7 -> 8 -> 9 -> 10`, preciso corrigir isso de uma das formas:

1. Reativar/recriar o passo 8 se ele deveria existir.
2. Se não houver conteúdo para passo 8, reorganizar a ordem para a sequência ficar sem buraco.

### C. Reforçar o motor para nunca priorizar fallback quando existe transição default válida

No código do `whapi-webhook`, o `findCascadeNext` hoje olha primeiro para `fallback.goto_step_id`. Isso causou o pulo do passo 5 para o 7.

Correção técnica:

- Em cascata, se houver transição `default` com `goto_step_id` válido, ela deve ter prioridade sobre o fallback.
- Fallback só deve ser usado quando não houver transição válida.
- Passo com texto terminando em `?` deve parar a cascata e aguardar resposta, mesmo se estiver mal configurado.
- Passo com captura textual deve parar a cascata e aguardar resposta.

### D. Fazer auditoria final pós-correção

Depois de aplicar, vou verificar:

- Todos os destinos apontam para passos ativos.
- Não existe transição para passo apagado.
- Não existe fallback contradizendo transição default.
- Passos com pergunta não têm avanço automático.
- Passos 3 a 10 seguem a ordem exigida.
- Últimos passos de cadastro estão organizados e sem erro.

### E. Validar no staging

Executar um teste novo e confirmar no banco/logs:

```text
3 -> 4
4 -> 5
5 -> 6
6 aguarda resposta
6 -> 7 após resposta
7 -> 8/9 conforme ajuste
9 aguarda resposta
9 -> 10 após resposta
```

## Resultado esperado

O bot não deve mais pular o passo 5 nem o passo 6. Qualquer pergunta deve ser enviada e aguardar resposta antes de seguir para o próximo passo.
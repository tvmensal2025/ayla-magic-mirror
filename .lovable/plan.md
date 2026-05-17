## Correção correta do fluxo

Você está certo: eu tinha invertido a interpretação. A regra deve ser:

```text
Sem nome:  Passo 1 (Nome) → Passo 2 → Passo 3 → Passo 4...
Com nome:  pula Passo 1 → Passo 2 → Passo 3 → Passo 4...
```

Ou seja: **Boas Vindas não deve virar passo 1**. O passo 1 é o de nome, e ele é o único passo que pode ser pulado quando o cliente já começou informando o nome.

## O que está errado hoje

No banco deste fluxo, a ordem ficou assim:

```text
posição 2 = Boas Vindas
posição 3 = Nome do cliente
posição 4 = Valor da conta
...
```

Isso está errado para a regra que você explicou. A ordem correta deve voltar para:

```text
posição 1 = Nome do cliente
posição 2 = Boas Vindas
posição 3 = Valor da conta
posição 4 = Como funciona / conteúdo seguinte
posição 5 = Deu para entender?
posição 6 = Conta de energia
posição 7 = Cadastro
posição 8 = Confirmação
```

## Plano de implementação

1. **Reordenar os passos no banco**
   - Colocar `Nome do cliente` como primeiro passo real do fluxo.
   - Colocar `Boas Vindas` imediatamente depois.
   - Reindexar os demais passos em sequência limpa: 1, 2, 3, 4, 5, 6, 7, 8.

2. **Ajustar a lógica de pular passo**
   - Hoje a função `resolveLandingStep` não pula o passo de nome se ele tiver `slot_key` ou `message_text`.
   - Isso conflita com sua regra, porque o passo de nome tem texto e mesmo assim deve ser pulado quando `name_source` for confiável.
   - Vou ajustar para permitir pular **somente o passo que captura `name`**, mesmo se tiver texto/slot.
   - Para os outros campos, mantenho a proteção atual para não pular áudio/vídeo/textos importantes.

3. **Garantir avanço sempre por posição**
   - Quando o passo 1 for pulado, o próximo passo será o passo 2 por `position`, não por fallback antigo/invertido.
   - Isso evita cair no passo errado caso algum `fallback.goto_step_id` esteja desatualizado.

4. **Validar com dois cenários**
   - Lead sem nome: deve receber passo 1 e depois seguir para passo 2.
   - Lead com nome confiável: deve pular passo 1 e começar no passo 2.

## Resultado esperado

```text
Cliente manda: "Oi"
Sem nome salvo → pergunta nome primeiro.

Cliente manda: "Sou João"
Nome capturado → pula pergunta de nome → envia Boas Vindas → segue passo 3, 4, 5...
```

Vou mexer apenas nessa correção de ordem e na regra de skip do passo de nome.
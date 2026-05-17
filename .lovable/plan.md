## Diagnóstico dos últimos fluxos

O erro se repetiu por três causas principais:

1. **Captura de nome não sobrescreveu o perfil do WhatsApp**
   - O cliente respondeu `Lucas`, mas o customer continuou com `name = Sirlene Correa` e `name_source = whatsapp_profile`.
   - O bot então personalizou mensagens com o nome errado e não tratou `Lucas` como nome confiável.

2. **O nudge foi disparado mesmo depois de resposta válida**
   - Depois de `200 mas ou menos`, o valor foi salvo (`electricity_bill_value = 200`), mas o fluxo também enviou `Pode me responder, por favor?`.
   - Isso indica que, no mesmo turno, a captura salvou dados mas a decisão caiu em repetição/timeout em vez de avançar de forma limpa.

3. **A cascata 5→6→7→8 quebrou por timeout e ordem incorreta de persistência**
   - O log mostra: `cascade hop timeout em a71ba814... mantendo lead em 80188e5f...`.
   - A função enviou mídias pesadas, mas só tentava considerar o passo avançado depois do envio terminar. Quando o envio demorava, o lead ficava preso no passo anterior.
   - Além disso, o passo de posição 5 apontava por fallback para a posição 7, e a posição 7 apontava de volta para a 6. Isso cria ordem confusa e aumenta risco de loop/trava.

## Plano de correção

### 1. Tornar a captura de nome confiável

- Ajustar a captura em `conversational/index.ts` para que, quando o passo atual for pergunta de nome, uma resposta simples como `Lucas`:
  - sobrescreva `name` mesmo se já existir `name_source = whatsapp_profile`;
  - grave `name_source = self_introduced`;
  - atualize o objeto em memória antes de renderizar a próxima mensagem.
- Ampliar a regra de pular pergunta de nome para aceitar `freeform_multi` como fonte confiável também.
- No `whapi-webhook/index.ts`, garantir que a primeira/segunda inbound seja analisada antes do roteamento do fluxo, mas sem depender disso para o passo de nome funcionar.

### 2. Bloquear nudge quando houve captura válida

- No motor conversacional, se `captureUpdates` tiver algum dado válido (`name`, `electricity_bill_value`, `cpf`, telefone), nunca chamar `_smartRepeat` naquele turno.
- Se não houver transição explícita, avançar para:
  1. `fallback.goto_step_id`, se configurado;
  2. próximo passo ativo por `position`, como fallback.
- Reforçar `_smartRepeat` para só enviar reformulação se houver silêncio real, validando última inbound e última outbound. Se a inbound for mais recente que a última outbound, não manda nudge.

### 3. Corrigir a cascata para persistir antes de enviar mídia pesada

- Em `goToStep`, mudar a ordem da cascata:
  - persistir `customers.conversation_step = nextStep.id` e `last_step_advanced_at` **antes** de chamar `emitStep(nextStep)`;
  - só depois enviar texto/mídia.
- Se `emitStep` der timeout, manter o lead no passo já persistido, não no anterior. Assim a próxima mensagem continua do lugar correto.
- Remover o comportamento atual de “mantendo lead em cursor anterior” quando o próximo passo já começou a ser enviado.

### 4. Evitar timeout real da Edge Function durante mídia longa

- Aumentar o timeout interno por hop de cascata de 12s para um valor compatível com vídeos/áudios reais, mas com hard-limit seguro.
- Para cascatas com mídia pesada, limitar a quantidade de hops por chamada e deixar o próximo inbound/cron continuar sem duplicar.
- Não aguardar indefinidamente upload/status do Whapi; envio confirmado pela API já deve ser suficiente para avançar o estado.

### 5. Sanear ordem/fallback do fluxo ativo

- Corrigir no banco os fallbacks do fluxo ativo para seguir a sequência real por posição:
  - posição 5 → posição 6
  - posição 6 → posição 7
  - posição 7 → posição 8
  - posição 8 → posição 9/cadastro
- Isso elimina a ordem atual 5→7→6→8, que está contribuindo para o comportamento confuso.

### 6. Validação dos três cenários críticos

- Cenário A: primeira mensagem `Oi, sou Paula`.
  - Deve salvar `Paula`, pular pergunta de nome e seguir para boas-vindas.

- Cenário B: resposta ao nome `Lucas`.
  - Deve trocar `whatsapp_profile` por `Lucas/self_introduced` e usar Lucas nas próximas mensagens.

- Cenário C: valor `200 mas ou menos`.
  - Deve salvar 200, não enviar nudge, avançar para passo 5 e continuar 5→6→7→8 sem travar no passo 5.

## Arquivos a alterar

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/whapi-webhook/index.ts`
- Possível migration/data-fix para corrigir os `fallback.goto_step_id` dos passos ativos do fluxo.

## Resultado esperado

O fluxo passa a ter uma regra simples e robusta: **capturou dado válido, avança; começou a enviar o próximo passo, persiste o próximo passo antes; se mídia demorar, não volta para trás nem repete pergunta.**
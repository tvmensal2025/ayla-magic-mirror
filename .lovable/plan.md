## Diagnóstico principal

O problema não está sendo resolvido porque foram tratados sintomas separados, mas o fluxo tem uma combinação de falhas de configuração, tempo de execução, mídia e dedupe.

A evidência mais forte é esta:

- O lead envia `900`.
- O valor é salvo no banco em `electricity_bill_value`.
- Mesmo assim, o `conversation_step` continua no passo 2 (`flow:3e7fb4cd...`).

Isso prova que a captura funciona, mas a execução depois da captura não termina de forma confiável antes de salvar o próximo passo.

## Por que as correções anteriores não bastaram

### 1. O fluxo real ainda depende de auto-advance frágil

O passo 2 captura `electricity_bill_value`, mas não tem uma transição explícita `valor_brl` ou `informou_valor` apontando para o próximo passo.

O backend tenta compensar usando `fallback.goto_step_id`, mas isso vira remendo. Um fluxo confiável não deveria depender de adivinhação quando uma captura essencial acontece.

Correção correta: captura de valor precisa ter destino explícito.

### 2. Depois do valor, o bot entra numa cascata pesada de mídia

Depois do passo 2, o fluxo tenta enviar conteúdo dos passos seguintes:

- passo 3: vídeo + áudio no slot `como_funciona`
- passo 4: áudio longo + vídeo no slot `fazenda_solar`
- passo 5: texto perguntando se entendeu

Isso é muita coisa para uma Edge Function síncrona, principalmente com Whapi.

Nos logs já aparece timeout real:

```text
[whapi:sendMedia] json_url falhou (video via messages/video). Último erro: Signal timed out.
```

Ou seja: o webhook pode estar morrendo ou encerrando antes de persistir o próximo `conversation_step`.

### 3. O áudio `.webm` continua sendo gargalo

O código tenta enviar `.webm` de várias formas: URL, base64, alias OGG e multipart. Mesmo assim, Whapi pode recusar, demorar ou dar timeout.

Isso explica por que “às vezes envia, às vezes pula, às vezes trava”.

Solução definitiva: não depender de `.webm` no fluxo. Converter os áudios atuais para `.ogg` ou `.mp3` e impedir novo `.webm` no admin.

### 4. O dedupe de mídia está mascarando falhas

Hoje o controle de mídia marca a mídia como enviada antes de confirmar que o Whapi realmente aceitou.

Então acontece isto:

1. tenta enviar mídia;
2. grava no log como `sent`;
3. Whapi falha ou dá timeout;
4. no próximo teste, o sistema acha que já enviou e pula a mídia.

Isso causa comportamento imprevisível e dá a impressão de que o fluxo não obedece.

### 5. O passo “Deu para entender?” está com `wait_for=media`

Esse passo pergunta:

```text
Deu para entender como funciona agora?
Vamos fazer seu cadastro?
```

Mas está configurado como `wait_for = media`.

Isso está incoerente. O esperado é `wait_for = reply`, porque o cliente deve responder texto/áudio/botão, não necessariamente enviar mídia.

### 6. Existem passos ativos vazios no final

Há passos ativos sem texto, sem mídia e sem função clara. Eles devem ser desativados ou preenchidos, porque aumentam a chance de o motor terminar num passo sem resposta.

## O que precisa ser feito agora

### Etapa 1: corrigir o fluxo atual no banco

Para o fluxo ativo do Rafael:

- passo 1: captura nome e vai para passo 2;
- passo 2: captura valor e vai explicitamente para passo 3;
- passo 3: cascata para passo 4;
- passo 4: cascata para passo 5;
- passo 5: trocar `wait_for` para `reply`;
- passo 5: resposta afirmativa vai para cadastro/conta/documento, conforme sua estratégia;
- desativar passos vazios finais.

### Etapa 2: corrigir o motor do webhook

- Não deixar envio de mídia longa bloquear a gravação do próximo passo.
- Usar timeout curto por mídia.
- Remover espera baseada na duração real do áudio/vídeo dentro da Edge Function.
- Persistir o próximo `conversation_step` mesmo se mídia falhar.
- Seguir sempre o `fallback.goto_step_id` em cascata até um passo que espere resposta.

### Etapa 3: corrigir dedupe de mídia

- Separar `attempted`, `sent` e `failed`.
- Só bloquear reenvio quando a mídia realmente foi entregue.
- Permitir limpar tentativas antigas em reset/teste.

### Etapa 4: blindar o admin

No `/admin/fluxos`, mostrar/bloquear:

- captura sem transição explícita;
- passo ativo sem texto e sem mídia;
- `wait_for=media` em pergunta textual;
- fallback quebrado;
- mídia `.webm`;
- mídia longa demais para webhook.

### Etapa 5: validar com teste automatizado

Rodar um cenário real:

```text
oi -> nome -> 900 -> sim
```

E validar:

- nome salvo;
- valor salvo;
- passo avança após `900`;
- mídias configuradas são tentadas;
- textos configurados são enviados;
- passo final aguarda resposta correta;
- nada é inventado fora do `/admin/fluxos`.

## Conclusão

O motivo de não resolver é que o problema real não é uma linha específica. É arquitetura de fluxo:

```text
captura funciona
  -> entra em cascata com mídia pesada
  -> Whapi dá timeout ou falha
  -> dedupe marca como enviado mesmo falhando
  -> step não é salvo corretamente
  -> teste seguinte pula mídia ou fica preso
```

A correção precisa atacar banco, motor, mídia e admin juntos. Remendar só `fallback`, só `FlowAuditPanel` ou só envio de áudio não vai estabilizar.
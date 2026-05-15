## Conclusão direta

Sim: o fluxo profissional já foi criado no banco. O problema não é falta de plano nem falta de estrutura. O erro principal é que o WhatsApp ainda está executando o motor legado (`bot-flow.ts`) em vez de executar o motor dinâmico do `Fluxo da Camila` (`bot_flow_steps`).

Resultado: a UI mostra um fluxo perfeito, mas o lead recebe mensagens hardcoded antigas como `checkin_pos_video`, `qualificacao`, `aguardando_conta`.

## Auditoria realizada

Verifiquei quatro camadas:

1. Banco de dados do fluxo ativo
2. Mídias vinculadas aos passos
3. Runtime do webhook `whapi-webhook`
4. Conversa real do Lucas no WhatsApp

## Evidências encontradas

### 1. O fluxo ativo existe e está correto como conceito

Para o consultor `0c2711ad-4836-41e6-afba-edd94f698ae3`:

```text
bot_flows.id = 66a19db4-b061-4f3f-921f-c13e9fb6f730
name = Fluxo Padrão
is_active = true
strict_mode = true
consultant.conversational_flow_enabled = true
```

Passos encontrados:

```text
1  Boas Vindas e Nome        step_type=message            captura name
2  Qual o valor da conta     step_type=message            captura electricity_bill_value
3  Valor da conta            step_type=message
4  Como funciona             step_type=message            áudio + vídeo
6  Deu para entender?        step_type=message            SIM -> cadastro
11 Conta de energia          step_type=message
12 Cadastro                  step_type=capture_documento
13 Conta de luz              step_type=capture_conta
14 Confirmação               step_type=finalizar_cadastro
```

### 2. As mídias principais existem

```text
boas_vindas     -> áudio pessoal do Rafael, 7s
fazenda_solar   -> áudio Como funciona, 123s
fazenda_solar   -> vídeo Conexão Green, 60s
```

Isso confirma que a ideia da UI é válida: áudio de boas-vindas, coleta de nome, valor, explicação, entendimento e cadastro.

### 3. O runtime atual não está percorrendo esse fluxo

O `whapi-webhook/index.ts` só chama o motor dinâmico quando `conversation_step` começa com `flow:` ou parece UUID/`passo_`.

Mas os leads atuais estão assim:

```text
flow_prefixed = 0
legacy_conversational = 13
raw_uuid_steps = 0
```

Ou seja: nenhum lead do consultor está entrando no motor novo. Todos continuam em estados legados.

### 4. A conversa real prova isso

Conversa do Lucas:

```text
inbound:  Oi
outbound: texto de boas-vindas antigo via bot_flow_qa
outbound: Deu pra entender? Posso te explicar melhor se precisar
outbound: Lucas! Tudo bem?
inbound:  Tudo bem sim
outbound: Que bom, Lucas! Me diz uma coisa, quanto costuma vir sua conta de luz...
```

Essas mensagens não vêm do `bot_flow_steps` profissional. Elas vêm do motor legado.

## Causas raiz

### Causa 1 — Entrada inicial cai em `sys`, não em `flow`

Quando `conversation_step` está nulo ou `welcome`, `routeEngine()` retorna `sys`. Então o bot entra no `bot-flow.ts`, que tem textos e regras antigas.

Mesmo com `consultants.conversational_flow_enabled=true`, o primeiro contato não é forçado para o `flow:`.

### Causa 2 — Existe um motor dinâmico, mas ele está quase isolado

O arquivo `supabase/functions/whapi-webhook/handlers/conversational/index.ts` já carrega `bot_flow_steps`, captura campos, avalia transições e envia mídias.

Mas ele só roda quando o `conversation_step` já está em formato `flow:<step_id>`.

Como a primeira mensagem nunca grava `flow:<primeiro_passo>`, o motor novo não assume.

### Causa 3 — O motor legado ainda usa `bot_flow_qa` como abertura

O bloco `opening-flow` em `bot-flow.ts` usa `bot_flow_qa.is_opening=true`, não `bot_flow_steps.position=1`.

Por isso a mensagem enviada foi:

```text
Olá! Sou a Camila...
Me envia a foto da sua conta de luz...
```

Mas o passo 1 da UI é:

```text
Boas Vindas e Nome
áudio boas_vindas
captura name
```

São duas fontes de verdade brigando.

### Causa 4 — Variáveis do fluxo não são renderizadas por completo

O renderer atual só substitui:

```text
{{nome}}
{{representante}}
```

Mas seu fluxo também usa ou pode usar:

```text
{{valor_conta}}
{{telefone}}
{{cpf}}
```

Além disso há um passo com `{{ nome }}` com espaços, que hoje não é substituído. Isso pode aparecer para o cliente literalmente.

### Causa 5 — Destino `goto_special=cadastro` está mapeado para conta de luz, não para documento

No passo “Deu para entender?”, o fluxo tem:

```text
afirmacao -> goto_special=cadastro
```

Mas no motor dinâmico atual `goto_special=cadastro` envia para `aguardando_conta`.

No seu fluxo visual, após “Vamos fazer seu cadastro?” o esperado parece ser ir para documento/cadastro, não repetir conta.

Essa regra precisa ser alinhada com o desenho real.

## Riscos se não corrigir

1. O bot continuará parecendo alucinar, porque mistura UI nova com textos antigos.
2. O lead pode receber pergunta fora de ordem.
3. A IA/sales-agent ainda pode assumir em etapas onde o fluxo deveria ser estrito.
4. O passo com `{{ nome }}` pode sair quebrado.
5. O fluxo visual nunca será a fonte única de verdade.

## Correção que resolve de verdade

Não é criar outro plano enorme. É fazer uma integração cirúrgica: quando o consultor tem `conversational_flow_enabled=true` e fluxo ativo, o primeiro contato deve entrar no primeiro `bot_flow_steps` com prefixo `flow:`.

```text
lead manda Oi
  -> whapi-webhook vê consultor com fluxo ativo
  -> grava conversation_step = flow:<id_do_passo_1>
  -> executa runConversationalFlow
  -> envia mídia/texto do passo 1
  -> próxima resposta do lead continua no motor dinâmico
```

## Plano de implementação mínimo e seguro

### 1. Corrigir roteamento inicial

No `whapi-webhook/index.ts`, antes de escolher `sys` ou `flow`:

- Se o consultor tem `conversational_flow_enabled=true`
- E o lead não tem override `conversational_flow_enabled=false`
- E o step atual é `null`, `welcome`, `checkin_pos_video`, `qualificacao`, `menu_inicial` ou `pos_video`
- E existe `bot_flows.is_active=true`

Então rotear para `flow` e deixar `runConversationalFlow` iniciar no primeiro passo ativo.

### 2. Remover a abertura legada para consultores com fluxo ativo

No `bot-flow.ts`, o bloco `opening-flow` não deve rodar para o consultor que usa `Fluxo da Camila` ativo.

Ele só fica como fallback para consultores sem flow dinâmico.

### 3. Melhorar o renderer de variáveis

Atualizar `renderTemplate()` para aceitar:

```text
{{nome}} e {{ nome }}
{{representante}} e {{ representante }}
{{valor_conta}} e {{ valor_conta }}
{{telefone}} e {{ telefone }}
{{cpf}} e {{ cpf }}
```

### 4. Ajustar destino de `goto_special=cadastro`

Alinhar o significado de `cadastro` com seu fluxo profissional:

- Se existir step ativo `step_type='capture_documento'`, ir para esse step.
- Senão, cair no comportamento antigo `aguardando_conta`.

Assim o botão/regra “SIM, vamos cadastrar” segue o desenho do Flow Builder.

### 5. Travar IA fora do caminho principal

Para `strict_mode=true`, o motor não deve chamar fallback IA para escolher próximo passo se houver fallback determinístico (`repeat` ou `goto`).

A IA pode responder Q&A, mas não deve mudar o caminho principal do fluxo estrito.

### 6. Realinhar leads presos em estados legados

Para o consultor Rafael:

```text
checkin_pos_video / welcome / qualificacao / menu_inicial / pos_video
```

devem ser realinhados automaticamente para o flow na próxima mensagem, sem migration agressiva em massa.

### 7. Teste profissional antes de considerar pronto

Criar teste do webhook/engine cobrindo:

```text
Oi -> envia Passo 1
Lucas -> captura nome e envia Passo 2
350 -> captura valor e envia Passo 3
como funciona -> envia Passo 4 com mídia
sim -> segue para Cadastro/Documento conforme flow
foto documento -> entra no OCR de documento
foto conta -> entra no OCR de conta
finalização -> usa portal/OTP
```

## Resposta à sua pergunta

O plano anterior resolveria, mas era grande demais e repetia trabalho já feito. A correção real é menor: ligar o fluxo que já existe ao WhatsApp como fonte principal e impedir o motor antigo/IA de atropelar.

Depois disso o fluxo passa a seguir o que você criou na tela, e não mais mensagens hardcoded antigas.

## Resultado esperado após implementar

No próximo teste real, o Lucas deve ver:

```text
Oi
-> áudio Boas-vindas
-> texto do Passo 1, se houver
Lucas
-> pergunta do Passo 2: valor médio da conta
350
-> Passo 3/4 conforme fallback/regra configurada
```

Sem `Deu pra entender?` fora de hora, sem `checkin_pos_video` legado, sem IA inventando caminho.
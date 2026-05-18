## Objetivo

Quando o lead mandar uma saudação ("bom dia", "boa tarde", "boa noite", "oi", "olá"), o bot **responde a saudação no mesmo tom** ("Bom dia! …", "Boa tarde! …", "Boa noite! …") e **continua o fluxo exatamente onde estava** — sem resetar, sem repetir o passo, sem cair em fallback. Para qualquer outra mensagem, nada muda.

## Diagnóstico do que existe hoje

Em `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (linhas 1066–1145) há dois blocos de saudação:

1. **`isSaudacao && currentStep.id === firstActive.id`** — repete a pergunta do 1º passo.
2. **`isSaudacao && currentStep.id !== firstActive.id`** — **reseta para o Passo 1** e cascateia mídias de novo. É isso que está causando o "voltei pro começo" toda vez que o lead manda "Boa noite" no meio da conversa.

Ambos os blocos tratam saudação como evento que muda o fluxo. O usuário quer o oposto: saudação é apenas cortesia.

## Mudanças (somente `conversational/index.ts`)

### 1. Helper de saudação contextual

Adicionar função local `greetingPrefix(text: string): string` que detecta:

- `/bom dia/i` → `"Bom dia!"`
- `/boa tarde/i` → `"Boa tarde!"`
- `/boa noite/i` → `"Boa noite!"`
- `/\b(oi+|ol[áa]|opa|e a[íi]|eai|hello|hi)\b/i` → `"Oi!"`
- nenhum match → `""`

### 2. Remover o bloco de restart por saudação

Apagar as linhas 1103–1145 (o `if (isSaudacao && currentStep.id !== firstActive.id) { … restart … }`). Saudação no meio do fluxo **não reseta mais nada**.

### 3. Simplificar o bloco do firstActive

Substituir as linhas 1066–1102 por: **não tratar saudação de forma especial aqui**. Deixar o fluxo seguir o caminho normal (classificar intenção, executar passo, etc.). O prefixo será aplicado na saída.

### 4. Prefixar a saudação na resposta final

Em `_finalize`, antes de retornar o `reply`:

- Calcular `prefix = greetingPrefix(ctx.messageText || "")`.
- Se `prefix` e `r.reply` existem **e** `r.reply` ainda não começa com o mesmo prefixo, prepender: `r.reply = \`${prefix} ${r.reply}\``.
- Se `prefix` existe mas `r.reply` está vazio (turno sem texto, ex.: só mídia), enviar `prefix` sozinho como reply curto ("Boa noite! 👋") — assim o lead recebe resposta à saudação, e a mídia continua sendo enviada inline.

Isso cobre todos os caminhos (cadastro, valor conta, OCR, dúvidas, pitch club, etc.) sem precisar editar cada handler.

### 5. Limpeza

- Remover `saudacaoRegex` e `isSaudacao` (não usados mais).
- A intent `"saudacao"` continua classificada normalmente; só não dispara mais lógica de restart.

## Fora de escopo

- Não mexer em `state-machine.ts`, OCR, cadastro, painel admin, schema, ou `bot-flow.ts`.
- Não mudar comportamento de nenhum outro intent (`quer_cadastrar`, `quer_humano`, FAQ, etc.).
- Não mudar tom/conteúdo dos passos no painel.

## Validação mental

- Lead em `aguardando_valor_conta` manda "Boa noite, quanto eu economizo?" → bot responde "Boa noite! [resposta normal do FAQ ou pergunta do passo]" e **continua em `aguardando_valor_conta`**.
- Lead manda só "Bom dia" no firstActive → bot responde "Bom dia! [pergunta do passo 1]".
- Lead manda "Tem que pagar?" (sem saudação) → comportamento idêntico ao de hoje, sem prefixo.
- Lead manda "Boa tarde" durante OCR → bot responde "Boa tarde!" e a etapa de OCR segue intacta.

## Arquivos

```text
supabase/functions/whapi-webhook/handlers/conversational/index.ts
├─ + greetingPrefix(text)           helper local
├─ ~ _finalize                      prefixa reply com saudação contextual
├─ − bloco isSaudacao firstActive   removido (deixa seguir fluxo)
└─ − bloco isSaudacao restart       removido (sem reset)
```

Posso seguir?
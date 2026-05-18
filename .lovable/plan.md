## Diagnóstico (baseado em conversas reais — Simone fd51f071 e Geralda 3fdc7244)

Olhei o que aconteceu na vida real e o bot não está "reiniciando para boas‑vindas". O que está acontecendo é pior em termos de percepção: ele responde com a frase de "socorro" repetidas vezes.

Reproduzi 3 sintomas concretos:

1. **"Boa! Pra eu te ajudar do jeito certo, me confirma onde a gente parou? 🙏"** dispara quando o lead manda "Boa noite", "Tem que pagar", "Kkkkk" — qualquer coisa que o passo atual não saiba responder. É a frase de fallback do wrapper `_finalize` em `conversational/index.ts`. Hoje ela é a 1ª coisa que o lead lê depois de cumprimentar.

2. **"Boa! Me ajuda voltando aqui: {{nome}}, qual o valor médio da sua conta de luz?"** — mesma origem, mas com o template **sem renderizar variável** (`{{nome}}` aparece cru). Vi isso 2x no histórico da Simone. `_finalize` usa `_currentTurnVars` que não foi populado naquele turno.

3. **Loop "Vamos fazer seu cadastro?"** — a Simone perguntou "Mas eu moro em casa alugada" / "Como vai fica" e o bot respondeu 2x com "Boa! Me ajuda voltando aqui: Vamos fazer seu cadastro?" sem responder a dúvida. É o mesmo fallback, agora colado ao tail do passo. Da ótica do lead, parece "voltei pro começo".

## Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (somente)

## Mudanças propostas

### 1. `_finalize`: parar de mandar "Boa!" como muleta

Hoje, qualquer turno com reply vazio gera "Boa! …". Vou:

- Remover o prefixo "Boa! " das duas variantes. Trocar por reentrada neutra:
  - com tail: `"{tail}"` (só repete a pergunta atual, sem prefixo)
  - sem tail: `"Tô aqui 👀 — me conta um pouquinho mais pra eu te ajudar?"`
- Garantir que `_currentTurnVars` é populado com `{nome, representante, valor_conta, telefone, cpf}` **sempre** que `_setTurnStepQuestion` é chamado (hoje em vários pontos passa-se só a string da pergunta, deixando vars vazio → `{{nome}}` cru).
- Renderizar tail com `renderTemplate(tail, _currentTurnVars)` e fazer um **strip defensivo**: se ainda restar `{{...}}` depois do render, trocar por string vazia (não vaza placeholder pro cliente).

### 2. Saudação no 1º passo não pode cair no fallback

No bloco "Restart por saudação" (linha ~1042), hoje o restart só roda se `currentStep.id !== firstActive.id`. Quando o lead manda "Boa noite" e já está no 1º passo (welcome / firstActive), a saudação cai no caminho default e termina em `_finalize` vazio.

Solução: tratar saudação no 1º passo **sem reset** — apenas devolver a `question` atual do passo (renderizada). Exemplo: lead manda "Boa noite" e o bot responde diretamente "Boa noite! Qual o seu nome?" (ou a pergunta corrente do step), sem o "Boa! Pra eu te ajudar…".

### 3. Repetição da mesma reentrada

Adicionar guarda: se a última mensagem outbound do mesmo customer foi essa reentrada (mesmo `tail`) há menos de 60s, **não envia de novo** — devolve reply vazio e marca `__suppressed_reentry: true` no update. Evita o caso "Boa! Vamos fazer seu cadastro?" 2x seguidas.

## Fora de escopo

- Não mexer em `bot-flow.ts`, fluxo de OCR, schema do banco, painel admin, ou no engine de passos custom.
- Não mudar passos do fluxo no painel.
- Não tocar no roteador de troca de fluxo (PJ/Licenciada) — separado.

## Validação

- Reler trechos do `conversations` da Simone (fd51f071) e Geralda (3fdc7244) mentalmente com a nova lógica: nenhuma frase de "Boa! …" deve aparecer; "Boa noite" inicial deve ser respondido com a pergunta de captura de nome/valor, sem o socorro.
- Conferir que nenhum log novo de `[conversational] ⚠️ reply vazio` aparece nas próximas conversas.

## Detalhes técnicos (somente Edge Function)

```text
conversational/index.ts
├─ _setTurnStepQuestion(q, vars)   → garantir vars sempre populado nos call sites
├─ _finalize(stepKey, r)           → remover "Boa! "; strip {{...}} residual; suppress duplicado <60s
└─ bloco "Restart por saudação"    → branch nova: se já está em firstActive, devolve a question atual sem reset
```

Posso seguir com a implementação?
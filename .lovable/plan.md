
## Diagnóstico (com base na conversa real do Lucas)

Os passos NÃO estão sendo pulados por falta de mídia — todos têm áudio/vídeo configurados. O problema está na **lógica de transições do motor conversacional** (`supabase/functions/whapi-webhook/handlers/conversational/index.ts`, função `resolveTransition`).

### O que aconteceu de fato

Fluxo ativo (consultor 0c2711ad, fluxo 66a19db4):

```
pos 2  Nome do cliente            (texto: "Qual seu nome...")
pos 3  Boas Vindas                (slot boas_vindas → ÁUDIO)        transitions=[default → pos4]
pos 4  Qual o valor da conta      (texto)                            transitions=[]
pos 5  Valor da conta             (slot como_funciona → áudio+vídeo) transitions=[default → pos6]
pos 6  Como funciona              (slot fazenda_solar → áudio+vídeo+imagem) transitions=[default → pos8]
pos 7  Quebra de objeção          (slot passo_mpa3yr6a → áudio)      transitions=[]
pos 8  Deu para entender?         (texto)                            transitions=[]
```

Conversa real:
1. "Oi" → bot envia pos 2 (pergunta nome)
2. "Osvaldo" → bot envia **pos 4 direto** (pula pos 3 / áudio Boas Vindas)
3. Valor → pos 5 entra em cena, mídia como_funciona vai, depois transita para **pos 6** (pula texto de pos 5)
4. Pos 6 envia mídia fazenda_solar, depois **pula direto pra pos 8** (pula pos 7 / áudio Quebra de objeção)
5. Lead diz "Como faço para cadastrar?" → atalho `quer_cadastrar` → vai pra `aguardando_conta`

### Causa raiz

Em `resolveTransition` (linha 1466) e no resolver custom de `bot-flow.ts` (linha 1880+), quando o passo atual tem uma transição com `trigger_intent='default'` apontando pra outro passo, o engine **chama `goToStep(nextStep)` sem antes emitir o conteúdo do passo atual**.

`goToStep` só renderiza o passo de DESTINO. O passo de origem (que tem áudio configurado) nunca dispara `emitStep`, então a mídia configurada em `ai_media_library` (boas_vindas, como_funciona pos 5, passo_mpa3yr6a) fica órfã.

`default` foi pensado como "qualquer resposta avança", mas o consultor o usa como "depois de mostrar isto, vai pra ali". Hoje as duas semânticas colidem.

### Confirmação nos logs

`ai_slot_dispatch_log` do Lucas:
- `boas_vindas` — **0 envios** (pulou)
- `como_funciona` — 2 envios (saíram durante goto para pos 6, não na emissão de pos 5)
- `fazenda_solar` — 3 envios (idem, durante goto para pos 8)
- `passo_mpa3yr6a` (Quebra de objeção) — **0 envios** (pulou)

## Plano de correção

### 1. `supabase/functions/whapi-webhook/handlers/conversational/index.ts`

Em `resolveTransition`, antes de chamar `goToStep(nextStep)` para uma transição que veio como **`default`** (não como intent explícita do usuário), emitir o passo atual primeiro **se** ele tiver `slot_key` ou `message_text`. Implementação:

- Passar para `resolveTransition` uma flag `isDefaultTransition` (já dá pra detectar pelo `t.trigger_intent === 'default'`).
- Quando for default e `currentStep` tem conteúdo (slot ou texto) que ainda não saiu nos últimos 10min (o anti-rep do `emitStep` já cuida), chamar `await emitStep(currentStep, false)` ANTES de `goToStep(nextStep)`.
- Quando a transição veio de um trigger específico (`afirmacao`, `quer_cadastrar`, etc.), comportamento atual fica igual (não emite o passo atual — o usuário pediu pra pular).

### 2. `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

Mesma correção no `custom-step-resolver` (linhas 1880-1962). Quando segue `default → goto_step_id`, garantir que `dispatchStepFromFlow(stepRow.step_key)` rode antes de avançar — já roda hoje (linha 1926), mas a função `findNextActiveFlowStep(afterPosition)` ignora o `goto_step_id` da transição e pega o próximo por posição. Isso já está correto pra evitar saltos longos. Manter.

O ajuste necessário no `bot-flow.ts` é apenas garantir paridade: se a transição era `default` apontando para uma posição distante (> currentPosition+1), forçar avanço por posição (pos atual + 1) em vez de respeitar o `goto_step_id` distante, pra não pular passos intermediários (foi o que aconteceu na transição pos 6 → pos 8, pulando pos 7).

### 3. `supabase/functions/evolution-webhook/handlers/bot-flow.ts`

Espelhar exatamente as mesmas duas mudanças (mesmo arquivo, espelho do whapi).

### 4. Sem mudança de schema

Não precisa coluna nova nem migration. É apenas lógica de motor.

## Resultado esperado

Quando o lead responde "Osvaldo" no passo Nome:
- Bot emite áudio **Boas Vindas** (passo 3) ✓
- Bot emite texto **"Qual o valor da conta de luz"** (passo 4) ✓ — mesma mensagem, mas precedida do áudio

Quando o lead responde o valor:
- Bot emite áudio+vídeo **como_funciona** (passo 5)
- Bot emite texto+mídia **Como funciona** (passo 6)
- Bot emite áudio **Quebra de objeção** (passo 7) ✓ (hoje pula)
- Bot emite texto **Deu para entender?** (passo 8)

A semântica de "vai pra cadastro" via intent explícita (`quer_cadastrar`) continua funcionando — o atalho é desejado quando o lead pede explicitamente.

## Arquivos a modificar

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (resolveTransition + goToStep)
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (custom-step-resolver: avanço por position quando default)
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` (espelho)

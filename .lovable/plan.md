## Diagnóstico

Olhando o log real do último envio do Lucas (`manual-step-send`):

```
[manual-step-send] continueFlow step=passo_mp74xnmn ... final=finalizando
```

E o fluxo ativo do consultor (variant A) tem 10 passos em `position` 2..11:

```
#1  pos 2  passo_mp8yc0bp        message          (Boas-vindas / áudio)
#2  pos 3  6226f6f3-...           message
#3  pos 4  3e7fb4cd-...           message          "qual o valor médio…?"
#4  pos 5  80188e5f-...           message
#5  pos 6  passo_mpagqq3g         message
#6  pos 7  a71ba814-...           message          "É simples — vou te mandar…"
#7  pos 8  559b8f1b-...           message          "Vamos fazer seu cadastro?"
#8  pos 9  passo_mp70jl99         capture_conta
#9  pos 10 passo_mp74oztd         capture_documento
#10 pos 11 passo_mp74xnmn         finalizar_cadastro
```

Problemas reais que estão fazendo os passos saírem fora de ordem ou pularem:

1. **`buildContinuationPatch` (manual-step-send) tem `MAX_CHAIN = 6`** — com 10 passos no fluxo, o encadeamento estoura antes de chegar nas capturas. Some passos no meio são puramente informativos e deveriam ser despachados em sequência até esbarrar numa pergunta/capture.

2. **Quando o consultor clica em um passo final** (ex: `passo_mp74xnmn` = posição 11), o `gt(position, 11)` não acha nada e a função grava `conversation_step = "finalizando"`. Isso é correto pro último passo, mas se o consultor clicou achando que era o passo 1, ele perde o contexto.

3. **Heurística de parada na cadeia (`looksLikeQuestion`) é frouxa** — só olha se o texto termina com `?`. Passos com áudio + texto curto sem `?` (ex: "Boas-vindas") são tratados como informativo e a corrente avança, mesmo quando o consultor queria pausar pra cliente responder.

4. **No webhook (`whapi-webhook/handlers/bot-flow.ts` linhas 2256-2292)** a lógica de chain é diferente da do `manual-step-send`: avança automaticamente em `message` quando há `default` sem `trigger_phrases` e não termina em `?`. Resultado: as duas pontas (envio manual + resposta do cliente) podem decidir avançar a posições diferentes e o cliente recebe passos fora de ordem.

5. **`CaptureStepsGrid` numera os cards `#1..#10`** com base no índice do array, sem mostrar o `position` real (2..11). Isso confunde quem clica achando que clica no "passo 1" mas está mandando outro.

## Correções

1. **`supabase/functions/manual-step-send/index.ts` — `buildContinuationPatch`**
   - Subir `MAX_CHAIN` de 6 para 20 (cobre fluxos grandes sem perder a proteção).
   - Sempre seguir estritamente `bot_flow_steps.position` ascendente do `flow_id` atual.
   - Critérios de parada (na ordem):
     1. Próximo passo tem `step_type !== "message"` → manda o prompt do capture (igual hoje), grava `conversation_step` legado e para.
     2. Próximo passo tem `captures[].enabled === true` (inline) → manda, grava `conversation_step = next.id`, para.
     3. Texto do próximo termina em `?` → manda, para.
     4. `transitions` com `trigger_phrases` (pergunta com botões/intents) → manda, para.
   - Garantir que o `conversation_step` final gravado seja exatamente o ID/legado do último passo despachado — sem pular pro próximo antes do cliente responder.
   - Se o passo clicado é o ÚLTIMO ativo do fluxo (sem `next`), gravar `conversation_step = step.id` (não `"finalizando"`), exceto quando o próprio passo for `finalizar_cadastro` (aí sim, `finalizando`).

2. **`supabase/functions/whapi-webhook/handlers/bot-flow.ts` — resolver de passo custom**
   - Alinhar o `chain-emit` (linhas 2254-2292) aos MESMOS 4 critérios de parada acima, para que `manual-step-send` e `whapi-webhook` decidam igual.
   - Quando o cliente responder a um passo `message` com captura inline (ex: "Captura do nome"), processar o input ANTES de avançar (já existe, só validar que não pula).
   - Não trocar `conversation_step` para legado em passos `message` com captura inline — manter o `id` do passo até a captura ser efetivamente preenchida.

3. **`src/components/captacao/CaptureStepsGrid.tsx`**
   - Mostrar no card o `position` real do banco (ex: "Passo 2 · Boas-vindas") em vez de `#1..#10` baseado no índice. Tira a ambiguidade de quem está clicando.
   - Manter ordem por `position` ascendente.

## Não muda

- Edge `manual-step-send` continua aceitando `stepId` por `id`/`step_key`/`step_type` (fallback robusto já implementado).
- Regras de variante A/B/C, RLS, OCR, portal, takeover humano, name guard — tudo mantido.

## Arquivos

- `supabase/functions/manual-step-send/index.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `src/components/captacao/CaptureStepsGrid.tsx`

Sem migração de banco.
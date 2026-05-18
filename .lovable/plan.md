## Problema

O passo "Perguntando se pode explicar" (Camila pergunta "posso te explicar rapidinho?") está auto-avançando para o passo 7 sem esperar o cliente responder. O engine encadeia passos `message` que tenham uma transição `default` sem `trigger_phrases` — e esse passo tem exatamente isso, então ele dispara e avança imediatamente.

## Causa

Em `whapi-webhook/handlers/bot-flow.ts` (linhas 1937–1961) o resolver de fluxo custom faz um "chain" automático enquanto o próximo passo for `type=message` e tiver uma transição `default` sem frases. Como TODOS os passos da Camila têm `default→próximo`, o fluxo desliza inteiro sem parar nas perguntas.

## Passos que fazem PERGUNTA e precisam pausar

Analisando os 11 passos, dois pedem resposta do cliente e estão configurados como auto-avanço:

| Pos | Passo | Tipo de espera |
|---|---|---|
| 6 | **Perguntando se pode explicar** ("posso te explicar?") | Esperar qualquer resposta (texto/áudio) |
| 9 | **Deu para entender?** | Esperar resposta (sim/não) |

Os demais (3 Boas-vindas, 5 Reação ao valor, 7 Como funciona, 8 Quebra de objeção) são informativos e devem continuar encadeando.

## Solução

Migration `UPDATE bot_flow_steps` removendo a transição `default` bare dos passos 6 e 9. Mantém as transições com gatilho (afirmacao/negação) intactas. Sem alteração de código TS.

```text
Posição 6 (passo_mpagqq3g — Perguntando):
  ANTES:  [{afirmacao → 7}, {default → 7}]
  DEPOIS: [{afirmacao → 7}]              ← chain quebra, espera o cliente

Posição 9 (559b8f1b — Deu para entender):
  ANTES:  [{afirmacao → 10}, {negacao → 8}, {default → 10}]
  DEPOIS: [{afirmacao → 10}, {negacao → 8}]   ← chain quebra, espera o cliente
```

### Como o engine se comporta após o fix

1. Chain dispara passo 5 (Reação ao valor) → passo 6 (Perguntando) emite → como **não tem mais `default` bare**, `hasAutoAdvance=false` → chain quebra. `conversation_step` fica em passo 6.
2. Cliente responde (texto ou áudio transcrito). Resolver re-entra em passo 6 → `dispatchStepFromFlow` (anti-rep 10min bloqueia duplicata) → `findNextActiveFlowStep` por position → passo 7 → chain segue até passo 9.
3. Passo 9 emite → chain quebra novamente. Espera resposta.
4. Cliente responde → resolver avança por position até passo 10 (capture_conta).

## Arquivos afetados

- `supabase/migrations/<nova>.sql` — UPDATE de 2 linhas em `bot_flow_steps` para o flow `66a19db4-b061-4f3f-921f-c13e9fb6f730`.

Sem alteração em código TypeScript. Posso aplicar?

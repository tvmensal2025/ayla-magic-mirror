## Diagnóstico

Hoje o motor (`supabase/functions/whapi-webhook/handlers/bot-flow.ts`) tem **3 caminhos diferentes** para mensagem fora do esperado, e dois deles **cortam** o lead (pausam o bot e silenciam):


| Caminho                                                    | Linhas    | Comportamento atual                                                                                                                             | Problema                                                                                                 |
| ---------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **A. Midflow QA (steps `ask_*`/`editing_*` de cadastro)**  | 619‑706   | Se a pergunta NÃO casa com a FAQ → pausa o bot (`bot_paused=true`, motivo `duvida_fora_faq`) e devolve `reply:""` (silêncio total para o lead). | Lead fica sem resposta esperando humano que pode demorar. Em escala (100+ consultores) = leads perdidos. |
| **B. Off‑topic em `ask_/editing_/aguardando_(conta|doc)**` | 1801‑1846 | Se houver QA configurada → responde + reenvia prompt. Se NÃO houver → manda só o reentry seco.                                                  | OK, mas não usa IA quando a QA está vazia — o lead recebe só o prompt repetido.                          |
| **C. Fluxos custom (passos UUID/`flow:`)**                 | 1975‑2025 | Se a resposta não casa com nenhum `trigger_intent` e não há `default` → 2 tentativas e depois **handoff humano + pausa**.                       | Não tenta responder a pergunta nem reformular — pula direto para humano.                                 |


Resultado: com muitos leads simultâneos, qualquer pergunta fora do roteiro (“mas e se eu morar de aluguel?”, “qual o desconto exato?”, “já tenho energia solar”) cai em handoff silencioso ou loop de prompt repetido.

## Objetivo

Para QUALQUER mensagem inesperada, o bot deve:

1. **Responder a dúvida** (FAQ → IA com persona/knowledge base como fallback).
2. **Reconduzir ao passo atual** com o prompt de reentrada (“Voltando ao que eu te perguntei: …”).
3. **Nunca silenciar** o lead nem **pausar** sem antes esgotar tentativas reais.
4. Só pausar/escalar para humano após `N` reentradas seguidas sem progresso (e sempre com mensagem de cortesia, não silêncio).

## Mudanças

### 1. Unificar fallback em um único helper `respondAndReentry()`

Criar dentro de `bot-flow.ts` (ou em `handlers/conversational/`) uma função:

```ts
async function respondAndReentry({
  customer, step, messageText, remoteJid,
  reason, // 'midflow_qa_miss' | 'off_topic_collect' | 'custom_step_no_match'
}): Promise<{ reply: string; updates: any }>
```

Ela faz, em ordem:

1. Tenta `matchQA()` (FAQ do consultor) → se hit, usa.
2. Se miss, chama a **IA de vendas** (já existe em `handlers/conversational/` — `sales-ai` / `request_handoff`) com instrução fixa:
  > “Responda a dúvida do lead em 1‑2 frases curtas, no tom da Camila, SEM prometer nada fora do script. Depois devolva o lead ao passo atual repetindo a pergunta original.”
3. Anexa `getReentryPromptForStep(step, customer)`.
4. Incrementa `detour_count`. Só pausa+handoff quando `detour_count >= 5` (já existe) — e ainda assim manda uma **mensagem de cortesia** (“Vou chamar alguém do time pra te ajudar com essa, tá? Em instantes.”), nunca silêncio.

### 2. Substituir os 3 caminhos pelo helper

- **A (midflow‑qa miss, linhas 662‑695)**: trocar o bloco que pausa silenciosamente por `await respondAndReentry(..., reason: 'midflow_qa_miss')`.
- **B (off‑topic collect, 1834‑1843)**: quando não há QA, chamar `respondAndReentry` antes do reentry seco.
- **C (custom flow no‑match, 1985‑2025)**: antes de incrementar `custom_step_retries` ou escalar, chamar `respondAndReentry`. Só após 3 tentativas reais (não 2) com a IA também falhando → handoff com mensagem de cortesia.

### 3. Blindagem anti‑erro (não pode dar erro)

- Envolver `respondAndReentry` num `try/catch` que, em qualquer falha (IA fora do ar, FAQ quebrada), faz **fallback mínimo garantido**:
  ```
  "Boa pergunta! Vou te explicar melhor já já. Antes, me confirma só: <reentry>"
  ```
  Nunca lança exceção para o caller.
- Mesmo tratamento em `dispatchStepFromFlow` (envia mídias do passo): se MinIO/Whapi der erro em uma mídia, logar e seguir para a próxima — não abortar o passo.
- Adicionar timeout (8s) na chamada da IA para não travar o webhook.

### 4. Telemetria para acompanhar em escala

Adicionar uma linha em `bot_step_transitions` (ou tabela nova `bot_recovery_events`) a cada `respondAndReentry`, com:

- `customer_id`, `consultant_id`, `step`, `reason`, `source` (`faq`|`ai`|`fallback`), `detour_count`.

Expor um card simples no `/admin/saude-bot` (já existe a página) mostrando:

- “Recuperações automáticas hoje” / “Handoffs evitados” / Top 5 perguntas off‑script (para virarem FAQ).

### 5. Limites por consultor (proteção 100+ contas)

- Cache em memória do edge (`Map<consultor, count/min>`) para limitar chamadas da IA de fallback a, ex., 30/min por consultor — acima disso usa só FAQ + reentry. Evita estourar `LOVABLE_API_KEY` com lead spam.

## Detalhes técnicos

- A IA de vendas já está implementada (`handlers/conversational/`) e usa Lovable AI Gateway. Reaproveitar o mesmo client, só mudando o prompt do system message para o modo “responder + reconduzir”.
- `getReentryPromptForStep` já existe e cobre todos os steps de cadastro; para passos custom (`flow:<uuid>`), usar `stepRow.message_text` como reentry.
- `bot_handoff_alerts` continua sendo criado quando realmente esgota — só muda o gatilho (5 detours efetivos em vez de 1 miss).
- Sem migração de schema necessária se reusarmos `bot_step_transitions`. Se quisermos `bot_recovery_events`, é 1 migração simples (vai como passo opcional).

## Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (criar helper + substituir 3 trechos)
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (expor função `answerAndReentry` reaproveitando o client da IA)
- `src/pages/SaudeBot.tsx` (card de recuperações — opcional, pode ficar para depois)
- (opcional) Migração `bot_recovery_events`

## Critério de pronto

- Lead manda “mas e se eu morar de aluguel?” no meio do cadastro → recebe resposta curta da Camila + reentry, **sem pausa**.
- IA fora do ar → recebe fallback genérico + reentry, **sem erro**.
- Lead manda 5 perguntas off‑script seguidas → recebe mensagem de cortesia e handoff é criado (não silêncio).
- Nenhum caminho retorna `reply:""` sem antes ter enviado algo via `sendText`/`sendMedia`.  
quando voltar ao fluxo tem que analisar se for uma pergunta vai ter que repetir apenas o final, analise para consturir
-   

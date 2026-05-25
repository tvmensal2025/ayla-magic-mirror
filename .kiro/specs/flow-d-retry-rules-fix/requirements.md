# Requirements Document

## Introduction

O sistema iGreen tem 101 edge functions, 5 variantes de fluxo (A/B/C/D/E) e um pipeline de cadastro com 18 etapas no `evolution-webhook` e 17 no `whapi-webhook`. Quando o consultor configura um fluxo no `/admin/fluxos` (variante D especialmente), espera que **as regras configuradas no FluxoBuilder sejam respeitadas pelo bot**.

Análise estática validada via Python identificou **2 bugs reais** que fazem o lead travar quando uma regra `fallback.mode = "retry"` é configurada ou quando o OCR falha:

| Bug | Confirmação |
|-----|------------|
| Handlers conversational não implementam `fb.mode === "retry"` | 4 migrations configuram, 0/2 handlers tratam |
| Evolution `bot-flow.ts` não usa `retry_text` em OCR fail | Whapi tem `resolveOcrFallback`, Evolution não tem |

Estes bugs são **transversais a todos os 5 fluxos** (A/B/C/D/E), não exclusivos do Fluxo D — qualquer consultor que configurar `mode: "retry"` no editor visual cai no problema. O Fluxo D é o caso mais visível porque seu seed-padrão (`seed_flow_d`) já vem com `retry_text` configurado em `d_pedir_conta` e `d_pedir_documento`.

## Glossary

- **Engine `flow`**: motor conversacional dirigido por dados em `bot_flow_steps` (`runConversationalFlow`)
- **Engine `sys`**: motor determinístico de cadastro (`runBotFlow`) com pipeline OCR → portal → OTP
- **`fallback`**: objeto JSON em `bot_flow_steps.fallback` que define o que fazer quando nenhuma `transition` casa
- **`retry_text`**: mensagem amigável configurada para reenviar quando o lead manda algo fora do esperado
- **`max_retries`**: quantidade máxima de tentativas antes de escalar para humano
- **`then`**: ação após esgotar `max_retries` (`humano` | `next` | `repeat`)
- **`recordFlowDAlert`**: helper que cria registro em `bot_handoff_alerts` quando OCR falha em variant=D

## Requirements

### Requirement 1: Engine `flow` deve honrar `fallback.mode = "retry"` em ambos webhooks

**User Story:** Como consultor que configura fallback `retry` no FluxoBuilder, quero que o bot envie a mensagem amigável (`retry_text`) e escale para humano após `max_retries`, para que meu lead não veja a pergunta repetida em loop quando responde algo fora do esperado.

#### Acceptance Criteria

1. WHEN o lead manda mensagem que não casa com nenhuma `transition` AND o step tem `fallback.mode = "retry"` AND `custom_step_retries < max_retries` THEN o handler conversational SHALL enviar `fallback.retry_text` (ou texto do step se ausente) e incrementar `custom_step_retries`.

2. WHEN `custom_step_retries >= max_retries` AND `fallback.then = "humano"` THEN o handler SHALL pausar o bot (`bot_paused = true`, `bot_paused_reason = "{step_key}_retry_exhausted"`), zerar contadores e responder com template `aguardando_humano/avisado`.

3. WHEN `custom_step_retries >= max_retries` AND `fallback.then = "next"` THEN o handler SHALL avançar para o próximo step ativo por `position` e zerar contadores.

4. WHEN `custom_step_retries >= max_retries` AND `fallback.then = "repeat"` THEN o handler SHALL manter o step atual e enviar `retry_text` (sem escalar).

5. WHEN o lead responde corretamente (transition casa) THEN os contadores `custom_step_retries` e `custom_step_retries_step` SHALL ser zerados.

6. WHEN o `custom_step_retries_step` é diferente do step atual (lead avançou e voltou) THEN o contador SHALL ser resetado para 1 (não incrementado de valor antigo).

7. O comportamento SHALL ser idêntico em `evolution-webhook/handlers/conversational/index.ts` e `whapi-webhook/handlers/conversational/index.ts` — apenas o canal muda, regra é a mesma.

### Requirement 2: Evolution OCR fail deve enviar `retry_text` configurado no step

**User Story:** Como consultor de variante D, quando o OCR falha ao ler a conta de luz ou documento do lead, quero que o bot envie minha mensagem customizada de retry (configurada em `bot_flow_steps.fallback.retry_text`) em vez de um texto genérico hardcoded, para manter a personalidade do meu fluxo.

#### Acceptance Criteria

1. WHEN o OCR de conta falha (em `aguardando_conta` ou `processando_ocr_conta`) AND `customers.flow_variant = "D"` THEN `evolution-webhook/handlers/bot-flow.ts` SHALL buscar o step `capture_conta` ativo do fluxo do consultor e usar `fallback.retry_text` na resposta.

2. WHEN o OCR de documento falha (em `aguardando_doc_*`) AND `customers.flow_variant = "D"` THEN o handler SHALL buscar o step `capture_documento` ativo e usar `fallback.retry_text`.

3. WHEN `fallback.retry_text` está vazio ou ausente THEN o handler SHALL manter o texto hardcoded atual (compatibilidade reversa).

4. WHEN `ocr_conta_attempts >= fallback.max_retries` (default 2) AND `fallback.then = "humano"` THEN o handler SHALL escalar (pausar bot + handoff alert), igual ao comportamento do Whapi.

5. O handler `evolution-webhook/handlers/bot-flow.ts` SHALL importar/copiar o helper `resolveOcrFallback` que existe em `whapi-webhook/handlers/bot-flow.ts` (linhas 130-160) — **fonte única, comportamento idêntico**.

6. A mudança SHALL NOT afetar variantes A/B/C/E — para essas variantes o helper já retorna `{ retryText: defaultRetryText, escalate: false }` por padrão.

### Requirement 3: Verificação não-regressão para Whapi

**User Story:** Como mantenedor do sistema, quero garantia de que o fix do Evolution não quebra o Whapi nem altera comportamento já estável.

#### Acceptance Criteria

1. O arquivo `whapi-webhook/handlers/bot-flow.ts` SHALL NOT ser modificado.
2. O arquivo `whapi-webhook/handlers/conversational/index.ts` SHALL receber **apenas** o bloco `if (fb.mode === "retry")` adicionado **antes** do bloco existente `if (fb.mode === "ai_answer")`.
3. O arquivo `_shared/channels/whapi.ts` SHALL NOT ser modificado (capabilities continuam `supportsButtons: true`, `supportsList: true`).
4. Testes existentes em `_shared/channels/whapi_test.ts` SHALL continuar passando.
5. Testes existentes em `_shared/flow-engine/engine_test.ts` SHALL continuar passando.

### Requirement 4: Telemetria e observabilidade

**User Story:** Como super-admin, quero ver no log estruturado quando o handler entrou em retry-mode e quando escalou para humano, para diagnosticar fluxos com `max_retries` mal configurados.

#### Acceptance Criteria

1. WHEN o handler entra em `fb.mode === "retry"` THEN SHALL emitir `console.log` com formato `[conversational] retry-mode step={step_key} attempt={n}/{max} text="{retry_text_preview}"`.
2. WHEN escalada para humano acontece THEN SHALL inserir registro em `bot_handoff_alerts` com `reason = "{step_key}_retry_exhausted"` e `metadata = { step, retries, fallback }`.
3. WHEN retry counters são zerados (lead avançou) THEN SHALL emitir `console.log` `[conversational] retry-counters-reset step={step_key}`.
4. Os logs SHALL seguir o padrão `jsonLog` quando disponível, ou `console.log` no formato `[modulo] mensagem` (consistente com o resto do arquivo).

### Requirement 5: Cobertura completa dos 5 fluxos (A/B/C/D/E) sem regressão

**User Story:** Como sistema multi-tenant que serve consultores em 5 variantes diferentes, quero garantia de que o fix funcione para qualquer fluxo, não apenas o D.

#### Acceptance Criteria

1. Para fluxos A/B/C/E SEM `fb.mode = "retry"` configurado: comportamento atual (cai em `repeat`) SHALL ser preservado.
2. Para fluxos A/B/C/E COM `fb.mode = "retry"` configurado manualmente via UI: o novo handler SHALL ser ativado normalmente.
3. Para fluxo D (seed automático): `d_pedir_conta` e `d_pedir_documento` SHALL passar a usar retry_text configurado.
4. O OCR fail no Evolution SHALL escalonar para humano após 2 tentativas (default `max_retries=2`) em vez de ficar mudo até o cron `flow-d-stuck-watchdog` rodar.

### Requirement 6: Migration opcional para schema de contadores

**User Story:** Como o engine `flow` precisa persistir `custom_step_retries` e `custom_step_retries_step`, quero garantia de que esses campos existem em `customers`.

#### Acceptance Criteria

1. As colunas `customers.custom_step_retries` (int) e `customers.custom_step_retries_step` (text) SHALL existir antes do deploy do fix.
2. IF as colunas já existirem (verificável via `src/integrations/supabase/types.ts`) THEN nenhuma migration adicional é necessária.
3. IF as colunas não existirem THEN uma migration `ALTER TABLE customers ADD COLUMN IF NOT EXISTS ...` SHALL ser criada antes do deploy.

## Non-Goals

- **Não vamos**: alterar capabilities do Evolution (`supportsButtons` continua `true` com fallback automático interno)
- **Não vamos**: implementar botões interativos universais — Whapi mantém botões reais, Evolution mantém texto numerado via `sendButtons` fallback
- **Não vamos**: refatorar o engine v3 (`_shared/flow-engine/`) — o fix vive nos handlers legados para preservar contratos
- **Não vamos**: alterar `seed_flow_d` ou outras migrations existentes
- **Não vamos**: tocar no fluxo de OTP, portal worker ou validação facial — apenas no caminho de erro do OCR e nos retry-modes

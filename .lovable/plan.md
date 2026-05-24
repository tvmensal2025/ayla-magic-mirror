# Deploy do Simulador + Auditoria de Funções Faltantes

## Problema confirmado

O **Simulador de Fluxo** (`/admin/fluxos`) está retornando "Failed to send a request to the Edge Function" em todas as mensagens. Causa: as funções `flow-simulate-run` e `flow-simulate-reset` existem no código mas **nunca foram deployadas em produção** (zero logs).

## O que vou fazer

### Passo 1 — Deploy imediato das 2 funções quebradas (zero risco)

Deploy de:
- `flow-simulate-run`
- `flow-simulate-reset`

Por que é zero-risco: são ferramentas de QA isoladas. Não tocam em customer real, não enviam WhatsApp real, não mexem em CRM. Se quebrarem, o pior cenário é o simulador continuar como está agora (quebrado).

### Passo 2 — Auditoria de outras funções possivelmente não-deployadas

Vou rodar um script que testa por HTTP cada uma das 98 edge functions locais e identifica quais retornam 404 (não deployadas) vs outros status. Levanto a lista completa **sem deployar nada ainda**.

### Passo 3 — Apresentar lista pra você decidir

Vou te mostrar a lista classificada em 3 grupos:

- **Críticas** (cron jobs ou webhooks chamados pela produção) — precisam deploy urgente
- **Auxiliares** (chamadas só por admin UI) — deploy quando você quiser
- **Órfãs** (sem referência no código) — candidatas a deletar

Você decide o que deployar.

### Passo 4 — Validar simulador funcionando

Depois do Passo 1, eu mesmo testo o simulador via `curl_edge_functions` (envio "oi" → confiro resposta). Se OK, fechamos.

## O que NÃO vou fazer

- Não vou migrar nada pro `getAdminClient` agora (decisão tua de adiar)
- Não vou tocar em SQL, RLS ou migrations
- Não vou deployar funções críticas (cron jobs, webhooks) sem te avisar antes
- Não vou mexer em nenhum customer real

## Estimativa

5-10 min total. Resposta sua só é necessária no Passo 3 (se eu achar funções críticas faltando).

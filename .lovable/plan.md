## Problema reportado

1. Todo novo lead (Excel e WhatsApp espontâneo) deveria começar no **PASSO 1 — Nome do cliente** com o áudio de 10s e seguir 1→10 em ordem. Hoje isso não acontece.
2. A IA está respondendo no lugar do fluxo. A regra correta é: **IA só responde quando o cliente faz uma pergunta**; caso contrário, o bot segue o script do `/admin/fluxos`.

## Causas prováveis (a confirmar com 1 query e leitura de 2 trechos)

### A) Roteamento `sys` vs `flow` no `whapi-webhook/index.ts`
- Em `index.ts:632-678`, o engine só vira `"flow"` se:
  - `consultantData.conversational_flow_enabled === true` (consultor), e
  - `customer.conversational_flow_enabled !== false`, e
  - existe `bot_flows.is_active=true` para `superAdminConsultantId` (não para o `consultant_id` do customer).
- Hipótese 1: leads importados via Excel não recebem `conversational_flow_enabled=true` e o switch global do consultor controla, mas a query usa `superAdminConsultantId`, não o `customer.consultant_id`. Se o fluxo da Camila estiver salvo no consultor, mas a consulta procurar no super admin (ou vice-versa), o engine cai em `sys` e o lead nunca vê o Passo 1.
- Hipótese 2: `customerOverride` está `false` para alguns leads antigos (ou pra leads onde a flag default ficou em false), causando rebaixamento pra `welcome` legacy.

### B) `runConversationalFlow` em `handlers/conversational/index.ts`
- Linha 687: `stepKey = customer.conversation_step || "welcome"`. Para novo lead, vira `"welcome"` (que não existe no Fluxo da Camila) → cai no branch `!currentStep` (linha 887) que reinicia no `firstActive`. **Esse caminho deveria** disparar o áudio do Passo 1 — confirmar se o `cursor` realmente envia mídia (não só texto).
- Linha 1080-1146: `classifyIntent` + `answerFaqWithAI`. Se o classifier marcar como `tem_duvida` mensagens neutras ("oi", "boa tarde", "ok"), o `answerFaqWithAI` (Lovable AI) responde com texto livre e o lead nunca avança. Isso é o que o usuário está vendo como "IA respondendo".

### C) Excel import
- O fluxo de import precisa criar o customer com `customer_origin='lead_whatsapp'` e `conversational_flow_enabled=true` (ou null) para que o roteamento engate. Verificar se o import seta `conversational_flow_enabled=false`.

## Plano de correção

### Passo 1 — Confirmar diagnóstico (read-only, ~3 queries)
1. SQL: contar customers recentes do consultor com `conversational_flow_enabled` e `conversation_step` por origem (Excel vs WhatsApp). Identificar leads que entraram em step ≠ PASSO 1.
2. Logs do `whapi-webhook` filtrando `[router]` e `[conversational] entry` nas últimas 24h pra ver qual engine pegou e qual `stepKey` foi resolvido.
3. Conferir se o `superAdminConsultantId` usado no `index.ts:658` é mesmo o dono do fluxo da Camila (ou se devia ser `customer.consultant_id`).

### Passo 2 — Corrigir roteamento (1 arquivo)
`supabase/functions/whapi-webhook/index.ts`:
- Trocar a busca de `bot_flows` para usar `customer.consultant_id` (não o super admin), garantindo que CADA consultor com fluxo ativo veja seus leads forçados para `engine="flow"`.
- Adicionar log explícito `[router] decision={engine, consultant_id, has_active_flow, customerOverride, consultantFlag}` em todos os turnos.

### Passo 3 — Forçar Passo 1 + áudio para novo lead (1 arquivo)
`supabase/functions/whapi-webhook/handlers/conversational/index.ts`:
- Linha 687: se `conversation_step` está vazio OU vale `"welcome"` E existe fluxo ativo, setar `stepKey = firstActive.id` IMEDIATAMENTE (antes do dedupe e do classifier), pular `classifyIntent` e dispatch direto via `sendStepMedia` + texto do Passo 1.
- Garantir que esse caminho:
  - persista `customer.conversation_step = firstActive.id` no `_finalize`,
  - NÃO chame `answerFaqWithAI` (porque ainda não houve pergunta).

### Passo 4 — IA só responde em pergunta explícita
`handlers/conversational/index.ts:1080-1146`:
- Endurecer a guarda do AI FAQ: só chamar `answerFaqWithAI` quando:
  - `cls.intent === "tem_duvida"` E
  - `cls.confidence >= 0.75` E
  - a mensagem do lead contém marcador de pergunta (`?`, ou começa com "como/quanto/qual/quando/onde/por que/posso/dá pra"), E
  - o lead JÁ passou pelo Passo 1 (`conversation_step` já avançou pelo menos uma vez).
- Para saudações puras ("oi", "bom dia", etc.) e respostas curtas ("ok", "sim", "tá"), pular IA e seguir transição do passo.

### Passo 5 — Excel import (1 arquivo do importer)
- Garantir que o insert de leads via Excel use `conversational_flow_enabled=true` (ou deixe null) e `conversation_step=null`, para que o roteamento force `engine="flow"` no primeiro inbound.

### Passo 6 — Validação
1. SQL: criar lead de teste com `conversation_step=null`, simular inbound "oi" e conferir nos logs que o engine = `flow`, `currentStep = passo_1`, `sendStepMedia` disparou o áudio de 10s.
2. Simular mensagem neutra ("ok") em meio ao fluxo → confirma que NÃO chama IA e segue transição.
3. Simular pergunta explícita ("como funciona a fazenda solar?") → confirma que IA responde via `ai_knowledge_sections` e mantém o `conversation_step` atual.

## Detalhes técnicos
- Engines: `runConversationalFlow` (DB-driven Fluxo da Camila) vs `runBotFlow` (legacy hardcoded). O switch correto está no `index.ts`, mas a verificação de existência do flow ativo está consultando o consultor errado.
- `superAdminConsultantId` é o owner global; o fluxo da Camila pode estar registrado por `consultant_id` individual e por isso não casa.
- O áudio de 10s vem de `ai_media_library` filtrado por `slot_key` do `firstActive`. O caminho de "unknown step → restart" (linha 887-905) deve cobrir isso, mas vamos validar que `sendStepMedia` é chamado naquele branch.
- `classifyIntent` é o ponto onde mensagens neutras viram `tem_duvida` indevidamente; o reforço de guarda é puramente defensivo na chamada da IA, sem mexer no classifier.

## Não-objetivos
- Não vamos refatorar o classifier inteiro (`intent-classifier.ts`).
- Não vamos mexer no fluxo de cadastro (OCR/portal) — esse continua em `bot-flow.ts`.

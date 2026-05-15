## Diagnóstico (o que eu achei olhando seu banco e os logs)

Você não fez nada errado no editor. Tem **3 bugs no backend** que estão sabotando o fluxo:

### Bug 1 — Cliente travado em "fluxo antigo" mesmo após Limpar conversa
O número **5511989000650** tem na tabela `customers` o campo `conversational_flow_enabled = false` (gravado em algum momento antigo). Esse campo **não é resetado** pela função `reset_lead_conversation`. Resultado: por mais que você limpe a conversa, esse lead **nunca entra no novo motor** que lê o seu FluxoCamila — ele cai no `runBotFlow` antigo (hardcoded), que responde "*amigo, Pra eu te ajudar melhor, qual o valor médio…*". Por isso você vê SEMPRE essa mesma frase em vez do seu passo 1.

### Bug 2 — `step_key` nulo nos passos do editor → motor não acha o passo atual
Os passos que você criou no /admin/fluxos foram salvos com `step_key = NULL` (só os 4 últimos, "Conta de energia/Cadastro/Conta de luz/Confirmacao", têm `passo_xxx`). Quando o lead chega com um `conversation_step` antigo (ex.: "qualificacao"), o motor procura `step_key = "qualificacao"`, não acha, e **deveria** restartar no passo 1 — mas em alguns casos cai no fluxo legado e dispara a mensagem velha.

### Bug 3 — Passo 1 ("Boas Vindas e Nome.") com `message_text` NULL e sem texto de saudação
Ele tem só 1 áudio anexado (slot `boas_vindas`). Como `message_text` está vazio, o motor manda o áudio e **não manda nenhum texto** depois — fica parecendo que o fluxo "não iniciou".

---

## O que vou fazer

### 1) Migração SQL (corrige o coração do problema)

```sql
-- 1.a) reset_lead_conversation: também zerar o override individual,
--      garantindo que TODO lead resetado volte a respeitar o flag do consultor.
ALTER FUNCTION public.reset_lead_conversation … 
   -- adicionar:  conversational_flow_enabled = NULL

-- 1.b) Limpeza pontual: zerar override falso já existente em todos os leads
UPDATE customers
   SET conversational_flow_enabled = NULL
 WHERE conversational_flow_enabled = false
   AND consultant_id IN (SELECT id FROM consultants WHERE conversational_flow_enabled = true);

-- 1.c) Backfill: passos antigos sem step_key recebem o id como step_key
UPDATE bot_flow_steps
   SET step_key = id::text
 WHERE step_key IS NULL OR step_key = '';
```

### 2) `conversational/index.ts` — endurecer o restart

Quando `currentStep` não é encontrado, hoje ele tenta enviar `firstActive` mas se o `message_text` for vazio retorna `reply=""` e nada acontece. Vou:

- Sempre **persistir `conversation_step = firstActive.step_key`** (já faz) **e enviar a mídia configurada** mesmo sem texto;
- Se `message_text` estiver vazio E não houver mídia, mandar uma saudação curtinha padrão `"Oi {{nome}}! 👋"` para garantir que o lead sempre receba algo no passo 1;
- Logar `[conversational] flow loaded steps=N firstActive=…` para a gente nunca mais ficar no escuro.

### 3) `webhook/index.ts` — respeitar override **só quando explícito**

Hoje: `customerOverride === true || (customerOverride == null && consultantFlag)`.
Vou trocar para: `customerOverride !== false && consultantFlag` quando o consultor tem o flag ligado — o cliente só fica fora do conversational se for **explicitamente desabilitado por um admin agora** (não por um valor antigo gravado em produção).

### 4) Editor (`FluxoCamila.tsx`) — gerar `step_key` automático ao criar passo novo

Quando o usuário adiciona um passo, gerar `step_key = passo_<id curto>` no insert. Assim nunca mais nasce com `step_key` NULL.

---

## Resultado esperado

- Você manda "oi" em qualquer número limpo → o motor encontra seu fluxo, manda **o áudio do passo 1 ("Boas Vindas e Nome.")** + mensagem curta de saudação, salva `conversation_step` no passo 1 e segue normalmente para o passo 2 quando o lead responder.
- Os passos 11–14 (conta de luz / RG-CNH / e-mail / confirmar telefone) continuam exatamente como você montou.

## Arquivos afetados

- Migração SQL (1 nova)
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/whapi-webhook/index.ts` (5 linhas)
- `src/pages/FluxoCamila.tsx` (gerar step_key no create)

## O que NÃO muda

- Layout do editor /admin/fluxos
- Pipeline de OCR, portal, OTP no `bot-flow.ts`
- Mídias já anexadas

Posso aplicar?
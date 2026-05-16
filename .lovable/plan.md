## Problema

Você criou no `/admin/fluxos` um Passo 1 que pergunta o nome e um Passo 2 que não fala do nome. Hoje, mesmo quando o cliente já se apresentou antes (por exemplo "Oi, sou João" no welcome, ou nome veio do OCR da conta), o bot **ainda dispara o Passo 1** e pergunta o nome de novo. Você quer que ele pule direto para o Passo 2.

## Solução (aditiva, sem mexer no resto do fluxo)

Uma única função nova `resolveLandingStep(currentStep)` dentro de `supabase/functions/whapi-webhook/handlers/conversational/index.ts` que, ao chegar em qualquer passo, pergunta: *"este passo serve só para capturar um dado que eu já tenho?"*. Se sim → avança para o próximo passo ativo (`position` seguinte) e repete a checagem.

Aplica em 2 pontos do mesmo arquivo:
1. Logo depois do `const currentStep = ...` (linha 584) — cobre o caso normal de transição entre passos.
2. Dentro do bloco de saudação/restart (linha 732) — cobre o caso "cliente mandou 'oi' de novo e ia voltar pro Passo 1".

Mesma mudança replicada em `supabase/functions/evolution-webhook/handlers/conversational/index.ts` para paridade.

### Como o passo é identificado como "ask name" (sem precisar de flag nova)

Reaproveita exatamente o heurístico que já existe na linha 665-669:

```ts
const isAskNameStep = (s) =>
  /\bnome\b|\bchama\b/i.test(String(s.title || "")) ||
  /\bnome\b/i.test(String(s.slot_key || "")) ||
  (Array.isArray(s.captures) &&
   s.captures.some((c) => c?.field === "name" && c?.enabled !== false));
```

### Quando considera o nome "já capturado"

Reusa `TRUSTED_NAME_SOURCES` (`_shared/conversation-helpers.ts`): `ocr_conta`, `ocr_doc`, `user_confirmed`, `self_introduced`, `manual`. Se `customer.name` existe **e** `name_source` está nesse set → pula. Se o nome veio de origem desconhecida, **não pula** (mantém pergunta para confirmar, comportamento atual).

### Extensão natural (mesmo código serve)

A função `resolveLandingStep` aceita uma lista pequena de checagens `{field, isFilled}`:
- `name` → como acima
- `electricity_bill_value` → se `customer.electricity_bill_value > 0` e step tem `capture.field === "electricity_bill_value"`
- `cpf` → se `validarCPFDigitos(customer.cpf)` e step tem `capture.field === "cpf"`
- `phone_whatsapp` → se já preenchido e step tem `capture.field === "phone_whatsapp"`

Isso resolve o seu caso (nome) e já blinda os próximos passos do mesmo tipo, sem precisar voltar aqui.

### Fallback de segurança

- Loop com `visited Set` para nunca entrar em ciclo.
- Limite de 5 saltos por dispatch.
- Se não achar próximo passo ativo → não pula (fica no passo atual, comportamento atual).
- Se algo falhar (try/catch) → fica no passo atual.
- Log `[skip-step] from=passo_1 → to=passo_2 reason=name_already_captured`.

## Resultado esperado

| Situação | Hoje | Depois |
|---|---|---|
| Cliente diz "Oi, sou João" → cai no Passo 1 (pergunta nome) | Bot pergunta nome de novo | Bot pula pro Passo 2 |
| OCR da conta já pegou nome → cai no Passo 1 | Bot pergunta nome | Bot pula pro Passo 2 |
| Cliente chega sem nome → cai no Passo 1 | Bot pergunta nome | **Igual** (não pula) |
| Cliente chega com nome de origem `unknown` | Bot pergunta nome | **Igual** (não pula, mantém confirmação) |
| Passo 1 não é sobre nome (ex: vídeo de boas-vindas) | Roda normal | **Igual** (heurístico não casa, não pula) |

## O que NÃO muda

- Estrutura do fluxo no `/admin/fluxos`, `bot_flow_steps`, `transitions`, `captures`, `fallback`.
- Captura de nome (já implementada e funcionando).
- Lógica de OCR, mídia, templates, RLS, schemas.
- `shouldSkipAsk` legado do `bot-flow.ts` (continua existindo para os steps `ask_*` antigos).

## Arquivos editados

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — adiciona `resolveLandingStep` + 2 pontos de chamada.
- `supabase/functions/evolution-webhook/handlers/conversational/index.ts` — paridade.
- `supabase/functions/_shared/conversation-helpers.ts` — pequena export auxiliar `isStepAskField(step, field)` para reuso e testabilidade.

## Critério de sucesso

1. No seu fluxo atual, cliente que já tem nome cai direto no Passo 2.
2. Cliente sem nome continua sendo perguntado no Passo 1.
3. Logs `[skip-step]` aparecem na Edge Function quando pula.
4. Nenhum outro fluxo muda comportamento.

Se aprovar, faço primeiro no whapi-webhook, observamos 1-2 leads reais, depois replico no evolution-webhook.

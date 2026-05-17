## Diagnóstico

Cliente **Lucas (`62f8aae1`)**, fluxo do consultor com 11 passos. Reconstruí a conversa do banco e os 3 sintomas reportados têm causa raiz identificada:

### 1. "Email real foi bloqueado"
O cliente digitou `tvmensal153@gmail.com` (Gmail real). O sistema respondeu `❌ Esse e-mail não pode ser usado`.

Causa: `supabase/functions/_shared/validators.ts` linha 11 tem o regex `/^tvmensal/i` em `PLACEHOLDER_EMAIL_PATTERNS`. Esse padrão estava listado como "placeholder de teste", mas bloqueia qualquer endereço Gmail que comece com "tvmensal". Não é mais necessário (foi de uma importação antiga).

### 2. "Pulou passo 2 (sem áudio)"
Passo 2 do fluxo dele = `boas_vindas` (step_key `6226f6f3...`, position 3, slot `boas_vindas`). Esse passo:
- Não tem `message_text` (só áudio via slot).
- Tem `transitions: [{ trigger_intent: 'default', goto_step_id: '3e7fb4cd...' }]`.

No `bot-flow.ts`, o resolver custom, ao encontrar `transitions[]` com `default → goto_step_id`, **pula direto para o `goto_step_id` sem chamar `dispatchStepFromFlow(stepKey_atual)`**. Resultado: o áudio de boas-vindas (slot `boas_vindas`) nunca foi disparado. Confirmado em `ai_slot_dispatch_log`: zero envios para esse slot/customer.

### 3. "Pulou passo 6 e ficou travado até cliente digitar"
Olhando a sequência real de passos enviados: o resolver foi do passo 6 (`a71ba814` "Como funciona", position 6) direto para o passo 8 (`559b8f1b` "Deu para entender?", position 8) via transition default — **pulando a position 7** (`passo_mpa3yr6a` "Quebra de objeção").

E ficou travado porque o passo 8 (`Deu para entender?`) tem `transitions: []` e nenhum capture → não avança por position e fica esperando input livre do cliente.

A causa é a mesma do item 2: o resolver segue cegamente `goto_step_id` quando existe, ignorando se há passos intermediários por position. Quando o passo configurado pula um passo intermediário (intencional ou não), nenhum áudio/vídeo daquele passo é entregue, e se o destino não tem transição de saída, o bot trava.

---

## Plano de correção

### Mudança 1 — Liberar email `tvmensal*`
`supabase/functions/_shared/validators.ts`: remover o regex `/^tvmensal/i` de `PLACEHOLDER_EMAIL_PATTERNS`. Manter os demais (que são realmente placeholders: `@lead.igreen`, `@teste`, `teste@`, `noreply@`, `sem_email`, `@example`, `@exemplo`).

### Mudança 2 — Dispatch antes de seguir transição
`supabase/functions/whapi-webhook/handlers/bot-flow.ts`, no bloco do resolver custom que segue `transitions[].goto_step_id`:

1. Antes de mover `conversation_step` para o `goto_step_id`, chamar `await dispatchStepFromFlow(currentStepKey)` para o passo atual. Isso garante que o áudio/vídeo/texto do passo "router" (como `boas_vindas`) seja enviado.
2. O dedupe de 10 min já existente em `try_log_media_send` previne re-envio em loops.

### Mudança 3 — Não pular passos por position
Quando uma transição `default` aponta para um `goto_step_id` cuja `position` é **maior que `currentPosition + 1`**, em vez de saltar direto:
1. Disparar o passo atual (Mudança 2).
2. Avançar para o **próximo passo por position** (currentPosition + 1) — não para o `goto_step_id` distante.
3. O `goto_step_id` distante só é seguido quando a intent corresponde a um trigger explícito (não `default`), ou quando o próximo por position não existe.

Isso resolve passo 7 "Quebra de objeção" sendo pulado, e elimina o travamento no passo 8.

### Mudança 4 — Safety net para passos terminais sem capture
No final do switch principal, se o passo atual tem `transitions: []`, `captures: []` e não é um passo terminal explícito (`cadastro`, `finalizar`, etc.), avançar automaticamente por position após enviar a mídia. Isso impede travamentos futuros para passos mal configurados.

### Mudança 5 — Espelhar em `evolution-webhook`
Replicar Mudanças 1-4 em `supabase/functions/evolution-webhook/handlers/bot-flow.ts` e seu validator (mesmo módulo `_shared`, então a Mudança 1 já se aplica).

---

## Arquivos alterados

- `supabase/functions/_shared/validators.ts` — remove regex tvmensal
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — resolver custom: dispatch antes de pular, avanço por position quando transition pula passos, safety net no fim
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` — mesmas mudanças

Sem migrations. Sem mudança de schema.

---

## Validação após deploy

1. Resetar o lead `62f8aae1` via `reset_lead_conversation` e refazer o fluxo.
2. Verificar `ai_slot_dispatch_log` — deve aparecer envio do slot `boas_vindas`.
3. Verificar `conversations` — deve passar pelas positions 3 → 4 → 5 → 6 → 7 → 8 sequencialmente (sem pular 7).
4. Tentar email `tvmensal999@gmail.com` em `ask_email` — deve ser aceito.

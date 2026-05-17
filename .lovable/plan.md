
## Plano refinado — Captura inteligente de nome + correção do travamento 5→6

Foco em **dois bugs críticos** confirmados na sessão da Sirlene + 3 robustez essenciais. Sem mexer em schema novo, sem over-engineering.

---

### Bug 1: Nome não é capturado da primeira mensagem do lead

**Hoje:** lead manda "Oi me chamo Paula" como primeira msg → bot ignora e ainda pergunta "Qual seu nome?" no passo 2.

**Fix em `whapi-webhook/index.ts` (entrada do webhook, antes de chamar `handleBotFlow`):**

1. Quando `customer` é **criado agora** (linha ~286) ou está **em passo ≤ 2** (sem nome confiável ainda):
   - Rodar `extractMultiField(messageText)` na primeira inbound.
   - Se vier `multi.nome` válido (≥ 2 letras, não-genérico tipo "oi"/"bom dia"), salvar `customers.name = multi.nome`, `name_source = 'self_introduced'`.
   - **Marcar flag** `__name_already_captured = true` no contexto da request.

2. Em `bot-flow.ts`, no resolver custom (linha ~1911, ramo `step_type === "message"`):
   - Antes de dispatchar o passo atual, checar se ele é **passo de nome** (heurística: `slot_key` ∈ {`nome`, `passo_mp8yc0bp`} **ou** `message_text` casa `/qual.*(seu|o)\s+nome|como.*(se chama|posso te chamar)/i`).
   - Se for E `customer.name` já existe com `name_source` ∈ {`self_introduced`, `manual`, `ocr_*`, `freeform_multi`}: **pular o passo** (não dispatchar mídia/texto) e avançar direto para o próximo.

3. Quando o lead responde uma palavra no passo 2 (ramo current = passo de nome), aplicar `extractNome(messageText)` na resposta **e sobrescrever** `name` mesmo se `name_source = 'whatsapp_profile'`. A "Paula" digitada sempre vence o nome do perfil WhatsApp.

**Arquivos:** `whapi-webhook/index.ts`, `whapi-webhook/handlers/bot-flow.ts`, `_shared/multi-field-extractor.ts` (liberar override de `whatsapp_profile`).

---

### Bug 2: Engine não foi do passo 5 para o 6

**Hoje:** passo 5 (`80188e5f`, só mídia áudio+vídeo de 7MB) é dispatchado mas demora 50s+. Durante esse tempo, outro inbound (ou retry do webhook) reentra no resolver. `conversation_step` fica preso em `flow:80188e5f` mesmo depois do passo 6 já ter sido enviado.

**Causa real:** o `dispatchStepFromFlow` do `nextCustom` na linha 1934 é `await`-ado, mas o `customers.update({conversation_step: nextStepValue})` só acontece **depois** que `handleBotFlow` retorna (no nível do webhook). Se o webhook timeout ou outro evento chega antes, o update se perde.

**Fix em `bot-flow.ts` resolver custom (~linha 1933-1943):**

1. **Persistir `conversation_step` ANTES de dispatchar** o próximo passo:
   ```
   await supabase.from("customers")
     .update({ conversation_step: nextStepValue, last_step_advanced_at: new Date().toISOString() })
     .eq("id", customer.id);
   const ok = await dispatchStepFromFlow(nextCustom.step_key, _vars);
   ```
   Assim, mesmo se o dispatch demorar/falhar, o `conversation_step` já está correto e a próxima inbound não reprocessa o passo anterior.

2. **Encadear passos `message` consecutivos no mesmo turno**:
   Após dispatchar `nextCustom`, se o passo seguinte (`position + 1`) também for `message` puro (sem `capture_*`, sem `question`, sem `expects_reply`), continuar encadeando dentro do mesmo `handleBotFlow`:
   ```
   while (next?.step_type === "message") {
     await sleep(8000);          // pausa natural entre msgs
     await persistStep(next);
     await dispatchStepFromFlow(next.step_key, _vars);
     next = findNextActiveFlowStep(after: next.position);
   }
   ```
   Para quando achar `capture_*`, `question`, `finalizar_*` — aí espera o lead.
   Hard-limit: máximo 4 mensagens encadeadas por turno (proteção contra loop / timeout edge function).

3. **Anti-reentrada simples por timestamp** (sem tabela nova):
   - Usar coluna existente `customers.last_step_advanced_at` (criar via migration se não existir).
   - No início do resolver: se `last_step_advanced_at` < 8s atrás **E** o `conversation_step` mudou, retornar sem reprocessar (outro worker está no meio do dispatch).

**Arquivos:** `whapi-webhook/handlers/bot-flow.ts` + migration adicionando `customers.last_step_advanced_at TIMESTAMPTZ`.

---

### Robustez 3: Nudge "Pode me responder" só após silêncio real

**Hoje:** disparou 6s após o lead enviar "200 mas ou menos".

**Fix em `bot-flow.ts` no path do nudge:**
- Só disparar se `now() - max(conversations.created_at where direction=inbound) > 45s`.
- Não disparar 2× no mesmo `conversation_step` em 90s.

---

### Robustez 4: `extractValor` aceita "mas ou menos" (typo) e contexto de valor

**Em `_shared/captureExtractors.ts`:**
- Trocar `mais\s+ou\s+menos` por `ma[is]?\s+ou\s+menos` no `approxHint`.
- Quando o passo atual é claramente pergunta de valor (slot_key/texto matchando), aceitar **qualquer número 30–50000** na resposta como fallback.

---

### Robustez 5: Passo `message` sem `message_text` mas com mídia não é pulado

**Em `dispatchStepFromFlow` (~linha 734):**
- Confirmar que mesmo com `message_text` vazio/null, se houver registros em `bot_flow_step_media` para o `slot_key`, a mídia é enviada (passo 3 Boas Vindas tem só áudio+vídeo). Isto explica por que Boas Vindas foi pulado na sessão Sirlene.

---

## Arquivos alterados

- `supabase/functions/whapi-webhook/index.ts` — captura de nome na 1ª inbound
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — pular passo de nome se já capturado; persist-antes-de-dispatch; encadeamento de `message`; nudge com debounce; dispatch de mídia sem texto
- `supabase/functions/_shared/multi-field-extractor.ts` — override de `whatsapp_profile`
- `supabase/functions/_shared/captureExtractors.ts` — typo "mas"
- **Migration**: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_step_advanced_at TIMESTAMPTZ;`

## Validação

1. **Cenário Paula**: lead novo manda "Oi sou Paula, quero saber" → bot salva nome=Paula, **pula** passo "Qual seu nome", dispatcha Boas Vindas (áudio+vídeo), pergunta valor usando "Paula, qual o valor...".
2. **Cenário Sirlene (200 mas ou menos)**: responde "200 mas ou menos" → bot extrai 200, NÃO envia nudge, avança e encadeia passos 5→6→7→8 sem precisar de "ok" entre eles, para no passo 9 (capture_conta).
3. **Sem race**: reenviar mesmo webhook 3× em 2s não duplica mensagens nem regride `conversation_step`.
4. **Logs esperados**:
   - `[name-capture] self_introduced from first inbound: "Paula"`
   - `[custom-step-resolver] skip name-step (already captured)`
   - `[custom-step-resolver] chain message pos=5→6→7→8 stopped at capture_conta`

## Detalhes técnicos

- A persistência ANTES do dispatch (item 2.1) é a correção mais barata e elimina 90% das races sem precisar de tabela de lock.
- O encadeamento (item 2.2) resolve UX ruim de "lead precisa mandar ok entre cada msg informativa".
- Hard-limit de 4 mensagens por turno respeita o limite de 150s da edge function (4 × ~30s áudio/vídeo + 4 × 8s pausa = ~150s).

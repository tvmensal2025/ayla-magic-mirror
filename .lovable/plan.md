## Mapa do fluxo verificado (passo a passo)

| # | step_key | tipo | mídia | aguarda | hoje |
|---|---|---|---|---|---|
| 2 | passo_mp8yc0bp | message | – | none→cascata | ✅ envia "Qual seu nome..." |
| 3 | boas_vindas | message | áudio | reply | ✅ envia áudio (sem log de texto) |
| 4 | qual valor | message | – | reply, captura `electricity_bill_value` | ⚠️ envia texto mas **não loga em conversations** |
| 5 | como_funciona | message | áudio + vídeo | none→cascata | ❌ **NÃO envia** (perdido na cascata) |
| 6 | fazenda_solar | message | texto + áudio + vídeo | none→cascata | ⚠️ envia mídia mas perde o texto |
| 7 | "Deu para entender?" | message | – | reply | ⚠️ envia mas **não loga em conversations** |
| 8 | capture_conta | capture | – | – → entra em `aguardando_conta` legacy | ✅ |
| 9 | capture_documento | capture | – | – → `aguardando_doc_auto` legacy | ✅ |
| 10 | finalizar_cadastro | – | – | – → `ask_phone_confirm` → `ask_email` → `ask_cep` → `ask_number` → `ask_complement` → `ask_finalizar` → portal → OTP → link facial | ⚠️ corrigido na sprint anterior (Whapi), falta endurecer |

**Confirmado pelas conversas reais** dos leads `c52d49af` (Bruna) e `a40371e1` (Junior): os passos com `wait_for=none` em cascata são os que sumiram. O Whapi + portal worker já enviam OTP/link via fix anterior.

---

## Plano (mantido, cobre passo 2 → link facial)

### A. Logar todo envio em `conversations` (fim do "passo sumiu")
**A1.** `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- Em `sendStepMedia` (linha ~438), após `ctx.sender.sendText` bem-sucedido, inserir em `conversations` com `message_type='text'` e `conversation_step=step.step_key`.
- Em `emitStep` (linha ~990) idem para o `sendText` do branch cascade.
- Quando `sendText` lançar, gravar `message_type='text_failed'` com a mensagem do erro em `message_text` (prefixo `[failed] ...`).

### B. Garantir entrega antes de avançar (resolve pos 5 perdido)
**B1.** Em `sendStepMedia` (linha ~481): retry de 2 tentativas com 1500ms de pausa entre elas. Se ambas falharem, retornar `mediaSent: null` e abortar a cascade do passo.
**B2.** Em `emitStep` (linha ~957): se `sendStepMedia` devolver `mediaSent===null`, NÃO cascatear — devolver `replyText=""`, `inlineSent=false`, e o `goToStep` quebra o loop, mantendo `conversation_step` no passo atual para re-tentar no próximo evento.

### C. Cap de cascade + heartbeat (resolve timeout do edge)
**C1.** Em `goToStep` (linha ~1043): reduzir `guard` de 6 para 3 + envelopar cada hop em `Promise.race` com timeout de 12s. Se estourar, retornar com o que já foi emitido e `conversation_step = último passo bem-sucedido`. O resto vira drip no próximo turno do lead.
**C2.** Unificar cascade do restart (linha ~709-716) com `findCascadeNext` (linha ~1035) numa função única `findNextCascadeStep(cur)` que considera: (1) `fallback.goto`, (2) `transitions[].goto_step_id` default, (3) próximo por `position`. Aplicar nos dois lugares.

### D. Pergunta do cliente não quebra o funil (resolve "Como funciona?" caindo em legacy)
**D1.** `trySendConfiguredQa` em `bot-flow.ts`: após responder QA, **preservar** o `conversation_step` atual em vez de forçar `qualificacao`/`aguardando_conta` (linhas 975, 1057, 1072). Logar `[qa-detour]`.
**D2.** Em `processMessage` (`conversational/index.ts` ~linha 730): se `currentStep.wait_for==='reply'` e classifier diz `intent=outro`, **chamar QA + re-emitir a pergunta curta do passo** (sem mídia), mantendo o `conversation_step`.

### E. resolveLandingStep não pula passos com mídia
**E1.** Linha 769-776: só re-resolver landing step se o `currentStep` pergunta EXATAMENTE o campo capturado (não em qualquer captura).
**E2.** Em `resolveLandingStep` (linha 634): NÃO pular passo cujo `slot_key` tem mídia ativa em `ai_media_library` — boas_vindas e como_funciona precisam tocar mesmo que o nome/valor já tenha sido capturado em outro turno.

### F. Validação no `/admin/fluxos` (preventivo)
**F1.** `src/pages/FluxoCamila.tsx` (ou `FlowBuilder.tsx`): badge vermelho no passo quando tem `slot_key` sem nenhum `ai_media_library` ativo daquele slot E sem `message_text`. Hoje esses passos são fantasmas.
**F2.** Usar a função SQL `lint_bot_flow_consistency` (já existe) para mostrar contador no header.

### G. Telemetria por hop (fim do "pulou passo X")
**G1.** Em cada cascade hop do `goToStep`, inserir em `bot_step_transitions` com `intent='cascade'`. Hoje só o passo final fica logado, então parece pulo.

### H. Endurecer fim do fluxo (pos 10 → OTP → link facial)
**H1.** `worker-portal/playwright-automation.mjs`:
- Após enviar OTP via Whapi (já feito), agendar **um retry automático em 60s** se `customers.status` continuar `awaiting_otp` sem `otp_code`.
- Após enviar link facial, marcar `customers.facial_link_sent_at`. Se for `null` 30s depois e o link existe, re-enviar uma vez.
**H2.** `supabase/functions/whapi-webhook/index.ts` — interceptor de OTP (criado na sprint anterior): adicionar fallback que aceita códigos colados com espaços/traços (`1-2-3-4-5-6`, `12 34 56`).

---

## Arquivos tocados (resumo)

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (A1, B1, B2, C1, C2, E1, E2, G1)
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (D1, D2)
- `supabase/functions/whapi-webhook/index.ts` (H2)
- `worker-portal/playwright-automation.mjs` (H1)
- `src/pages/FluxoCamila.tsx` ou equivalente (F1, F2)

## Validação ponta-a-ponta

1. `reset_lead_conversation` nos 2 leads de teste.
2. Mandar "Oi" no Whapi e seguir todo o funil:
   - Pos 2 (nome) → pos 3 (áudio boas_vindas) → pos 4 (texto valor) → pos 5 (áudio+vídeo como_funciona) → pos 6 (texto+áudio+vídeo fazenda_solar) → pos 7 (texto deu pra entender) → pos 8 (foto da conta) → OCR → confirmar conta → pos 9 (documento) → confirmar doc → telefone → email → CEP → número → complemento → finalizar → portal → OTP → link facial.
3. Conferir no banco:
   - `conversations`: existe outbound para CADA passo emitido (texto + mídia)
   - `ai_slot_dispatch_log`: existe entrada para `boas_vindas`, `como_funciona`, `fazenda_solar`
   - `bot_step_transitions`: cadeia completa sem pular position
   - `customers.otp_code` preenchido e `customers.link_facial` enviado pelo Whapi

## Riscos

- A1 aumenta inserts em `conversations` (~50% a mais). Aceitável.
- B1 atrasa resposta em até 3s em caso de Whapi instável. Preferível a pular passo.
- C1 (guard=3) faz cascadas longas virarem drip. Como o lead sempre responde entre passos, na prática não muda UX.
- D1/D2 mudança comportamental — validar com lead real que perguntas off-topic não desviam o passo.
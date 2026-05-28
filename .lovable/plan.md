# Correção de 3 bugs no fluxo D de captação

Análise dos logs do lead `5511971254913` (customer `f3d7a37b-b6a0-4214-93ea-04bd2cf71c1b`). DB confirma: `name=JUDITE PEREIRA`, `bill_holder_name=JUDITE PEREIRA`, `doc_holder_name=PAULO ROBERTO FIGUEIREDO`, `name_mismatch_flag=true`.

## Bug 1 — Conta e documento NÃO podem ser pedidos juntos (processos separados)

**O que aconteceu (logs):**
```
13:35:23  inbound  ✅ SIM (confirmando_dados_conta)
13:35:27  outbound d_resultado (simulação)
13:35:31  outbound d_pedir_documento     ← pediu doc na mesma rajada
```

**Regra correta (definida pelo usuário):**
1. Cliente confirma conta → bot envia **APENAS a simulação** (d_resultado) + botão **"✅ Quero me cadastrar"**.
2. Bot PARA e aguarda. Conta e doc são processos INDIVIDUAIS — nunca encadear.
3. Só quando o cliente clicar "Quero me cadastrar" é que o bot pede o documento (capture_documento).

**Implementação:**
Em `supabase/functions/whapi-webhook/handlers/bot-flow.ts`, bloco `post-confirm-conta` (~3488–3617):
- Quando o próximo passo for `capture_documento`/`capture_doc`, despachar os `message` intermediários (d_resultado) e **parar** — NÃO chamar `dispatchStepFromFlow` do `capture_documento`.
- No lugar, enviar `sendOptions` com o texto da simulação ou um CTA final, com botão único `{ id: "btn_quero_cadastrar", title: "✅ Quero me cadastrar" }`.
- Setar `conversation_step = "ask_quero_cadastrar"` (novo estado).

Novo handler `case "ask_quero_cadastrar":` que ao receber clique do botão (ou texto afirmativo) finalmente despacha `capture_documento` e seta `conversation_step = "aguardando_doc_auto"`. Qualquer outra resposta cai em IA/dúvidas.

Espelhar em `supabase/functions/evolution-webhook/handlers/bot-flow.ts`.

## Bug 2 — Card OCR do doc mostra nome da conta (JUDITE) em vez do RG/CNH (PAULO)

**Causa:**
`src/components/captacao/OcrReviewCard.tsx` define `DOC_FIELDS = [{ key: "name", ... }]`. Mas `customer.name` está travado em "JUDITE PEREIRA" desde o OCR da conta (`name_source=user_confirmed`). O nome real do documento foi corretamente extraído para `doc_holder_name = "PAULO ROBERTO FIGUEIREDO"`, mas o card lê `name`.

**Correção:**
- Em `OcrReviewCard.tsx`, trocar `DOC_FIELDS[0]` para `{ key: "doc_holder_name", label: "Nome (documento)" }`.
- Ao editar inline e salvar, persistir em `doc_holder_name` (não em `name`).
- Mesma correção em `CaptureDataConfirmCard.tsx` quando `kind === "doc"`.
- O fluxo `confirmar_titularidade` já existe (mem://features/ocr-name-consistency) e dispara quando `name_mismatch_flag=true` — só precisa receber o nome correto na tela.

## Bug 3 — Telefone perguntado 2 vezes

**Logs:**
```
13:38:43  inbound  ✅ Sim, é meu (ask_phone_confirm)
13:38:48  outbound "Confirma seu telefone de contato?..."  ← DUPLICADO
[custom-step-resolver] button→capture: re-emitido step=d_confirmar_telefone
```

**Causa:**
Lead clicou `sim_phone` no `ask_phone_confirm` (legacy). O legacy salvou o telefone e avançou. Em paralelo, o resolver **button→capture** (bot-flow.ts ~2560–2608) viu que o próximo passo custom é `confirm_phone` (`d_confirmar_telefone`) e RE-EMITIU o prompt. O legacy não setou `last_custom_prompt_at`, então o anti-dup não silenciou.

**Correção:**
- No handler `ask_phone_confirm` (~4393–4461), ao confirmar SIM ou EDITAR, setar `updates.last_custom_prompt_at = new Date().toISOString()`.
- No resolver button→capture (~2565–2603), pular o re-emit quando `legacyStep === "ask_phone_confirm" && stype === "confirm_phone"` (legacy já cumpriu o papel do custom).

## Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts`
- `src/components/captacao/OcrReviewCard.tsx`
- `src/components/captacao/CaptureDataConfirmCard.tsx`

Sem migração de DB — colunas `doc_holder_name`, `bill_holder_name`, `name_mismatch_flag`, `last_custom_prompt_at` já existem. Atualizo `mem://features/ocr-review-flow` documentando a separação conta↔doc.

## Validação

Replay com o número 11971254913 (botão "Zerar" + envio de conta + envio de RG diferente):
1. Após SIM da conta → recebe SÓ a simulação + botão "Quero me cadastrar", SEM pedido de doc.
2. Após clicar "Quero me cadastrar" → bot pede o documento.
3. Card OCR do doc mostra "PAULO ROBERTO FIGUEIREDO".
4. Após "Sim, é meu telefone" → bot vai direto para o e-mail, sem repetir a pergunta.

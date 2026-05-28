---
name: Separate Bill and Document Steps
description: Conta e documento são processos individuais — após confirmar conta envia só simulação + CTA "Quero me cadastrar"; doc só dispara no clique
type: feature
---

REGRA: Conta e documento NÃO podem ser pedidos juntos. São processos individuais.

Fluxo correto após o cliente confirmar dados da conta:
1. Bot envia a simulação (passos `message` da chain post-confirm-conta).
2. Bot envia CTA único com botão `btn_quero_cadastrar` → "✅ Quero me cadastrar".
3. `conversation_step = "ask_quero_cadastrar"`. Bot PARA.
4. Quando o cliente clica/confirma → dispatch do `capture_documento` e `conversation_step = "aguardando_doc_auto"`.

Implementado em `whapi-webhook/handlers/bot-flow.ts` e `evolution-webhook/handlers/bot-flow.ts`:
- Bloco `post-confirm-conta`: quando `nextCustom.step_type` é `capture_documento`/`capture_doc`, NÃO dispatcha — envia CTA e seta `ask_quero_cadastrar`.
- Novo `case "ask_quero_cadastrar"` busca o passo `capture_documento` do fluxo ativo (variant) e dispatcha só ao confirmar.

Bug relacionado corrigido (resolver button→capture): quando o lead clica `sim_phone`/`editar_phone` em `confirm_phone`, o resolver NÃO deve re-emitir o prompt — o botão é uma resposta, não navegação. Checa também `last_custom_prompt_at < 10 min` como anti-dup.

Cards de revisão OCR (`OcrReviewCard.tsx`, `CaptureDataConfirmCard.tsx`): `DOC_FIELDS` agora usa `doc_holder_name` (extraído do RG/CNH), não `name` (que pode estar travado com o nome da conta de energia em casos de titularidade diferente).

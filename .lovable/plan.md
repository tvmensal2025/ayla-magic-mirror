# Diagnóstico — lead BRUNO (5511971254913)

Analisei os 20+ últimos eventos da `conversations` desse cliente (fluxo `D`, consultor Rodrigo) e cruzei com o código de `whapi-webhook/handlers/bot-flow.ts` e a config do passo no banco. Três bugs reais, todos reproduzíveis nos logs:

## Bug 1 — Ordem de mídia do "Como funciona" não é respeitada

**Configurado em `consultants.flow_step_media_order["d_como_funciona"]`:** `[text, audio, image, video]`
**Realmente enviado** (timestamps `14:37:24 → 14:37:58 → 14:38:00`): `audio → video → text` (image nem aparece).

Causa em `bot-flow.ts` linhas 1221-1233: o "FIX 2026-05-28" força o item `text` para a ÚLTIMA posição sempre que o passo tem `_buttons`, ignorando a ordem do consultor. Como `d_como_funciona` tem 3 botões, o `text` vai pro fim.
(O image desaparece porque o passo provavelmente não tem mídia de imagem cadastrada — não é bug, mas vamos validar.)

## Bug 2 — CTA duplicado depois da simulação

Logs `14:39:17` (resultado da simulação com seus próprios botões "Cadastrar agora / Tenho dúvidas / Falar com Rafael") + `14:39:19` (CTA extra "Pra continuar seu cadastro… ✅ Quero me cadastrar"). Repetiu no segundo ciclo às `14:44:08`.

Causa: a flag `__last_chain_had_buttons` (linhas 3551-3563) só é setada no branch CHAIN amplo (`else if` da linha 3504). Mas o passo `d_pedir_conta` tem `success_goto_step_id → d_resultado`, então o código entra no branch **success-goto** (linhas 3468-3503) que NUNCA seta a flag → o bloco de linha 3607 vê `false` → manda o CTA duplicado.

## Bug 3 — Clicar "✅ Quero me cadastrar" volta a pedir a conta de luz

Logs `14:44:17` (inbound "✅ Quero me cadastrar") → `14:44:23` (outbound *"Perfeito! Pra eu já garantir seu desconto, me manda uma foto ou PDF da sua última conta de luz 📸"*). Esse texto **não existe no fluxo D**; está apenas na migration legacy `20260515013320` (step `checkin_pos_video`). E o `customers.conversation_step` ficou em `aguardando_conta` — ou seja, em vez de entrar no handler `ask_quero_cadastrar` e despachar `d_pedir_documento`, o router caiu no fluxo legacy padrão.

Hipótese (a confirmar lendo o caminho de entrada do webhook): no momento em que o lead clica no botão, o `conversation_step` persistido foi sobrescrito por outro turno (re-OCR / persistência intermediária da chain) e voltou para algo que o router não mapeia como `ask_quero_cadastrar`, então cai no fallback de "aguardando conta de luz" do motor legacy.

---

# Plano

## 1. Respeitar 100% a ordem de mídia mesmo com botões
Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` e o gêmeo em `evolution-webhook/handlers/bot-flow.ts`.

- Remover o reorder forçado (linhas 1227-1233).
- Em vez disso: deixar a ordem configurada intacta. Anexar os botões ao **último item** real (texto OU mídia). Se o último item for mídia, enviar os botões como uma mensagem curta logo depois (1 só "👇" + buttons), preservando a ordem do consultor. Isso já é o que faz o bloco de garantia 1321-1340 — manter ele como único responsável.
- Validar com SQL que o passo realmente tem (ou não) `image_url`/`video_url` cadastrados para a config `[text, audio, image, video]` fazer sentido.

## 2. Cobrir success_goto na detecção `__last_chain_had_buttons`
Mesmos arquivos. No branch `_hasExplicitSuccessGoto` (linhas 3468-3503), depois do `dispatchStepFromFlow(nextCustom.step_key)`, ler `nextCustom.captures` (ou re-selecionar com `captures` no select da linha 3489) e setar `(updates as any).__last_chain_had_buttons = true` quando houver `_buttons` populados. Assim o bloco 3607 pula o CTA duplicado tanto no caminho CHAIN quanto no success-goto.

## 3. Garantir que o clique do CTA cai em `ask_quero_cadastrar`
- Reler o início do `runConversationalFlow` para entender por que `conversation_step=ask_quero_cadastrar` não é honrado quando o botão `btn_quero_cadastrar` chega.
- Suspeitas a investigar nessa ordem: (a) persistência do `conversation_step=ask_quero_cadastrar` no insert do CTA (linhas 3615-3623) — confirmar que `updates` é realmente aplicado ao customer no mesmo turno; (b) router de botões tratando `button.title` ("✅ Quero me cadastrar") em vez do `id` (`btn_quero_cadastrar`) e caindo num resolver legacy; (c) o cron `flow-d-health` ou outro background sobrescrevendo o step (vimos `flow_d_stuck` no log do `flow-d-health-cron` justo nesse consultor às 15:00).
- Aplicar a correção no caminho identificado. Como blindagem, no handler `ask_quero_cadastrar` (linhas 4780-4828), aceitar também o título literal e qualquer `step` ≠ ask_quero_cadastrar mas com `last_custom_prompt_step='ask_quero_cadastrar'` recente (< 30 min) para roteamento defensivo.

## 4. Validação
- Limpar lead (`Zerar` 11971254913), refazer fluxo "Como funciona" → confirmar ordem text→audio→video (image só se houver mídia configurada).
- Mandar conta de luz → confirmar OCR → verificar que chega APENAS `d_resultado` com seus 3 botões (sem CTA extra).
- Clicar em "Cadastrar agora" → bot deve enviar `d_pedir_documento` (RG/CNH), nunca pedir a conta de novo.

Sem migrations. Sem mudança de UI. Só edge functions (`whapi-webhook` + `evolution-webhook`).

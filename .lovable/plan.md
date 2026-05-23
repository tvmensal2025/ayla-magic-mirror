## Objetivo

Criar **Fluxo D** com botões reais do Whapi, reaproveitando as mídias já cadastradas no Fluxo A (consultor 0c2711ad — Camila/Rafael), e deixar D como **único variant ativo**. Inclui editor de botões no `/admin/fluxos` e suporte a `sendButtons` no dispatcher.

---

## 1) Editor de botões no Flow Builder (`/admin/fluxos`)

`src/pages/FluxoCamila.tsx` — abaixo de "Mensagem de texto", novo card **"Botões de resposta rápida (Whapi)"**, visível apenas para `step_type = message`:

- Checkbox "Usar botões"
- Lista (máx 3): `[título ≤20 chars]` + `[id estável]` + 🗑
- Botão "+ Adicionar botão"
- Hint: "O `id` precisa bater com uma `trigger_phrase` no bloco 'Para onde ir depois'."

Persistir em `bot_flow_steps.captures` como `{ field: "_buttons", enabled: true, value: [{id,title}] }` — `captures` já é `jsonb`, sem migration de schema.

## 2) Dispatcher passa a enviar botões

`supabase/functions/whapi-webhook/handlers/bot-flow.ts` → `dispatchStepFromFlow`:

- Selecionar também `captures` no `bot_flow_steps`.
- Quando o item `text` for o **último** e houver `_buttons`, trocar `sendText` por `sendButtons(jid, text, buttons)` (helper já existe em `_shared/whapi-api.ts`, com fallback automático para texto numerado em Evolution).
- `matchTransition` já casa `buttonId` ↔ `trigger_phrases` (em `flow-router.ts`) — basta o `id` do botão estar como `trigger_phrase` da transition.

## 3) Variável `{economia_range}` (8% a 20%)

`supabase/functions/_shared/render-vars.ts`: adicionar `economia_range = "R$ <floor(valor*0.08)> a R$ <ceil(valor*0.20)>"`. Disponível em todos os passos do flow.

## 4) Seed do Fluxo D (RPC + chamada via UI)

RPC `seed_flow_d(_consultant_id uuid)` (migration):

1. `DELETE FROM bot_flows WHERE consultant_id=_consultant_id AND variant='D';`
2. `INSERT bot_flows (variant='D', name='Fluxo Whapi (botões)', is_active=true)`.
3. Insere os steps abaixo. **Reaproveita `slot_key**` dos passos do Fluxo A para herdar as mídias (áudio/vídeo do `como_funciona` e fotos do `passo_mp74oztd` de documento) — não duplica mídia no MinIO.
4. `UPDATE consultants SET active_variants='{D}' WHERE id=_consultant_id;` → D fica único no round-robin.

Botão "Criar/Recriar Fluxo D com botões" no card "Fluxos ativos" chama essa RPC.

### Steps do Fluxo D


| Pos | step_key            | step_type              | slot_key                                                                        | message_text                                                                                                                                                                                                              | _buttons                                                                                              | transitions                                                                             |
| --- | ------------------- | ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `d_welcome`         | message                | —                                                                               | "Olá, seja muito bem-vindo(a) 😊\n\nSou a assistente virtual do {{representante}} e vou te ajudar a verificar se sua conta de luz tem perfil para economia.\n\nEscolha uma opção:"                                        | `simular / Quero simular`, `como / Como funciona`, `humano / Falar com {{representante}}`             | `simular`→passo 2, `como`→passo 3, `humano`→passo 7                                     |
| 2   | `d_pedir_conta`     | **capture_conta**      | —                                                                               | "Perfeito! Me envia uma foto da sua conta de luz que já calculo a economia 💚"                                                                                                                                            | —                                                                                                     | default → passo 4 (após OCR)                                                            |
| 3   | `d_como_funciona`   | message                | `**como_funciona**` (do Fluxo A, passo 6 — herda áudio + vídeo já cadastrados)  | (texto vazio — só envia áudio+vídeo do slot)                                                                                                                                                                              | `simular / Quero simular agora`, `humano / Falar com {{representante}}`                               | `simular`→passo 2, `humano`→passo 7                                                     |
| 4   | `d_resultado`       | message                | —                                                                               | "Pronto, {{nome}}! 🎉\n\nSua conta hoje é *R$ {{valor_conta}}*.\n\nVocê pode ter de *{{economia_range}}* de redução todo mês — sem obra, sem instalação, continuando com a mesma distribuidora.\n\nBora cadastrar agora?" | `cadastrar / Cadastrar agora`, `duvidas / Tenho mais dúvidas`, `humano / Falar com {{representante}}` | `cadastrar`→passo 5, `duvidas`→passo 6, `humano`→passo 7                                |
| 5   | `d_pedir_documento` | **capture_documento**  | `**passo_mp74oztd**` (slot do passo 9 do Fluxo A — `auto_detect_doc_type=true`) | "Show! Pra finalizar preciso de uma foto do seu *RG ( frente + verso ) ou CNH* (frente). A IA detecta sozinha 📸"                                                                                                         | —                                                                                                     | default → passo 8 (após OCR doc)                                                        |
| 6   | `d_duvidas`         | message                | `como_funciona` (reusa áudio/vídeo)                                             | "Claro! Te mando de novo o áudio e o vídeo explicando 👇"                                                                                                                                                                 | `simular / Quero simular`, `cadastrar / Já quero cadastrar`, `humano / Falar com {{representante}}`   | `simular`→2, `cadastrar`→5, `humano`→7                                                  |
| 7   | `d_handoff`         | message                | —                                                                               | "Beleza! Já chamei o {{representante}} pra você. Em instantes ele te responde 🙌"                                                                                                                                         | —                                                                                                     | `goto_special='humano'` (pausa bot + `notifyHandoff` — lógica `human-takeover-silence`) |
| 8   | `d_finalizar`       | **finalizar_cadastro** | `passo_mp74xnmn`                                                                | "Tudo certo! Estou enviando seu cadastro para o portal da iGreen ⏳\n\nVocê vai receber um *código de verificação* aqui no WhatsApp — quando chegar, *digite ele aqui mesmo*."                                             | —                                                                                                     | —                                                                                       |


### Fluxo de finalização automática

O `step_type='finalizar_cadastro'` já dispara o pipeline existente (`finalize-capture` → `portal-worker` → OTP → selfie). Como os passos 2 e 5 já coletaram conta+OCR+documento, ao chegar no passo 8 todos os 10 campos obrigatórios de `finalize-capture` estão preenchidos e o worker sobe direto pro portal sem perguntas extras.

Se faltar algum campo (ex.: e-mail), o `bot-flow.ts` legacy completa via `getNextMissingStep` — comportamento herdado, sem mexer.

---

## Arquivos tocados

- `src/pages/FluxoCamila.tsx` — card "Botões de resposta rápida" + botão "Criar Fluxo D".
- `supabase/functions/_shared/render-vars.ts` — `{economia_range}`.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — `dispatchStepFromFlow` lê `captures._buttons` e usa `sendButtons`.
- `supabase/migrations/<novo>.sql` — RPC `seed_flow_d`.

## Confirmação

Crio agora o **Fluxo D só pro seu consultor** (Camila — `0c2711ad…`) e marco **D como único ativo**? Os fluxos A/B continuam existindo, mas saem do round-robin até você re-marcar no card "Fluxos ativos".
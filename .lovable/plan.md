# Plano — Modo Game com ordem travada e Finalizar inteligente

## Objetivo
Acabar com a bagunça de áudio/texto duplicado e fora de ordem. O Game vira um trilho: só libera o próximo passo quando o anterior estiver ✓, acende os tiles sozinho conforme o lead responde (OCR/upload), e libera "Finalizar Cadastro" só quando estiver 100% completo. Consultor escolhe se quer **Auto-pilot** (dispara sozinho) ou **Manual** (consultor clica).

## 1. Trava de ordem (frontend — `CaptureStepsGrid.tsx`)
- Cada tile recebe `locked: boolean`. Só o **primeiro tile não-enviado** fica habilitado; os seguintes ficam com cadeado 🔒 cinza.
- Botão "Enviar" desabilitado em tile travado, com tooltip "Conclua o passo anterior".
- Tile com `sent` ✓ continua clicável (re-enviar), mas mostra confirmação.
- Ordem = `position` do `bot_flow_steps` filtrado por `variant` (já existe).

## 2. Auto-pilot toggle (header do `CaptacaoPanel.tsx`)
- Switch ao lado dos A/B/C: **🤖 Auto** ↔ **👤 Manual** (default: Manual, persiste em `localStorage`).
- **Manual:** comportamento atual — consultor clica cada tile.
- **Auto:** quando webhook detecta resposta válida do lead (conta recebida, email digitado, etc.) e marca o tile como ✓ no realtime, o frontend dispara o **próximo tile** automaticamente via `manual-step-send` (continueFlow=true) após 2s de debounce.
- Indicador visual: tile que vai disparar sozinho pulsa verde com countdown 3…2…1.

## 3. Botão "Finalizar Cadastro" inteligente
- Novo componente `FinalizeButton` no rodapé do painel, sticky.
- Habilita **somente quando**:
  - `filledCount === 10` (todos os campos do `CAPTURE_FIELDS`)
  - 3 documentos com URL (`document_front_url`, `document_back_url`, `electricity_bill_photo_url`)
  - `name_mismatch_flag !== true` OU `name_mismatch_acknowledged_at != null`
  - Todos os tiles do fluxo enviados (`sentSteps.size === display.length`)
- Enquanto faltar algo: botão cinza com checklist do que falta ("Falta: email, confirmar WhatsApp, documento verso").
- Quando libera: verde pulsante + dispara `finalizar_cadastro` no `manual-step-send`.

## 4. Anti-duplicação backend (`manual-step-send/index.ts`)
- Reforçar o debounce de 5s já existente para chave `(customerId, stepId)`.
- Adicionar guard: se `sentSteps` já contém o stepId e `continueFlow=false`, retorna `already_sent` (frontend mostra toast amarelo em vez de erro).
- Garantir ordem text→audio→image→video dentro de cada step (já existe em `dispatchStepFromFlow`, validar).

## 5. Responsivo mobile
- Grid `grid-cols-2 md:grid-cols-5` já existe; ajustar tiles para `min-h-[112px]` no mobile e padding maior nos botões (tap targets ≥40px).
- Header A/B/C + Auto/Manual: stack vertical < 640px, horizontal acima.
- Sticky FinalizeButton com `safe-area-inset-bottom`.

## 6. Sincronia atalhos + templates + fluxo
- O painel Game já lista `bot_flow_steps`. Adicionar 2 abas internas no MessageComposer expansível:
  - **Fluxo** (atual — passos do bot_flows)
  - **Templates** (de `templates` table, filtrado por consultor)
  - **Atalhos** (de `objectionShortcuts.ts` + custom)
- Os 3 respeitam a trava de ordem? **Não** — atalhos/templates são livres (objeções/dúvidas avulsas). Só o **Fluxo** trava.

## Arquivos a editar
- `src/components/captacao/CaptureStepsGrid.tsx` — lock por posição, locked tile UI
- `src/components/captacao/CaptacaoPanel.tsx` — toggle Auto/Manual, FinalizeButton, listener realtime p/ auto-disparo
- `src/components/captacao/FinalizeButton.tsx` — **novo**, checklist + sticky
- `src/components/captacao/game/MessageComposer.tsx` — abas Fluxo/Templates/Atalhos
- `src/hooks/useCaptureSession.ts` — expor `isComplete` booleano
- `supabase/functions/manual-step-send/index.ts` — retorno `already_sent` (não-erro)

## Fora de escopo
- Mudanças no `whapi-webhook` (ordem do bot já está OK no resolver custom)
- Refazer FluxoCamila no /admin/fluxos
- Compress-worker / portal-worker

## Pergunta final antes de implementar
O toggle Auto/Manual deve ser **por lead** (cada conversa lembra) ou **global do consultor** (uma config para todos os leads)?

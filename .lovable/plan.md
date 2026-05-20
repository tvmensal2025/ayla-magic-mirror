## Objetivo

1. Quando o cliente enviar a **foto/PDF da conta de luz** (depois do consultor ter pedido), o backend deve rodar **OCR + enviar botões interativos via Whapi (✅ SIM / ❌ NÃO / ✏️ EDITAR)** — exatamente como já acontece para RG/CNH.
2. A lista dos **10 passos no painel Captação** deve mostrar todas as variantes do fluxo (A áudio, B sem áudio, C vídeo) lado a lado para o consultor escolher qual versão enviar em cada passo.

## Contexto técnico apurado

- **OCR da conta + botões já existem** em `whapi-webhook/handlers/bot-flow.ts` (case `aguardando_conta` → `confirmando_dados_conta`, linhas ~2520-2665) usando `ocrContaEnergia` + `sendOptions([sim_conta, nao_conta, editar_conta])`.
- **Problema atual**: o Modo Captação seta `capture_mode='manual'`. Quando o cliente responde com **mídia** (foto da conta), o `whapi-webhook` cai no fluxo normal **somente se `conversation_step === "aguardando_conta"`**. Se o consultor disparou o passo "Pergunta valor da conta" manualmente, o `conversation_step` continua em outro estado (ex.: `qualificacao`, `aguardando_valor_conta`) e o OCR não roda. Além disso, se o bot ficou pausado pelo handoff (`bot_paused=true`), o webhook ignora a mensagem antes mesmo do OCR.
- **Variantes A/B/C**: tabela `bot_flows` tem coluna `variant`. Hoje o `CaptureStepsList` busca **apenas 1 fluxo** (active ou mais recente) e mostra só os passos dele.

## Mudanças

### 1) Backend — OCR automático da conta no Modo Captação

**Arquivo**: `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

- Adicionar **detecção precoce de imagem/PDF** quando `capture_mode === "manual"` (ou quando há intenção clara de conta) **antes** do switch de `conversation_step`:
  - Se `isFile` (image/PDF) **e** ainda não há `electricity_bill_value` confirmado **e** ainda não há `ocr_done`, forçar `conversation_step = "aguardando_conta"` antes do dispatch.
  - Caso já exista `document_front_url` mas não `bill_holder_name`, tratar como conta também (não é doc novamente).
- **Heurística simples** para diferenciar conta vs doc na primeira foto enviada após o passo "Pede conta":
  - Se o último passo manual enviado pelo consultor (consultar `conversations.message_text` últimas N saídas) contém "conta de luz" / "fatura" → tratar como conta.
  - Senão, perguntar com botões: `📄 É a conta de luz?` / `🪪 É RG/CNH?` antes de processar.

**Arquivo**: `supabase/functions/whapi-webhook/index.ts`

- No bloco `isCustomerPausedByHuman`, abrir **exceção controlada para mídia em modo captação**: se `capture_mode === "manual"` **e** `isFile`, **não** silenciar — deixar o `bot-flow.ts` processar o OCR e enviar os botões. Continuar silenciando texto (handoff humano segue valendo p/ texto).

### 2) Frontend — Seleção de variante A/B/C por passo

**Arquivo**: `src/components/captacao/CaptureStepsList.tsx`

- Trocar a query para buscar **todos os `bot_flows` ativos do consultor** agrupados por `variant`.
- Agrupar `bot_flow_steps` por `step_key` (chave canônica do passo, ex.: `pergunta_valor_conta`) — uma linha por passo, com sub-botões `[A áudio] [B texto] [C vídeo]` à direita, refletindo apenas as variantes disponíveis.
- Cada sub-botão chama `manual-step-send` passando o `stepId` específico daquela variante.
- Indicador de variante padrão (a do `customer.flow_variant`) destacada.
- `sentSteps` continua por `stepId` (já contempla seleção diferente).

**Arquivo**: `src/components/captacao/CaptureSheet.tsx`

- Contador "Passo X de 10 enviado" passa a contar por `step_key` enviado (qualquer variante conta como 1).

### 3) Documento da conta no painel Ficha

**Arquivo**: `src/components/captacao/CaptureDocumentTiles.tsx`

- Após upload da tile "Conta de Energia", disparar `supabase.functions.invoke("capture-extract-bill", { bill_url })` (nova edge fina) **ou** marcar `conversation_step='aguardando_conta'` + simular inbound no webhook para reaproveitar o OCR existente.
- Preferência: criar **edge function `capture-extract-bill`** que chama `ocrContaEnergia` direto e devolve os campos para preencher na tela + dispara os botões via Whapi para o cliente confirmar.

## Fora de escopo

- Reescrever o fluxo automático A/B/C de variante (`router-multi-variant-fix` continua intocado).
- Mudar portal-worker / OTP.
- Alterar `manual-step-send` (já aceita `stepId` arbitrário).

## Validação

1. Consultor abre Captação → vê os 10 passos com chips `[A] [B] [C]` quando o consultor tiver as 3 variantes.
2. Clica `[B]` no passo "Pergunta valor da conta" → cliente recebe versão sem áudio.
3. Cliente manda foto da conta → backend roda OCR → cliente recebe mensagem com botões **✅ SIM / ❌ NÃO / ✏️ EDITAR**.
4. Cliente clica **SIM** → `conversation_step` avança como já acontece no fluxo automático; dados aparecem preenchidos na Ficha.

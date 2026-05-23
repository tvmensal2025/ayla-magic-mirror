## Diagnóstico

Cliente `JOSINETE` (`55d3c89f…`, variante D) saltou direto de "conta recebida" → mensagem `d_finalizar`, sem confirmação da conta no WhatsApp, sem mensagem de simulação (`d_resultado`) e sem pedir o documento (`d_pedir_documento`).

Logs e código mostram **dois bugs em série**:

### Bug 1 — `manual-step-send.buildContinuationPatch` ultrapassa passo de captura
Quando o consultor clica **"Eu confirmo"** no `OcrReviewCard` (bill), o front chama `manual-step-send` com `stepKey: "capture_documento"` + `continueFlow: true`.

`buildContinuationPatch` envia o conteúdo do passo de doc corretamente, mas o **loop de encadeamento (linha 841) continua avançando** após o passo clicado:
- `d_pedir_documento` (pos 5, capture_documento) → conteúdo enviado, cursor = `aguardando_doc_auto` ✅
- LOOP entra em `d_duvidas` (pos 6, message sem `?` nem intent transitions) → envia e segue ❌
- LOOP cai em `d_finalizar` (pos 8, finalizar_cadastro) → envia o texto do "Finalizar" e **sobrescreve** `conversation_step` para `finalizando` ❌

Resultado: lead nunca foi convidado a mandar o RG/CNH; o bot já considera o cadastro pronto.

### Bug 2 — `confirmando_dados_conta` (SIM) pula passos `message`
No handler legacy, depois do SIM, o "SAFETY-BELT" (linhas 3140-3151) procura o **próximo passo de captura/finalização**, ignorando passos `message` entre a conta e o documento. Isso elimina a tela `d_resultado` (porcentagem de economia, valores) que o usuário quer ver antes do pedido de documento.

### Bug 3 — Confirmação no painel não envia simulação
`OcrReviewCard.confirmSelf` chama direto `stepKey: "capture_documento"`, então mesmo se o Bug 1 for corrigido, ainda assim a mensagem `d_resultado` (pos 4) continua sendo pulada.

---

## Mudanças

### 1. `supabase/functions/manual-step-send/index.ts` — parar o chain em captura
Em `buildContinuationPatch`, logo após definir `patch.conversation_step` baseado no `clickedType`, **retornar imediatamente** se o passo clicado for de captura/confirm_phone/finalizar_cadastro. O chain só faz sentido depois de um passo `message`.

```ts
if (clickedType !== "message") {
  // Captura: aguarda resposta do lead, nunca encadeia automaticamente.
  return patch;
}
```

Isso isola o efeito do clique do consultor ao passo que ele realmente selecionou.

### 2. `OcrReviewCard.tsx` — emitir simulação antes do pedido de doc
Em `confirmSelf`, quando `kind === "bill"`, **antes** de chamar `capture_documento`, percorrer os passos `message` ativos entre `capture_conta` e o próximo `capture_documento` e despachá-los via `manual-step-send` com `continueFlow: false` (apenas envia o conteúdo, sem mover cursor para finalizar).

Fluxo final no painel:
1. `update customers ocr_review_*` (já existe).
2. Para cada passo `message` ativo entre o `capture_conta` e o próximo `capture_documento`/`finalizar_cadastro`: `manual-step-send` com `stepKey` do passo, `continueFlow: false`, com pequeno delay (~2s).
3. Por fim: `manual-step-send` com `stepKey: "capture_documento"`, `continueFlow: false` (o conteúdo do prompt do doc já é enviado, e com a correção do Bug 1, o cursor fica em `aguardando_doc_auto`).

Para `kind === "doc"` o comportamento permanece: chama `finalizar_cadastro` (que continua ok pois é o passo final).

### 3. `bot-flow.ts` — preservar mensagens entre conta e documento no caminho SIM (Bug 2)
Na branch `confirmando_dados_conta` → SIM (linhas 3127-3151), trocar a lógica:
- Buscar o **próximo passo ativo** após `capture_conta_pos` SEM filtrar tipo.
- Se for `message` (ex.: `d_resultado`): despachá-lo via `dispatchStepFromFlow` e fixar `conversation_step = <uuid>` (mesma lógica do bloco else `message → fica no UUID`), deixando o resolver pré-switch avançar quando o lead responder OU encadeando até o próximo capture.
- Manter o caminho atual quando o próximo já é capture/finalizar.

Implementação prática: reaproveitar o mesmo loop de `buildContinuationPatch` (despacha mensagens até bater em `capture_*`/`finalizar_cadastro` ou pergunta), garantindo que a simulação saia antes do pedido de doc tanto pelo bot quanto pelo painel.

### 4. Reforço de guarda em `finalizando` (já existe parcialmente)
A validação `validateCustomerForPortal` em `bot-flow.ts:4506` já bloqueia envio sem CPF/doc/etc. Verificar que `customers.cpf`, `document_number`, `document_front_url` constam dos campos obrigatórios; se a planilha de validação atual permitir submeter sem doc, adicionar `document_front_url` e `cpf` como obrigatórios (ler `_shared/validateCustomerForPortal.ts` antes de mexer). Isso é a rede de segurança que impede o portal de receber lead incompleto mesmo se algum chain futuro voltar a errar.

---

## Validação pós-deploy

1. Resetar `customers/55d3c89f…` para `conversation_step='aguardando_conta'` e limpar `ocr_review_*`.
2. Reenviar foto da conta → confirmar com consultor online: deve sair `d_resultado` (simulação) e depois `d_pedir_documento`. NÃO deve sair `d_finalizar`.
3. Enviar foto do documento → confirmar via painel → deve sair `d_finalizar` com botão.
4. Clicar "Finalizar" → bot valida CPF + doc + valor + nome antes de chamar portal.
5. Logs `[manual-step-send] continueFlow … final=…` devem mostrar `aguardando_doc_auto` no clique do bill, não `finalizando`.


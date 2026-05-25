## Diagnóstico

O sintoma é: usuário anexa foto da conta no `/admin/fluxos` → simulador, e o painel "Conta de luz (OCR)" nunca preenche distribuidora/valor/instalação.

### Evidências coletadas

1. Customer sandbox mais recente (`2d0188db…`):
  - `error_message = "aguard_conta: isFile=true hasImage=true fileBase64Len=160 sandbox=true"` (diagnóstico de `bot-flow.ts:3010`)
  - `conversation_step = "aguardando_conta"` (deveria estar em `aguardando_doc_auto` se o mock tivesse rodado)
  - `electricity_bill_photo_url` setado (data URL), mas `distribuidora/numero_instalacao/electricity_bill_value` todos NULL
  - `bot_test_outbound` registra apenas o `"✅ Conta recebida! ⏳ Analisando…"` (turn 1) — nenhum follow-up
2. Bucket `simulator-uploads` é **público** ✅, então download HTTP funciona.
3. `fileBase64Len=160` (≈120 bytes) revela duas coisas:
  - A imagem REAL não chegou — provavelmente o download da URL de storage retornou algo minúsculo (ou o usuário enviou um PNG de teste 1x1).
  - Mesmo assim, em sandbox a validação de tamanho é puladae (`bot-flow.ts:3092`), então o mock DEVERIA rodar.

### Causa raiz #1 — mock OCR travando silenciosamente

`bot-flow.ts:3112-3313` envolve TODO o caminho de OCR (mock + real) num `try/catch`. Dentro do `try`:

```ts
if (isCustomerSandbox(customer)) {
  await supabase.update({ error_message: "mock_path: entered…" }).eq(...);   // ← nunca chega aqui
  const { mockBillOcr } = await import("../../_shared/test-mode.ts");
  …
}
```

Como `error_message` continua igual a `"aguard_conta: …"` (escrito ANTES do `try`), comprovamos que algo entre `sendText("Conta recebida")` (3077) e a primeira linha do branch mock (3117) lança exceção. O `catch` (3300) então:

- incrementa `ocr_conta_attempts`,
- **reverte `conversation_step = "aguardando_conta"**` ← bate com o estado observado,
- monta `retryText` como reply.

A reply de retry também não aparece em `bot_test_outbound`, sugerindo que a exceção propaga mais acima (provavelmente um timeout/falha no `await import()` dinâmico ou no `await sendText` mockado em condição de borda do AsyncLocalStorage).

### Causa raiz #2 — duplicidade de mock

O `_shared/ocr.ts:101` já tem o curto-circuito `if (isMockMode()) return mockBillOcr()`. O branch redundante no `bot-flow.ts:3114-3148` foi adicionado para garantir o mock mesmo quando `botRequestStore` (AsyncLocalStorage) perde contexto — mas ele agora é frágil (dynamic import, side-effects), e quando quebra leva o usuário ao loop "Analisando… [silêncio]".

### Causa raiz #3 (provável intenção do usuário)

"Teste realista não está lendo OCR" também pode significar: **o usuário envia uma conta de verdade e espera ver os dados extraídos**, mas recebe sempre "Joao Silva Teste" (do mock fixo). Hoje o simulador é sandbox 100% → mock OCR fixo, sem opção de rodar Gemini real.

---

## Plano de correção

### A) Estabilizar o caminho mock atual (rápido, garante que o painel preenche)

1. Trocar o `await import("../../_shared/test-mode.ts")` por **import estático** no topo de `bot-flow.ts` (já existe `import { ... } from "../../_shared/test-mode.ts"` — só adicionar `mockBillOcr, mockDocOcr` à lista). Mesmo nos dois pontos (`aguardando_conta` e doc handler ~3577).
2. Mover o branch mock para **fora do `try/catch**` de OCR — assim qualquer erro inesperado não reverte step nem some com a reply.
3. No `catch` de fallback OCR, logar `e?.message` em `customers.error_message` (sobrescrevendo `aguard_conta:`) para dar visibilidade futura.
4. Limpar `error_message` quando o passo avança com sucesso (evita "lixo" de runs antigas confundindo debug).

### B) Adicionar toggle "OCR real (Gemini)" no simulador (opcional, atende à intenção do usuário)

1. `FlowSimulator.tsx`: novo checkbox **"Rodar OCR de verdade nesta conta"** ao lado do campo de Telefone OTP, persistido em `localStorage`.
2. `flow-simulate-run/index.ts`: aceita `real_ocr: boolean` no body. Se `true`, grava `customers.ocr_test_mode = "real"` antes do turno.
3. `bot-flow.ts` (caso `aguardando_conta` e handlers de doc): quando `customer.ocr_test_mode === "real"` E há `fileBase64` válido → pula o mock e chama `ocrContaEnergia` normal (Gemini). Caso contrário mantém o mock rápido.
4. Migration adiciona coluna `customers.ocr_test_mode text` (`'mock' | 'real'`, default `'mock'`).

### C) Validação pós-deploy

1. Simulador → "Zerar" → anexar PNG 1px → painel direito deve mostrar dados mockados ("Joao Silva Teste", R$ 350,50, ENEL SP) em <3s e step ir para `aguardando_doc_auto`.
2. Ativar toggle "OCR real" → anexar foto de conta de verdade → painel mostra os dados reais extraídos pelo Gemini.
3. `SELECT error_message FROM customers WHERE is_sandbox` deve estar `NULL` ou conter mensagem de erro real, não o diagnóstico residual.

### Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (refactor mock OCR conta + doc)
- `supabase/functions/flow-simulate-run/index.ts` (aceitar `real_ocr`)
- `src/components/admin/flow-builder/FlowSimulator.tsx` (toggle OCR real)
- `supabase/migrations/*_add_ocr_test_mode.sql` (apenas se aprovar parte B)

### Pergunta para o usuário antes de implementar

iremos implantar apenas real igual o fluxo roiginal
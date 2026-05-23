## Auditoria do fluxo de captação (Josinete / variante D)

Rodei o caminho `welcome → conta → simulação → documento → finalizar → portal` no código + no DB. O fluxo conduz até o portal, mas tem **um bug confirmado** (banner que não some) e **um ponto frágil** (atalho que pula a simulação).

### Bug confirmado — banner "Revisar" não some

No DB da JOSINETE (`55d3c89f-…`):

| Campo | Valor |
|---|---|
| `bill_data_confirmed_at` | 17:41:13 ✅ |
| `bill_data_confirmation_by` | `consultant` ✅ |
| `ocr_review_pending` | **`bill`** ❌ (deveria ser `null`) |
| `ocr_review_decided_at` | **`null`** ❌ |

Existem **dois componentes** com botão "Eu confirmo":

1. `OcrReviewCard.confirmSelf` → limpa `ocr_review_pending`, `ocr_review_decided_at/by`. ✅ Correto.
2. `CaptureDataConfirmCard.confirmSelf` (card embutido na ficha do lead, lado direito) → **só** seta `bill_data_confirmed_at`. **Não limpa `ocr_review_pending`** → o hook `useOcrReviewQueue` (filtra `ocr_review_pending IS NOT NULL`) continua exibindo o lead na fila.

A consultora clicou no card da ficha, e por isso o banner laranja "Conta de luz pronto pra revisar" continuou aparecendo mesmo após confirmar.

O mesmo `CaptureDataConfirmCard.askClient` (botão "Pedir ao cliente") também não atualiza esses campos.

### Ponto frágil — pula a simulação

`CaptureDataConfirmCard.confirmSelf` chama `manual-step-send` direto com `stepKey: "capture_documento"`, sem despachar antes os passos `message` intermediários entre `capture_conta` e o próximo capture (no fluxo D do Rafael isso é o `d_resultado` da simulação dos 20%). Resultado: quem confirma pelo card da ficha pula a simulação. (`OcrReviewCard.confirmSelf` já faz esse encadeamento corretamente.)

### Resto do fluxo — OK

| Etapa | Status |
|---|---|
| 1. Welcome + 3 botões | OK (texto→áudio→vídeo→botões fallback que acabamos de adicionar) |
| 2. Pergunta valor da conta | OK |
| 3. Pede permissão | OK |
| 4. Como funciona (texto+áudio+vídeo+botões) | OK com fallback novo |
| 5. Convite cadastro | OK |
| 6. Captura conta + OCR + review | OK |
| 7. Captura documento + OCR + review | OK |
| 8. `finalizar_cadastro` → habilita botão "Finalizar Cadastro 🚀" | OK |
| 9. `finalize-capture` valida (`validateCustomerForPortal`) e marca `portal_submitting` | OK |
| 10. Portal recebe OTP → cliente envia código → `complete` | OK |

Não existe finalização automática hoje — o consultor sempre precisa clicar "Finalizar Cadastro". Isso é desejado (controle humano antes do portal); só vou listar isso na auditoria, sem alterar.

---

## Plano de correção

### 1. `src/components/captacao/CaptureDataConfirmCard.tsx`

- Em `confirmSelf`, no payload de update incluir:
  ```
  ocr_review_pending: null,
  ocr_review_decided_at: new Date().toISOString(),
  ocr_review_decided_by: "consultant",
  ```
- Em `confirmSelf`, antes de chamar o próximo capture, replicar o trecho do `OcrReviewCard` que busca os passos `message` ativos entre o capture atual e o próximo capture/finalize, e despacha cada um via `manual-step-send` com `continueFlow: false` (assim a simulação é enviada antes do pedido do documento).
- Em `askClient`, incluir no update:
  ```
  ocr_review_pending: null,
  ocr_review_decided_at: new Date().toISOString(),
  ocr_review_decided_by: "awaiting_client",
  ```

### 2. Migration de cleanup (1 linha)

Limpar o estado preso da JOSINETE para o banner sumir agora:

```sql
update public.customers
set ocr_review_pending = null,
    ocr_review_decided_at = coalesce(ocr_review_decided_at, bill_data_confirmed_at, now()),
    ocr_review_decided_by = coalesce(ocr_review_decided_by, 'consultant'),
    updated_at = now()
where ocr_review_pending is not null
  and (
    (ocr_review_pending = 'bill' and bill_data_confirmed_at is not null) or
    (ocr_review_pending = 'doc'  and doc_data_confirmed_at  is not null)
  );
```

Isso resolve a Josinete e qualquer outro lead que tenha caído no mesmo bug histórico.

### 3. Auditoria — sem mudança de código

Documentar no resumo final para o usuário:
- O fluxo conduz até o portal via botão "Finalizar Cadastro 🚀".
- O botão só habilita quando `validateCustomerForPortal` passar (CPF, RG, foto conta, doc frente/verso, sem name_mismatch pendente).
- Finalização permanece manual por design.

### Validação pós-deploy

1. Conferir no DB que `ocr_review_pending` da Josinete virou `null`.
2. Abrir `/admin` na ficha de outro lead com OCR pendente, clicar "Eu confirmo" no card da ficha (não no banner) e verificar:
   - banner laranja desaparece;
   - chega a mensagem de simulação (`d_resultado`) antes do pedido do documento.

---
name: OCR Name Consistency (conta × RG)
description: Trusted name sources lock; bill_holder_name and doc_holder_name audited; mismatch triggers 'confirmar_titularidade' step before finalizing
type: feature
---
- `safeAssignName` bloqueia sobrescrita quando `name_source ∈ {ocr_conta, ocr_doc, user_confirmed}` — só `editing_conta_nome`/`editing_doc_nome` trocam.
- `extractCaptures` (conversational) também respeita esse lock; captura de nome via texto livre é ignorada quando há fonte confiável.
- OCR sempre grava `customers.bill_holder_name` e `doc_holder_name` brutos para auditoria.
- Após OCR do RG, `checkHolderMatch(bill, doc)` (sim ≥ 0.85 OU primeiro+último iguais). Mismatch → `name_mismatch_flag=true`, aviso anexado ao reply de confirmação.
- Ao confirmar dados do doc com mismatch pendente, o bot entra em `confirmar_titularidade` com 3 opções: mesma pessoa / outro titular (grava `bill_owner_relationship`) / corrigir → `editing_doc_menu`.
- Colunas: `bill_holder_name, doc_holder_name, name_mismatch_flag, name_mismatch_reason, name_mismatch_acknowledged_at, bill_owner_relationship`.

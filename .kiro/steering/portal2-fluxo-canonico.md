---
inclusion: fileMatch
fileMatchPattern: "worker-portal-2/**|supabase/functions/portal2-*/**|docs/portal-api/**"
---

# Portal 2 — Fluxo de cadastro canônico (gravado em produção)

**Última validação:** 2026-05-29
**Doc detalhado:** `docs/portal-api/PORTAL2_FLUXO_CANONICO.md`
**Trace oficial (Supabase):** `portal2_audit_traces` onde `is_official_reference = true`

## Não re-mapear sem motivo

O fluxo abaixo foi validado fim-a-fim em produção:

- **Distribuidora:** resolvida por `CEP → ViaCEP → CITY_HINT`. Override por OCR ou input manual só quando CEP não bate.
- **Consumo:** `media_consumo` → OCR `consumomedio` → estimativa R$ ÷ 1,10/kWh (clamp 100..2000).
- **Bonus rule:** `desconto_padrao=true` (tier A, **menor desconto da região** — regra de negócio do cliente).
- **Telefone:** `formatPhone` remove DDI 55 e formata pra `(DD) 9XXXX-XXXX` (14 chars).
- **CEP:** `formatCep` insere hífen (`XXXXX-XXX`, 9 chars).

Se for mexer em qualquer um desses pontos, abrir o doc `PORTAL2_FLUXO_CANONICO.md` e o trace oficial primeiro.

## Cobertura iGreen (verificado via /bonus/distributors)

iGreen **não atende**: ENEL SP capital + Grande SP, EDP Vale do Paraíba, LIGHT (Rio capital + baixada), DF, AM, AP, AC, RO, RR. Pra essas, `resolveConcessionariaByCep` retorna `{naoAtendida: true}`.

## Auditoria IA

`PORTAL2_AI_AUDIT_LIMIT` (default 10) controla quantos cadastros vão pra `portal2-ai-audit` (edge function que chama Gemini). Custo ~$0.0002/lead. Desligar quando estiver estável (`=0`).

## Erros conhecidos do POST /customers

| code | field | tratamento |
|------|-------|-----------|
| `error.generic.validationError` (Too small celular) | `celular` | `formatPhone` já trata DDI 55 |
| `error.customer.duplicatePhone` | `celular` | esperado em retry; o `/customers/check-exists` da iGreen NÃO checa celular |
| `error.customer.duplicateDocument` | `cpf_cnpj` | nosso `checkCustomerExists` deveria pegar antes |
| `error.generic.validationError` (Too small cep) | `cep` | `formatCep` insere hífen |

## Não confundir

- O cliente pediu **MENOR desconto da região** (não o maior). Isso significa preferir `desconto_padrao=true` (tier A=8%). NÃO inverter pra "maior desconto".
- "Worker Portal 2" é stack Easypanel (`igreen_portal-worker-2`, VPS 72.60.159.48), repo de deploy é `tvmensal2025/igreen-official-portal` (não ayla-magic-mirror).
- O endpoint `/extractor/extract-receipt` retorna estrutura DIFERENTE pra fatura vs boleto. Boleto traz `tipo_comprovante: "BOLETO"`, `beneficiario` (com erros de OCR tipo "PRA TININGA" pra "PIRATININGA"), `valor_pago`, mas SEM `consumomedio`.

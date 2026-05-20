# Fase 4 — Captura automática com IA

Objetivo: enquanto o consultor conversa no Modo Captação, a IA lê cada nova mensagem do lead e sugere preenchimento dos 10 campos críticos. O consultor confirma com 1 clique (modo Híbrido).

## Fluxo

```text
Lead envia msg  →  trigger DB  →  edge capture-extract (Gemini Flash)
                                        ↓
                          retorna { campo: valor, confidence }
                                        ↓
              insert em capture_field_suggestions (realtime)
                                        ↓
              CaptureLeadCard pisca campo + botões ✓ / ✏
                                        ↓
        ✓ aceitar  →  update customers.<campo>  +  +1 XP  +  confete leve
        ✏ editar   →  abre input inline, salva manual (+1 XP)
        ✗ ignorar  →  marca suggestion como dismissed
```

## Mudanças

### Banco (1 migração)

- Tabela `capture_field_suggestions`:
  - `customer_id`, `consultant_id`, `field_name`, `suggested_value`, `confidence` (0–1), `source_message_id`, `status` (`pending`/`accepted`/`edited`/`dismissed`), timestamps
  - RLS: dono ou manager via `can_view_consultant`
  - Realtime habilitado
- Sem alterações em `customers`.

### Edge function `capture-extract` (nova)

- Trigger: chamada pelo `whapi-webhook` quando `customers.capture_mode = 'manual'` E a mensagem é **inbound** do lead.
- Carrega últimas 6 mensagens + valores atuais dos 10 campos.
- Gemini 2.5 Flash (Lovable AI Gateway) com Output schema Zod:
  ```ts
  { name?, cpf?, rg?, email?, phone_landline?, cep?,
    address_number?, address_complement?,
    electricity_bill_value?, confidence: Record<field, number> }
  ```
- Só insere sugestão se: campo está vazio em `customers` E `confidence ≥ 0.7` E ainda não há `pending` para o mesmo campo.
- Erros 429/402 do gateway: log silencioso, não trava o webhook.

### Webhook (`whapi-webhook`)

- Após persistir mensagem inbound, dispara `capture-extract` em background (sem await bloqueante) apenas se `capture_mode = 'manual'`.
- Zero impacto em leads em fluxo automático.

### Frontend

- `useCaptureSession`: subscrever realtime de `capture_field_suggestions` do `customer_id` ativo.
- `CaptureLeadCard`: 
  - Badge "IA sugere: <valor>" sobre o campo com botões ✓ / ✏ / ✗
  - Animação `framer-motion` (flash dourado) quando sugestão chega
  - ✓ → update customer, marca `accepted`, dispara `bumpXP()` + mini-confete
  - ✏ → abre input pré-preenchido, salva e marca `edited`
  - ✗ → marca `dismissed`
- `captureGame.ts`: adicionar frase "🤖 IA capturou <campo>!" no toast.

## O que NÃO muda

- Fluxo automático, OCR, portal-worker, submit-lead, scoreboard, badges (fase 3).
- Consultor pode continuar digitando manualmente — sugestão é opcional.

## Entregáveis

1. Migração `capture_field_suggestions` + RLS + realtime
2. Edge `supabase/functions/capture-extract/index.ts`
3. Patch em `whapi-webhook` (dispatch background)
4. Atualização de `useCaptureSession.ts` + `CaptureLeadCard.tsx`
5. Frases novas em `captureGame.ts`

Posso prosseguir?
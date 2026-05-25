## Objetivo

1. Acelerar o handoff OCR: card de revisão expira em **60s** (hoje são 5 min e o cron nem está rodando), liberando automático para o cliente confirmar via WhatsApp.
2. Adicionar coleta de **email** e **telefone** no Fluxo D, entre o documento e o `d_finalizar`.

---

## 1. OCR Review — timeout de 60s

- Reduzir `TIMEOUT_MS` em `supabase/functions/ocr-review-timeout/index.ts` de `5 * 60_000` → `60_000`.
- Criar pg_cron a cada minuto invocando `ocr-review-timeout` (hoje não existe job agendado; por isso o card fica "preso" no painel).
- Redeploy da função.

Resultado: assim que a cliente envia a conta, o card aparece no `/admin`. Se o consultor não confirmar em 60s, o bot já dispara `confirmando_dados_conta` (Sim/Não/Editar) pra ela — exatamente o fluxo que já existe, só que automático.

---

## 2. Fluxo D — Email + Telefone antes de finalizar

Fluxo atual:
```
d_pedir_documento (pos 5)  →  d_finalizar (pos 8)
```

Novo:
```
d_pedir_documento → d_pedir_email → d_confirmar_telefone → d_finalizar
```

Migration (data) inserindo em `bot_flow_steps` para `flow_id = 320bf22c-…`:

- **`d_pedir_email`** (`step_type = capture_email`, position 6):
  - `message_text`:
    > "Falta pouco, *{{nome}}*! 📧\n\nMe passa seu *e-mail* pra finalizar o cadastro no portal da iGreen."
  - `captures`: `[{ kind: "text", name: "email", required: true, retry_text: "Esse e-mail parece inválido. Pode reenviar?" }]`

- **`d_confirmar_telefone`** (`step_type = confirm_phone`, position 7):
  - `message_text`:
    > "Confirma seu *telefone de contato*? 📱\n\nSe for o mesmo deste WhatsApp, é só responder *Sim*. Caso contrário, envia o novo número com DDD."
  - `captures`: `[{ kind: "text", name: "telefone", required: true }]`

- Atualizar `d_pedir_documento.transitions` / `success_goto` para apontar para `d_pedir_email`.
- Atualizar `d_pedir_email` → `d_confirmar_telefone`.
- Atualizar `d_confirmar_telefone` → `d_finalizar`.
- Renumerar posições para 6/7 (deslocando `d_duvidas`, `d_handoff`, `d_finalizar`).

Engine já entende `capture_email` (mapeia → `ask_email`) e `confirm_phone` — não precisa mexer em código de handler.

---

## Arquivos afetados

- `supabase/functions/ocr-review-timeout/index.ts` — TIMEOUT_MS = 60_000.
- Insert SQL (não migração de schema) — novos steps + transitions em `bot_flow_steps`.
- Insert SQL — `cron.schedule('ocr-review-timeout-every-min', '* * * * *', net.http_post(...))`.

Sem mudanças em UI; tudo backend/bot.
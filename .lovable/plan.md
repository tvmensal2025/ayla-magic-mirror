
# Plano — Finalizar Cadastro → Portal Worker (VPS) → OTP do cliente

## O que já existe (não vamos reinventar)
- `worker-portal` (VPS/Easypanel) expõe `POST /submit-lead`, `POST /confirm-otp`, `GET /health`.
- `whapi-webhook/handlers/bot-flow.ts` já tem a lógica completa de "lead pronto": setta `status=portal_submitting`, faz health-check, dispara `/submit-lead` com retry, e cai em `worker_offline` se falhar.
- `submit-otp` repassa o código digitado pelo cliente para `/confirm-otp` no worker.
- `worker-callback` recebe `otp_required` / `signing_ready` / `registration_complete` / `error` do worker e dispara as mensagens certas no WhatsApp do cliente.
- `otp-intercept` já captura códigos numéricos que o cliente cole no WhatsApp quando `status ∈ {awaiting_otp, portal_submitting}`.

## O que está faltando
Hoje o botão **Finalizar Cadastro** do Modo Game chama `manual-step-send` com `stepKey=finalizar_cadastro`, ou seja, só envia uma mensagem do fluxo — **não dispara o worker da VPS**. Precisa virar um gatilho real para o portal.

## Mudanças propostas

### 1. Nova edge function `finalize-capture`
Responsabilidade única: validar + disparar o worker.

Entrada: `{ customerId, consultantId }` (auth via JWT do consultor logado; service role internamente).

Fluxo:
1. Carrega `customers` + valida no servidor (defesa em profundidade — UI já valida):
   - 10 campos preenchidos, 3 documentos com URL, `name_mismatch_flag` resolvido.
   - Não está em estado terminal (`portal_submitting`, `awaiting_otp`, `registered_igreen`, etc.).
2. Regenera `igreen_link` a partir do `consultants.cadastro_url` do dono (mesmo guard do bot-flow para evitar lead caindo no consultor errado).
3. Update: `status='portal_submitting'`, `conversation_step='portal_submitting'`, `finalized_at=now()`, `finalized_by=auth.uid()`.
4. Envia mensagem ao cliente: "✅ Todos os dados coletados! Em instantes você recebe o código…" (via `_shared/whatsapp` — mesmo helper do bot-flow, respeita `bot_paused`/`assigned_human_id`).
5. Health-check `/health` (5 s). Se offline → marca `status='worker_offline'`, retorna `{ ok: false, reason: 'worker_offline' }` e a UI mostra aviso amarelo "Worker offline — será reprocessado em alguns minutos" (o cron `recover-stuck-otp` / polling do worker já cuida).
6. Online → `POST /submit-lead` com retry (3×, 2 s) reaproveitando o mesmo trecho de `bot-flow.ts` (extrair p/ `_shared/portal-worker.ts`).
7. Retorna `{ ok, status, mode: 'dispatched'|'queued' }` para a UI.

Reuso: extrair o bloco "dispatch portal worker" de `bot-flow.ts` (linhas ~4269-4331) e do mirror em `evolution-webhook/handlers/bot-flow.ts` para `supabase/functions/_shared/portal-worker.ts` (`dispatchPortalWorker(supabase, customerId)`). Tanto o webhook quanto a nova função usam o mesmo helper — uma única fonte de verdade.

### 2. `FinalizeButton.tsx`
- Trocar `supabase.functions.invoke('manual-step-send', { stepKey:'finalizar_cadastro' })` por `supabase.functions.invoke('finalize-capture', { customerId, consultantId })`.
- Toast de sucesso: "🏆 Cadastro enviado ao portal! Aguardando código…"
- Em caso de `worker_offline`: toast amarelo "Portal momentaneamente offline. Reprocessamos automaticamente em poucos minutos."

### 3. Acompanhamento em tempo real no `CaptacaoPanel.tsx`
Adicionar bloco compacto **"Status do Portal"** abaixo do FinalizeButton (visível só depois de finalizar), com Realtime em `customers` (`id=eq.{customerId}`):

| `status` / `conversation_step`              | Badge UI                              |
|--|--|
| `portal_submitting`                          | 🟡 "Abrindo portal no navegador da VPS…" |
| `awaiting_otp` / `aguardando_otp`            | 🟠 "Código enviado ao WhatsApp do cliente — aguardando ele digitar" + mostra `otp_code` quando chegar |
| `validating_otp`                             | 🔵 "Validando código…" |
| `awaiting_signature` / `aguardando_assinatura` | 🟣 "Link de selfie enviado ao cliente" + copia do `link_assinatura` |
| `registered_igreen` / `cadastro_concluido`   | 🟢 "Cadastro concluído ✅" + `igreen_code` |
| `worker_offline` / `automation_failed`       | 🔴 `error_message` + botão "Tentar novamente" (chama `finalize-capture` de novo) |

### 4. Botão "Tentar novamente" (retry manual)
Quando `status ∈ {worker_offline, automation_failed}`, libera botão que rechama `finalize-capture` — útil quando o consultor sabe que o worker já voltou.

### 5. Migration: campos de auditoria em `customers`
- `finalized_at timestamptz`
- `finalized_by uuid` (consultor que apertou Finalizar — pode ser admin operando lead alheio)
Sem RLS nova; já coberto por policies existentes.

## Fora do escopo
- Mudanças no `worker-portal` da VPS (já funciona).
- Tocar no `worker-callback` (já roteia OTP/signing certo).
- Mexer na lógica do bot que finaliza sozinho quando o lead manda tudo pelo WhatsApp — fica intacta; o botão é só o caminho **manual** do consultor que captou no Modo Game.

## Arquivos
- **Criar**: `supabase/functions/finalize-capture/index.ts`, `supabase/functions/_shared/portal-worker.ts`
- **Editar**: `src/components/captacao/FinalizeButton.tsx`, `src/components/captacao/CaptacaoPanel.tsx`
- **Refatorar (opcional, mesmo helper)**: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` e `evolution-webhook/handlers/bot-flow.ts` para usar `dispatchPortalWorker()`.
- **Migration**: `customers.finalized_at`, `customers.finalized_by`.

## Pergunta antes de implementar
Quando o consultor apertar Finalizar **e o worker estiver offline**, o que prefere?
1. **Bloquear o envio** e mostrar erro vermelho ("Worker offline, tente em 1 min") — consultor decide quando retentar.
2. **Enfileirar mesmo assim** (marca `worker_offline` no banco; o polling do próprio worker pega quando voltar) — zero clique extra, mas pode demorar.
3. **Híbrido**: enfileira + mostra contador "Reprocessando em ~30s…" e tenta sozinho a cada 30 s por 5 min.

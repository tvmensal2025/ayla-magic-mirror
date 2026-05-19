## Diagnóstico

### 1. Erro ao "Devolver para o passo"
A UI (`LiveConversationsPanel.tsx`) chama `manual-step-send` com `continueFlow: true`. A função retornou **HTTP 400** (confirmado nos edge logs às 18:34:56). As causas possíveis dentro do código são `missing_fields`, `missing_step`, ou `customer_no_phone`. Como o `stepId` vem do dropdown (sempre presente), e `consultantId`/`customerId`/`part` também, a hipótese mais provável é `customer_no_phone` em leads importados via Excel cujo `phone_whatsapp` é `sem_celular_xxxxx` (74 registros existem hoje). Hoje a função simplesmente devolve `400 { error: "customer_no_phone" }` e a UI mostra `toast` genérico de erro.

### 2. Erro ao "Desativar IA / Assumir controle"
`setPaused()` faz `update direto via RLS na tabela `customers`. As colunas existem (`bot_paused`, `bot_paused_reason`, `bot_paused_at`, `assigned_human_id`). O erro real ainda não está nos logs visíveis — precisa instrumentação leve para capturar (mensagem + code do PostgREST) antes de afirmar a causa raiz. Suspeita: gatilho/constraint disparado em `assigned_human_id` ou conflito com a policy de update quando o registro pertence a outro consultor (super admin visualizando leads alheios).

### 3. IA continua mandando msg depois que o humano assume (regra principal)
Auditei TODOS os senders automáticos. Estado atual:

| Função | Respeita `bot_paused=true`? |
|---|---|
| `whapi-webhook` (inbound em tempo real) | ✅ Sim — bloqueia em `index.ts` linha 418 |
| `ai-followup-cron` | ✅ Sim — `.eq("bot_paused", false)` |
| `bot-stuck-recovery` (resgate) | ✅ Sim — `.eq("bot_paused", false)` |
| `bot-followup-checker` (lembretes) | ❌ **Não** — filtra só `bot_paused_until IS NULL` |
| `send-scheduled-messages` | ❌ **Não** — nem consulta `customers` |
| `recover-stuck-otp` | ❌ **Não** — nem consulta `bot_paused` |
| `ai-closer-cron` | ✅ Deprecated/no-op |

Resultado: quando o consultor clica "Assumir", o webhook para, mas os lembretes (`bot-followup-checker`), mensagens agendadas (`send-scheduled-messages`) e recovery de OTP (`recover-stuck-otp`) **continuam** disparando "Oi, ainda está aí?" e outros textos pela IA.

---

## Plano

### A) Regra de ouro: humano assumiu → IA silenciosa
Criar helper único `isCustomerPausedByHuman(customer)` em `_shared/bot/paused.ts` que retorna `true` se `bot_paused === true` **OU** `assigned_human_id IS NOT NULL` **OU** `bot_paused_until > now()`. Usar em:

1. **`bot-followup-checker/index.ts`** — adicionar `.eq("bot_paused", false)` nas 2 queries (linhas 69 e 105).
2. **`send-scheduled-messages/index.ts`** — antes de enviar cada `scheduled_messages`, fazer lookup do customer pelo `remote_jid`+`consultant_id` (via `instance_name`) e pular (status = `skipped_human_takeover`) se pausado. Atualizar `status='skipped'` com `error_message='bot_paused'`.
3. **`recover-stuck-otp/index.ts`** — adicionar filtro `.eq("bot_paused", false)` na query de candidatos.
4. **`ai-followup-cron`** e **`bot-stuck-recovery`** — endurecer o filtro existente para também checar `bot_paused_until IS NULL OR bot_paused_until < now()` (hoje só checa o boolean).
5. **`whapi-webhook/index.ts`** linha 418 — já bloqueia, manter; adicionar log estruturado dizendo qual cron tentou e foi bloqueado para auditoria.

### B) Erro ao devolver passo
1. Em `manual-step-send/index.ts`:
   - Detectar `phone_whatsapp` começando com `sem_celular_` → retornar `400 { error: "lead_sem_whatsapp", message: "Esse lead foi importado via Excel sem celular válido." }`.
   - Trocar todas as respostas de erro para incluir `message` em PT-BR.
2. Em `LiveConversationsPanel.tsx` (`returnToStep`):
   - Mostrar `data.message || data.error` no toast em vez do genérico `e?.message`.
   - Esconder/desabilitar o botão "Devolver para…" e "Enviar passo" para leads cujo `phone_whatsapp` começa com `sem_celular_`, com tooltip "Lead sem WhatsApp — importado via Excel".

### C) Erro ao desativar IA
1. Em `setPaused()`: trocar `error.message` por `${error.message} (code=${error.code} details=${error.details})` no toast, e logar o objeto completo no console. Já permite identificar a causa no próximo clique.
2. Adicionar fallback: se o update direto falhar, chamar nova edge `customer-takeover` que roda com `service_role`, valida que o usuário é dono ou super admin, e faz o update bypassando RLS. Cobre qualquer cenário de policy que esteja barrando.
3. Garantir que `bot_paused_until` é **limpo** quando o humano assume (senão um valor antigo no futuro mantém o cron `bot-followup-checker` confuso).

### D) UX
- Badge "🤝 Humano no controle" no card do lead pausado já existe; manter e adicionar tooltip explicando que **nenhuma automação** será disparada enquanto estiver assim.
- No menu "Devolver para…" adicionar item destacado "🤖 Reativar IA (sem mudar passo)" como atalho para o caso de só querer destravar sem reescrever conversation_step.

---

## Arquivos tocados

- `supabase/functions/_shared/bot/paused.ts` (novo)
- `supabase/functions/bot-followup-checker/index.ts`
- `supabase/functions/send-scheduled-messages/index.ts`
- `supabase/functions/recover-stuck-otp/index.ts`
- `supabase/functions/ai-followup-cron/index.ts`
- `supabase/functions/bot-stuck-recovery/index.ts`
- `supabase/functions/manual-step-send/index.ts`
- `supabase/functions/customer-takeover/index.ts` (novo)
- `src/components/admin/AIAgentTab/LiveConversationsPanel.tsx`
- Memória: atualizar `mem://whatsapp/sending-logic` ou criar `mem://whatsapp/human-takeover-silence` documentando a regra de ouro.

## O que NÃO está no escopo
- Não toco no UI de Kanban / SalesFunnelCard (só leitura do `bot_paused`).
- Não mexo na lógica de qual passo é "terminal" — manter `TERMINAL_STEPS` como está.
- Não altero estrutura da tabela `customers` (colunas já existem).
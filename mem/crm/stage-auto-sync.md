---
name: CRM Stage Auto-Sync
description: Helper _shared/crm-stage-sync avança crm_deals.stage automaticamente conforme conversation_step do customer muda nos webhooks WhatsApp
type: feature
---
**Problema resolvido:** leads do WhatsApp ficavam parados em `novo_lead` para sempre porque nada movia o deal conforme o bot avançava.

**Estágios intermediários** (entre `novo_lead` e `aprovado`), criados por migration em `kanban_stages` para todos os consultores:
`novo_lead (0) → qualificando (1) → valor_conta (2) → conta_enviada (3) → doc_enviado (4) → finalizando (5) → aprovado (6) → reprovado (7) → 30/60/90/120_dias (8-11)`.

**Helper:** `supabase/functions/_shared/crm-stage-sync.ts` exporta `syncDealStageFromStep(supabase, customerId, conversationStep)`.

Mapeamento `conversation_step → stage_key`:
- `aguardando_valor_conta` → `qualificando`
- `aguardando_conta` → `valor_conta`
- `aguardando_doc_auto` / `aguardando_documento` → `conta_enviada`
- `confirmando_dados_conta` / `ask_email` / `ask_phone_confirm` → `doc_enviado`
- `finalizando` / `finalizando_cadastro` / `portal_submitting` / `aguardando_otp` → `finalizando`

Passos custom (`flow:UUID`): consulta `bot_flow_steps.step_type` e mapeia `capture_conta` → `valor_conta`, `capture_documento` → `conta_enviada`, `confirm_phone` → `doc_enviado`, `finalizar_cadastro` → `finalizando`.

**Guard-rails (críticos):**
1. Só atua em deals cujo `stage` está em `ACTIVE_FUNNEL_STAGES` (novo_lead…finalizando). Nunca toca aprovado/reprovado/30-120_dias — preserva o trabalho do `crm-auto-progress`.
2. Nunca rebaixa: usa `STAGE_ORDER` para garantir `targetOrder > currentOrder`.
3. Sem customer_id ou sem conversation_step → noop silencioso.

**Onde é chamado:** logo após o `supabase.from("customers").update(updates)` em:
- `whapi-webhook/index.ts` (linha ~752)
- `evolution-webhook/index.ts` (linha ~556)

Chamada única no chokepoint, NÃO em cada `update` espalhado pelos handlers — evita N chamadas por turno.

**Base importada (5.558 contatos sem conversation_step):** intocada. O helper só dispara quando o customer começa a conversar e o webhook seta `conversation_step`. Importações via Excel continuam em `novo_lead`.

**Frontend:** `useKanbanStages.DEFAULT_STAGES` atualizado para novos consultores também receberem os 5 estágios no primeiro fetch (auto-seed).

**NÃO mexe em:** `crm-auto-progress` (continua avançando 30/60/90/120 via cron); fluxo do bot/Camila (apenas lê `conversation_step`).

## Por que os leads estão parados

A função `crm-auto-progress` só sabe avançar quem já está em **aprovado/reprovado** (30→60→90→120 dias). Não existe nada que mova um lead de `novo_lead` para algo intermediário enquanto ele conversa com a Camila. Além disso, o Kanban hoje só tem `novo_lead` → `aprovado` / `reprovado` → `30/60/90/120 dias` — **não há estágios intermediários** para o lead "andar". Resultado: 5.558 contatos travados em `novo_lead`, mesmo os 7 que estão conversando ativamente.

## O que vou construir

### 1. Migration — novos estágios no Kanban

Inserir 5 estágios em `kanban_stages` para **cada consultor** (e sempre que um consultor novo for criado, via trigger ou seed). Ordem:

```text
novo_lead → qualificando → valor_conta → conta_enviada → doc_enviado → finalizando → aprovado / reprovado → 30/60/90/120
```

| stage_key       | label              | display_order |
|-----------------|--------------------|---------------|
| `qualificando`  | Em qualificação    | 10            |
| `valor_conta`   | Valor da conta     | 20            |
| `conta_enviada` | Conta enviada      | 30            |
| `doc_enviado`   | Documento enviado  | 40            |
| `finalizando`   | Finalizando cadastro | 50          |

(novo_lead = 0, aprovado = 60, reprovado = 70 etc — vou recalcular `display_order` para manter consistência.)

### 2. Helper compartilhado `_shared/crm-stage-sync.ts`

Exporta `syncDealStageFromStep(supabase, customerId, conversationStep)`. Lógica:

1. Busca o deal ativo do customer (`crm_deals` por `customer_id`).
2. Mapeia `conversation_step` → `stage_key` alvo:

| conversation_step (legacy ou flow:)                          | stage_key alvo  |
|---|---|
| `welcome`, `aguardando_nome`, `null`                         | `novo_lead` (não mexe) |
| nome capturado / `aguardando_valor_conta`                    | `qualificando`  |
| `aguardando_conta` / valor recebido                          | `valor_conta`   |
| `aguardando_doc_auto` / conta OCR ok                         | `conta_enviada` |
| `confirmando_dados_conta`, `ask_email`, `ask_phone_confirm`  | `doc_enviado`   |
| `finalizando`, `finalizando_cadastro`, `portal_submitting`, `aguardando_otp` | `finalizando` |

Para passos custom (`flow:UUID`), consulta `bot_flow_steps.step_type` e mapeia: `capture_conta` → `valor_conta`, `capture_documento` → `conta_enviada`, `confirm_phone` → `doc_enviado`, `finalizar_cadastro` → `finalizando`.

3. **Guard-rails (não rebaixar, não tocar base fria):**
   - Só atua se `deal.stage ∈ {novo_lead, qualificando, valor_conta, conta_enviada, doc_enviado, finalizando}`.
   - Nunca mexe em `aprovado`, `reprovado`, `30_dias`, `60_dias`, etc.
   - Só avança (`display_order` alvo > `display_order` atual) — nunca volta atrás.
   - Loga `[crm-stage] customer=X step=Y from=A → to=B`.

### 3. Invocar o helper nos webhooks

Chamar `syncDealStageFromStep(...)` **logo após cada `update({ conversation_step })`** em:

- `supabase/functions/whapi-webhook/index.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- Mesmos três espelhados em `evolution-webhook/`

Custo: 1 query extra por turno (já estamos fazendo várias). Sem cron novo.

### 4. Base importada permanece intacta

Conforme decidido: **não toco nos 5.558 já em novo_lead**. O helper só age quando o customer começa a conversar (conversation_step deixa de ser NULL). Se a base fria nunca interagir, fica em `novo_lead` para sempre — comportamento desejado.

### 5. Frontend

`useKanbanStages` já lê dinâmico de `kanban_stages` ordenado por `display_order`, então o Kanban automaticamente mostra as 5 colunas novas sem nenhuma mudança de UI. Vou só verificar que `KanbanBoard` não tem largura fixa quebrando com mais colunas.

### 6. Teste

Test Deno em `_shared/crm-stage-sync_test.ts`:
- step `aguardando_valor_conta`, deal em `novo_lead` → vira `qualificando`.
- step `aguardando_doc_auto`, deal em `aprovado` → **não mexe** (guard-rail).
- step `welcome`, deal em `qualificando` → **não rebaixa**.
- step `flow:UUID` (capture_conta) → vira `valor_conta`.

### Fora de escopo

- Não reativo (não vou rodar cron pra "recuperar" os 5558 antigos).
- Não toco em `crm-auto-progress` (continua cuidando do pós-aprovação 30/60/90/120).
- Não mexo em fluxo do bot/Camila, só leio o `conversation_step`.

### Arquivos

- **Migration:** inserir 5 stages em `kanban_stages` para todos os consultores existentes + criar/atualizar trigger de seed para novos consultores.
- **Novo:** `supabase/functions/_shared/crm-stage-sync.ts` + `_test.ts`.
- **Edit:** `whapi-webhook/{index,bot-flow,conversational/index}.ts` + 3 espelhados em `evolution-webhook/`.
- **Memory:** atualizar `mem/crm/automation-logic` com o novo fluxo mid-funnel.

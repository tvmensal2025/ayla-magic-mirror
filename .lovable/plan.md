## Objetivo

Quando o switch "IA ativa para meus leads" estiver OFF, os webhooks devem agir como se o WhatsApp estivesse **desconectado**: nenhum lead novo é criado, nenhuma notificação dispara, nenhuma conversa é registrada, nenhuma extração roda. Apenas retorna `ok` silenciosamente.

Hoje o gate `isConsultantAIDisabled` existe, mas só bloqueia **depois** de criar customer, disparar `notifyNewLead`, rodar self-intro etc. Para o consultor, parece que "ainda está chegando coisa".

## Mudanças

### 1. `supabase/functions/whapi-webhook/index.ts`
- Mover o bloco `isConsultantAIDisabled(supabase, superAdminConsultantId)` para **logo após** resolver `superAdminConsultantId` e antes de:
  - `find-customer` / criação de customer (linha ~349)
  - `notifyNewLead` (linhas 381 e 401)
  - extração self-intro e qualquer `update`/`insert`
- Quando desligado: retornar `{ ok: true, msg: "global_ai_disabled_silent" }` sem tocar em `customers` nem `conversations`. Apenas um `console.log` curto.
- Remover o bloco antigo (linhas ~456-486) que ficava no meio do fluxo.

### 2. `supabase/functions/evolution-webhook/index.ts`
- Mesma mudança: mover o `isConsultantAIDisabled(supabase, instanceData.consultant_id)` para imediatamente após o lookup da instância (após linha ~94), antes de qualquer `notifyNewLead`, criação de customer e processamento.
- Retornar silenciosamente.

### 3. Validação
- Confirmar via `supabase--edge_function_logs` que, com switch OFF, novos números não criam linhas em `customers` nem `conversations` e que `notifyNewLead` não dispara.

## Não faz parte
- UI do switch e migration de backfill — já feitos no loop anterior.
- Lógica de reativação — quando o switch volta a ON, futuros inbounds passam normalmente pelo fluxo (sem necessidade de "ressuscitar" leads que nunca foram criados).
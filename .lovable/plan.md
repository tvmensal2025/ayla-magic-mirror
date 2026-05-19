## Auditoria: gate "IA globalmente desligada" nos webhooks

Validei os dois webhooks (`whapi-webhook`, `evolution-webhook`), o helper compartilhado (`_shared/bot/paused.ts`) e os crons automáticos. O gate principal está funcionando — os logs confirmam `🛑 [global-off-silent] IA desligada — ignorando inbound de 5519993298325`. Mas há 4 buracos que merecem correção para garantir "silêncio total" quando o switch está OFF.

### Findings

**1. Crons automáticos NÃO checam o switch global** (risco alto)
- `ai-followup-cron`: dispara `ai-sales-agent` para qualquer lead com `next_followup_at` vencido, filtrando apenas por `bot_paused=false` e `assigned_human_id is null`. A migration de backfill marcou todos os 922 leads atuais como `bot_paused=true`, então hoje está OK — mas se o consultor religar a IA, gerar novos `next_followup_at` e desligar de novo, esses leads voltam a ser disparados (a migration não roda de novo).
- `bot-stuck-recovery`: mesma lógica — chama `ai-sales-agent` para leads parados sem checar `ai_agent_config.enabled`.
- `send-scheduled-messages`: envia mensagens agendadas pelo usuário; provavelmente OK manter (é ação humana explícita), mas vale confirmar.

**Correção sugerida**: nos dois primeiros, agrupar leads por `consultant_id` e descartar os de consultor com `isConsultantAIDisabled=true` antes do disparo. Reutilizar `_shared/bot/paused.ts` (já cacheia 5s).

**2. `outboundHuman` (whapi linhas 66–103) roda ANTES do gate**
Quando o consultor digita pelo celular, o bloco tenta encontrar o customer e marcar `bot_paused=true`. Com o switch OFF nenhum customer existe → cai no `console.warn` "Nenhum customer encontrado". Comportamento inofensivo, mas polui log e gera leitura de DB desnecessária. Mover o gate para antes do bloco `outboundHuman` (logo após resolver `superAdminConsultantId`, hoje ele depende de settings lidos depois).

**3. Dedup é consumido mesmo com IA desligada**
`checkAndMarkProcessed` roda na linha 136 do whapi e 120 do evolution, antes do gate. Cada inbound silenciado ainda escreve em `webhook_message_dedup`. Não quebra nada, só cresce a tabela. Mover o gate para antes do dedup (depende de #2: precisamos do `consultant_id` antes — no whapi vem de `settings`, no evolution vem de `instances` lookup, ambos disponíveis antes do dedup).

**4. Default "ativo" quando `ai_agent_config` não existe**
`isConsultantAIDisabled` retorna `false` quando não há linha em `ai_agent_config` para o consultor (linha 77 de `paused.ts`). Isso é correto historicamente, mas significa que o switch UI **precisa fazer upsert** (não update simples), senão o primeiro OFF do consultor não persiste. Verificar `AIAgentTab/index.tsx` — se já faz upsert, OK; documentar.

### Pontos OK (confirmados)
- Gate retorna `{ ok:true }` silencioso em ambos webhooks (sem 4xx que faria Whapi/Evolution reenfileirar).
- Cache de 5s evita query repetida por inbound.
- `notifyNewLead`, criação de customer e bot-flow não rodam mais quando switch OFF (gate está antes deles).
- OTP intercept também é bloqueado pelo gate — comportamento desejado segundo o pedido de "como se desconectado".
- Migration anterior já marcou os 922 leads existentes como pausados.

### Mudanças propostas

#### A. `_shared/bot/paused.ts`
Nenhuma mudança necessária. Cache + função já prontos para reuso.

#### B. `supabase/functions/ai-followup-cron/index.ts`
Após buscar leads, deduplicar `consultant_id`s e, para cada um, pular se `isConsultantAIDisabled(supabase, consultant_id)` for true. Adicionar contador `skipped_global_off` no retorno.

#### C. `supabase/functions/bot-stuck-recovery/index.ts`
Mesma abordagem: agrupar por `consultant_id`, descartar quando IA do consultor estiver OFF, somar a `stats.skipped_offline` (ou novo `skipped_global_off`).

#### D. `supabase/functions/whapi-webhook/index.ts`
- Mover lookup de `settings` (linhas 145–155) e resolução de `superAdminConsultantId` (linha 200–208) para **antes** do bloco `outboundHuman` (linha 66) e do `checkAndMarkProcessed` (linha 136).
- Manter o gate `isConsultantAIDisabled` imediatamente após resolver o consultor.
- Resultado: nem outboundHuman nem dedup tocam DB quando switch OFF.

#### E. `supabase/functions/evolution-webhook/index.ts`
- Mover o bloco do gate (linhas 150–156) para **antes** do `checkAndMarkProcessed` (linha 120). O `instanceData.consultant_id` já está disponível desde a linha 94.

#### F. `src/components/admin/AIAgentTab/index.tsx` (verificação rápida)
Confirmar que o toggle persiste via `upsert` em `ai_agent_config`, não `update`. Se for `update`, trocar para `upsert(..., { onConflict: 'consultant_id' })`.

### Validação
1. `supabase--curl_edge_functions` no `ai-followup-cron` com switch OFF → deve retornar `success: 0, skipped_global_off: N`.
2. Inspecionar logs do whapi-webhook com switch OFF: não deve aparecer mais "Nenhum customer encontrado" nem inserts em `webhook_message_dedup`.
3. Religar switch e enviar inbound → fluxo normal volta em ≤5s (TTL do cache).

### Fora de escopo
- UI do switch (já feita).
- Lógica de reativação seletiva (já documentada em `mem/whatsapp/human-takeover-silence.md`).
- `send-scheduled-messages` (mensagens manuais do operador — manter como está, salvo decisão contrária do usuário).
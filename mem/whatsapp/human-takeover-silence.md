---
name: Human Takeover & Global AI Off — silêncio total da IA
description: Regras únicas para silenciar TODOS os motores automáticos quando humano assume um lead OU quando o switch global "IA ativa para meus leads" está OFF.
type: feature
---

## Bloqueios absolutos (qualquer um silencia toda automação)

1. `customers.bot_paused = true`
2. `customers.assigned_human_id IS NOT NULL`
3. `customers.bot_paused_until > now()`
4. `ai_agent_config.enabled = false` para `consultant_id` do lead (switch global do consultor)

## Helper único — `supabase/functions/_shared/bot/paused.ts`

- `isCustomerPausedByHuman(customer)` — checa 1, 2, 3 em memória.
- `isPausedByPhone(supabase, phone, consultantId?)` — checa no DB por telefone.
- `isConsultantAIDisabled(supabase, consultantId)` — checa 4 com cache de 5s.
- `isAutomationBlocked(supabase, customer, consultantId)` — combina tudo, retorna `{blocked, reason}`.

## Pontos de enforcement (todos chamam o helper)

- `whapi-webhook/index.ts` — antes do bot-flow, ao entrar inbound:
  - Se `isConsultantAIDisabled` → registra inbound, pausa o customer com `manual_global_pause`, retorna. **Cobre leads novos.**
  - Se `isCustomerPausedByHuman` → registra inbound, retorna.
- `evolution-webhook/index.ts` — espelha a mesma ordem.
- `ai-sales-agent/index.ts` — aborta se humano assumiu OU consultor desligado.
- `ai-agent-router/index.ts` — não cai mais no global enabled=true se o consultor explicitamente desativou.
- `crm-auto-progress/index.ts` — auto-mensagens de Kanban só enviam se IA do consultor estiver ON e o customer não estiver pausado.

## UI — `/admin` → aba IA

- Switch `IA ativa para meus leads`:
  - OFF: grava `ai_agent_config.enabled=false` E pausa **TODOS** os leads do consultor (não só `bot_paused=false/null`), com `bot_paused_reason='manual_global_pause'` e `assigned_human_id=userId`.
  - ON: religa apenas os leads pausados com `manual_global_pause` — `humano_assumiu` permanece humano.
- Botão "Parar IA em todos os meus leads" — mesmo update de `manual_global_pause` em todo o consultor.
- Botão "Religar IA" — só leva de volta para a IA quem foi pausado com `manual_global_pause`.

## Auto-takeover frontend

- `auto-takeover.ts` é disparado em qualquer envio manual (texto, áudio, imagem, vídeo, documento) e marca `bot_paused=true`, `assigned_human_id=userId`, `bot_paused_reason="humano_assumiu*"`. Fallback: edge `customer-takeover` para super admin atuando em customer de outro consultor.

## Backfills aplicados

- 2026-05-19: leads de consultores com `enabled=false` reforçados em `manual_global_pause` (838 do super admin).

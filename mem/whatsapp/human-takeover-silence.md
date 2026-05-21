---
name: Human Takeover & Global AI Silence
description: Bloqueios absolutos da IA — humano assumiu OU consultor desligou IA — aplicados em webhooks e TODOS os crons.
type: feature
---

# Silêncio total da IA

Quando QUALQUER um destes for verdade, NENHUM motor automático envia mensagem:
- `customers.bot_paused === true` (consultor clicou "Assumir") — **exceção:** `bot_paused_reason === 'manual_capture'` NÃO silencia. Modo Captação é assistido: o consultor envia o prompt manualmente, mas o bot precisa continuar processando a resposta do lead (OCR conta/doc, captura de campos, avanço do passo). `CaptureSheet` não pausa mais o bot ao enviar passos.
- `customers.assigned_human_id IS NOT NULL` (humano vinculado)
- `customers.bot_paused_until > now()` (pausa programada)
- `ai_agent_config.enabled === false` para o `consultant_id` (switch global desligado)

## Helper canônico

`supabase/functions/_shared/bot/paused.ts`:
- `isCustomerPausedByHuman(customer)` — 3 primeiras regras
- `isPausedByPhone(supabase, phone, consultantId?)` — variante para crons sem customer carregado
- `isConsultantAIDisabled(supabase, consultantId)` — checa `ai_agent_config.enabled` com cache de 5s
- `isAutomationBlocked(supabase, customer, consultantId)` — combinado

## Pontos de aplicação

### Webhooks inbound (silêncio total quando IA desligada — como se desconectado)
- `whapi-webhook`: gate `isConsultantAIDisabled(superAdminConsultantId)` é a PRIMEIRA coisa após `parseWhapiMessage`, ANTES de outboundHuman, dedup, customer-create, notifyNewLead, OTP. Quando OFF retorna `{ ok:true, msg:"global_ai_disabled_silent" }`.
- `evolution-webhook`: mesmo padrão — gate logo após `instances` lookup, antes de `parseEvolutionMessage`/dedup.

### Crons automáticos (descartam leads de consultor com IA OFF)
- `ai-followup-cron`: por lead, checa `isConsultantAIDisabled(lead.consultant_id)`. Se OFF, limpa `next_followup_at` e pula (`reason: skipped_global_ai_off`).
- `bot-stuck-recovery`: por lead, checa `isConsultantAIDisabled(lead.consultant_id)`. Se OFF, incrementa `stats.skipped_global_off` e pula.
- `ai-sales-agent`, `ai-agent-router`, `crm-auto-progress`: já checam helper.

## UI — switch "IA ativa para meus leads"

`src/components/admin/AIAgentTab/index.tsx`:
- OFF: persiste `ai_agent_config.enabled=false` E faz UPDATE em massa de TODOS os customers do consultor com `bot_paused=true, bot_paused_reason="manual_global_pause", assigned_human_id=userId`.
- ON: persiste `enabled=true` E reativa SÓ os leads com `bot_paused_reason="manual_global_pause"` (preserva takeovers humanos reais).
- `saveConfig` faz select→update OR insert (equivalente a upsert) — garante que o primeiro OFF cria a linha.

## Reflexo temporal

Cache `_aiEnabledCache` (5s TTL) em `paused.ts` evita query repetida por inbound. Religar/desligar reflete em até 5s nos webhooks. Crons leem direto do DB.

## Backfill histórico

Migration `20260519203812_*.sql` aplicou `bot_paused=true, bot_paused_reason='manual_global_pause'` em todos os leads do consultor com `ai_agent_config.enabled=false` no momento (838 leads). Para consultores que desligarem depois, o próprio toggle faz o update em massa.

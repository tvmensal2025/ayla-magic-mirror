---
name: Evolution Whapi Parity
description: evolution-webhook tem paridade total com whapi-webhook (custom flow engine, conversational, FAQ, handoff, reentry notify); whapi continua apenas para super admin
type: feature
---

# Paridade Evolution ↔ Whapi (qualquer consultor)

## Arquitetura final

- **whapi-webhook**: SOMENTE super-admin (`settings.superadmin_consultant_id`). Endpoint único, token único.
- **evolution-webhook**: TODOS os outros consultores. Identifica instância por `body.instance` em `whatsapp_instances`.
- Frontend (`useWhatsApp`/`useChats`/`useMessages`) já roteia: `isWhapi=true` só quando `consultantId === settings.superadmin_consultant_id`.

## Módulos compartilhados (espelhados verbatim de whapi → evolution)

- `handlers/bot-flow.ts` — 4217 linhas. Resolver de `bot_flow_steps` (UUID/`flow:<id>`/`passo_<ts>`), `dispatchStepFromFlow` (ordem text→audio→video→image), transitions por `trigger_phrases`, anti-rep `last_custom_prompt_at` (10 min), `matchQA` (FAQ), `notifyHandoff` (pergunta fora do FAQ pausa bot).
- `handlers/conversational/` — runConversationalFlow + intent-classifier + rules-engine + state-machine + templates (motor novo do `bot_flow_steps`).
- `handlers/step-namespace.ts` — `routeEngine`, `stripPrefix`, `normalizeOutgoing` (prefixo `flow:` vs cru).

Trocar apenas a camada de envio: `ctx.sender` = `createEvolutionSender` para Evolution; `createWhapiSender` para Whapi. Tudo o mais é idêntico.

## index.ts (evolution-webhook) — features obrigatórias

1. Select consultant com `conversational_flow_enabled`.
2. `notifyNewLead` em criação E em reentrada (sem inbound nas últimas 24h).
3. Routing engine `sys` vs `flow` (igual whapi linhas 609-693): se há `bot_flows` ativo com steps e step não é cadastro, força `engine="flow"` e zera `conversation_step` para o motor restartar no firstActive.
4. `runBotFlow` (sys, pipeline OCR/cadastro) ou `runConversationalFlow` (flow, DB-driven).
5. Strip `__*` keys antes do `customers.update`.
6. `normalizeOutgoing(updates.conversation_step, engineUsed)` antes de persistir.
7. `logStepTransition` com `stripPrefix(updates.conversation_step)`.

## Sem mudança de schema

Todas as colunas necessárias já existem: `last_custom_prompt_at`, `bot_paused`, `pending_inbound_message_id`, `notification_phone`, `conversational_flow_enabled`.

## Como validar um consultor novo

1. Cria consultor → trigger `seed_camila_flow_on_consultant_insert` semeia o FluxoCamila.
2. `/admin/whatsapp` → cria instância (`igreen-{slug}`) → webhook auto-configurado para `/functions/v1/evolution-webhook`.
3. Conecta QR → `CONNECTION_UPDATE.open` grava `connected_phone`.
4. Lead manda mensagem → router pega `bot_flows` ativo → `runConversationalFlow` → fluxo customizado roda.
5. `notifyNewLead` chega no `notification_phone` do consultor.
6. Pergunta fora do FAQ → `notifyHandoff` + `bot_paused`.
7. Painel `/admin/whatsapp` lista o chat via `findChats(instanceName)` (Evolution), não Whapi.

## Secrets obrigatórios na edge function

- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`
- `GEMINI_API_KEY` (OCR)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injetados)
- `WHAPI_TOKEN` (só para whapi-webhook)

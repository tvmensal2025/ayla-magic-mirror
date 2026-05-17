---
name: Custom Flow Step Engine
description: Resolver de bot_flow_steps em whapi-webhook executa passos message/capture_*/finalizar_cadastro do FluxoCamila sem travar
type: feature
---
Em `supabase/functions/whapi-webhook/handlers/bot-flow.ts`, antes do `switch (step)` (linha ~1845) há um resolver que detecta `conversation_step` UUID ou step_key custom (não-legacy) e busca em `bot_flow_steps`. Mapeia step_type → legacy step para roteamento:
- capture_conta → aguardando_conta
- capture_documento/capture_doc → aguardando_doc_auto
- capture_email → ask_email
- confirm_phone → ask_phone_confirm
- finalizar_cadastro → finalizando
- message → avança para próximo passo ativo por position (dispatchStepFromFlow), conversation_step vira UUID do próximo (ou legacy mapping)

Pós-`confirmando_dados_conta` (linha ~2347): `findNextActiveFlowStep` SEM filtro de step_type — pega o próximo por position, qualquer tipo. Permite passos intermediários 1..N (pitch, vídeo, FAQ) sem serem pulados.

`default:` do switch (linha ~3461): se há fluxo custom ativo, NUNCA reseta para aguardando_conta — faz redispatch idempotente do passo atual.

Notificação `notifyNewLead` em `whapi-webhook/index.ts` dispara também em reentrada: customer existente sem inbound nas últimas 24h. Dedup 60s no helper.

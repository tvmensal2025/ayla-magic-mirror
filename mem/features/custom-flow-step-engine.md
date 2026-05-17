---
name: Custom Flow Step Engine
description: Resolver de bot_flow_steps em whapi-webhook executa passos message/capture_*/finalizar_cadastro do FluxoCamila sem travar e sem pular conteúdo
type: feature
---
Em `supabase/functions/whapi-webhook/handlers/bot-flow.ts`, antes do `switch (step)` (linha ~1845) há um resolver que detecta `conversation_step` UUID ou step_key custom (não-legacy) e busca em `bot_flow_steps`. Mapeia step_type → legacy step para roteamento:
- capture_conta → aguardando_conta
- capture_documento/capture_doc → aguardando_doc_auto
- capture_email → ask_email
- confirm_phone → ask_phone_confirm
- finalizar_cadastro → finalizando
- message → **dispatchStepFromFlow(stepRow.step_key) ANTES de avançar** (emite mídia/texto do passo atual; anti-rep 10min cuida da idempotência), depois avança para o próximo por position

Pós-`confirmando_dados_conta` (linha ~2347): `findNextActiveFlowStep` SEM filtro de step_type — pega o próximo por position, qualquer tipo.

`default:` do switch: se há fluxo custom ativo, NUNCA reseta para aguardando_conta — faz redispatch idempotente.

Notificação `notifyNewLead` em `whapi-webhook/index.ts` dispara em criação E em reentrada (sem inbound 24h). O helper `_shared/notify-consultant.ts → sendRawToAlertNumber` envia via **Whapi primeiro** (WHAPI_TOKEN + WHAPI_API_URL), fallback Evolution só se Whapi indisponível e instância Evolution não estiver em `needs_reconnect`.

`extractValor` em `_shared/captureExtractors.ts` aceita expressões de aproximação: "uns 200", "cerca de 300", "200 mais ou menos", "aproximadamente 450", "por volta de 500", "em torno de", "quase", "talvez". Exporta também `extractValorPermissivo` para fallback contextual (qualquer número 30..50000 na msg).

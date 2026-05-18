---
name: Custom Flow Step Engine
description: Resolver de bot_flow_steps em whapi-webhook executa passos message/capture_*/finalizar_cadastro do FluxoCamila honrando transitions sem pular perguntas/objeções nem duplicar prompts
type: feature
---
Em `supabase/functions/whapi-webhook/handlers/bot-flow.ts`, antes do `switch (step)` (linha ~1845) há um resolver que detecta `conversation_step` UUID ou step_key custom e busca em `bot_flow_steps` (sempre incluindo `transitions`). Mapeia step_type → legacy step:
- capture_conta → aguardando_conta
- capture_documento/capture_doc → aguardando_doc_auto
- capture_email → ask_email
- confirm_phone → ask_phone_confirm
- finalizar_cadastro → finalizando
- message → emite conteúdo atual (dispatchStepFromFlow, anti-rep 10min) e resolve próximo passo via transitions.

**Resolução de próximo passo (linha ~1929):** lê `stepRow.transitions` e:
1. Tenta match por `trigger_phrases` (intents afirmacao/negacao/etc) contra a mensagem do lead — match normaliza acentos e usa word-boundary. Se casar, segue `goto_step_id` correspondente.
2. Senão, usa transição com `trigger_intent="default"` + `goto_step_id` explícito.
3. Se há intent transitions e NENHUMA casou e não existe default → retorna `reply:""` SEM avançar (aguarda resposta válida — não pula pergunta/objeção).
4. Fallback final: `findNextActiveFlowStep(afterPosition)`.

Chain (mensagens consecutivas com default sem phrases) também segue `goto_step_id` quando presente; quebra em qualquer passo com pergunta (sem default bare).

Pós-`confirmando_dados_conta` (linha ~2347): `findNextActiveFlowStep` sem filtro de step_type.

`default:` do switch: se há fluxo custom ativo, NUNCA reseta para aguardando_conta — faz redispatch idempotente.

**Anti-duplicação de prompt:** quando o chain encerra em capture_*/confirm_phone e dispara conteúdo custom, grava `customers.last_custom_prompt_at = now()`. Handlers legacy `aguardando_conta` e `aguardando_doc_auto` (linhas 2124, 2547) verificam: se < 10 min e a mensagem não é arquivo/dado útil, retornam `reply:""` silenciosamente.

Notificação `notifyNewLead` em `whapi-webhook/index.ts` dispara em criação E em reentrada (sem inbound 24h). Helper `_shared/notify-consultant.ts → sendRawToAlertNumber` envia via Whapi primeiro, fallback Evolution.

`extractValor` em `_shared/captureExtractors.ts` aceita aproximações ("uns 200", "cerca de", etc). Exporta `extractValorPermissivo` para fallback contextual.

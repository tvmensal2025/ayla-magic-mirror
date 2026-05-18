---
name: Custom Flow Step Engine
description: Resolver de bot_flow_steps em whapi-webhook executa passos message/capture_*/finalizar_cadastro do FluxoCamila sem travar, sem pular conteúdo e sem duplicar prompts
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

**Anti-duplicação de prompt (linha ~1970, 2124, 2547):** quando o chain encerra em um passo capture_*/confirm_phone e dispara o conteúdo custom (com texto que o consultor escreveu), grava `customers.last_custom_prompt_at = now()`. Os handlers legacy `aguardando_conta` e `aguardando_doc_auto` verificam esse timestamp: se < 10 min e a mensagem do lead não é arquivo nem dado útil, retornam `reply: ""` silenciosamente em vez de mandar o prompt hardcoded antigo. Isso evita o balão duplicado ("me manda foto da conta de luz" custom + "me manda uma foto (ou PDF) da sua conta..." legacy).

**Steps de pergunta no FluxoCamila não têm `default` bare:** passos como "Perguntando se pode explicar" (pos 6) e "Deu para entender?" (pos 9) têm apenas transições com `trigger_phrases` (afirmacao/negacao). O chain do resolver quebra ao encontrá-los (hasAutoAdvance=false), fazendo o bot esperar a resposta do cliente antes de avançar.

Notificação `notifyNewLead` em `whapi-webhook/index.ts` dispara em criação E em reentrada (sem inbound 24h). O helper `_shared/notify-consultant.ts → sendRawToAlertNumber` envia via **Whapi primeiro** (WHAPI_TOKEN + WHAPI_API_URL), fallback Evolution só se Whapi indisponível e instância Evolution não estiver em `needs_reconnect`.

`extractValor` em `_shared/captureExtractors.ts` aceita expressões de aproximação: "uns 200", "cerca de 300", "200 mais ou menos", "aproximadamente 450", "por volta de 500", "em torno de", "quase", "talvez". Exporta também `extractValorPermissivo` para fallback contextual (qualquer número 30..50000 na msg).

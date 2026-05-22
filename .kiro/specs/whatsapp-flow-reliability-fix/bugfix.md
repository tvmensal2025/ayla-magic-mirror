# Bugfix Requirements Document — WhatsApp Flow Reliability Fix

## Introduction

O fluxo de conversa por WhatsApp (Evolution API → `evolution-webhook` → `ai-agent-router` / `bot-flow` / `runConversationalFlow`) apresenta sete defeitos de confiabilidade observados em produção, com muitos consultores e clientes simultâneos:

1. Perda silenciosa de mídias (imagem, áudio, documento, PDF) — o cliente envia o arquivo, o sistema engole o erro e a mídia nunca é processada nem persistida.
2. Envio duplicado de mensagens — eventualmente o mesmo passo é entregue duas vezes ao mesmo cliente.
3. Fluxo inconsistente — o bot envia uma mensagem que não corresponde ao passo atual, "pulando" ou "voltando" sem motivo.
4. Passo errado da sequência — o motor envia um passo fora da ordem definida em `bot_flow_steps`.
5. Tempo irreal entre passos — mensagens são entregues instantaneamente (sem "digitando…" / sem delay) ou ficam travadas além do esperado.
6. Alucinação da IA — o `ai-agent-router` (Camila) responde com texto que não existe na base de conhecimento, com link/preço/comissão inventados, ou com mídia que não está cadastrada para o consultor.
7. Falhas em escala — quando dois webhooks chegam quase ao mesmo tempo para o mesmo cliente, ou muitos clientes diferentes em paralelo, o estado fica corrompido (passos pulados, deduplicação ineficaz, rate limit inconsistente).

Este bugfix é **conservador**: a estrutura existente (Evolution API direta, `bot_flows`/`bot_flow_steps` no Supabase, `ai-agent-router`, MinIO para mídias inbound, `webhook_message_dedup`, `try_log_media_send`) deve permanecer. Apenas as condições defeituosas listadas em cada item da seção 1 abaixo devem mudar de comportamento. Tudo que já funciona (cadastro, OCR, portal, OTP, handoff humano, Q&A, slots da Camila, polling de conexão, anti-loop, anti-dup textual de 60s) deve continuar funcionando exatamente como hoje.

## Bug Analysis

### Current Behavior (Defect)

Cada cláusula abaixo descreve um sintoma defeituoso observado em produção. As cláusulas estão agrupadas por sub-bug para legibilidade (B1–B7), mas todas pertencem à mesma seção "Current Behavior" (X=1).

**B1 — Perda silenciosa de mídia**

1.1 WHEN o cliente envia uma imagem/documento/áudio e `sender.downloadMedia(key, message)` retorna `null` (Evolution API timeout, 4xx, 5xx ou exceção) THEN o sistema apenas loga `❌ Falha total ao baixar mídia` e segue o fluxo com `fileUrl=null` e `fileBase64=null`, sem reentregar, sem reagendar, sem avisar o cliente, e o cliente fica esperando indefinidamente em `aguardando_conta`/`aguardando_doc_*`.

1.2 WHEN `downloadMedia` retorna base64 mas o upload subsequente para o MinIO falha (`uploadToMinioPath` lança) THEN o sistema apenas loga `📦⚠️ inbound media MinIO falhou` e descarta a URL pública, perdendo o registro permanente da mídia mesmo quando o OCR/IA já conseguiu lê-la.

1.3 WHEN o cliente envia mídia em um passo conversacional (welcome, qualificacao, flow:*) e o `runConversationalFlow` redireciona para `bot-flow.ts` com `conversation_step=aguardando_conta` mas `downloadMedia` falhou no mesmo turno THEN o `bot-flow` não tem `fileBase64` para rodar o OCR e responde como se nenhuma mídia tivesse sido recebida, deixando o cliente em loop pedindo a foto da conta.

1.4 WHEN a Evolution API entrega o webhook com `imageMessage.url` ou `documentMessage.url` mas sem `message.message` válido para o endpoint `/chat/getBase64FromMediaMessage` THEN o sistema cai no fallback `extractMediaUrl(message)` mas usa essa URL diretamente como `fileUrl`, sem baixar o conteúdo nem persistir, e qualquer download subsequente que dependa de cookies/headers da Evolution falha silenciosamente.

1.5 WHEN o cliente envia áudio (`audioMessage`) THEN o `parseEvolutionMessage` não inclui áudio em `isFile` (apenas imagem e documento), portanto a Edge Function não tenta baixar o áudio nem salvá-lo em MinIO nem transcrevê-lo, mesmo quando a IA conversacional precisaria do transcript para responder.

**B2 — Envio duplicado de mensagens**

1.6 WHEN a Evolution API redentrega o mesmo webhook por timeout (mesmo `data.key.id`) e a Edge Function já está processando a primeira tentativa em paralelo THEN ambas execuções leem `customers.conversation_step` antes que a primeira tenha gravado os updates, ambas passam pelo `checkAndMarkProcessed` com resultado `false` para a segunda apenas se a primeira já gravou (race), e ambas chegam ao bloco `sender.sendText`, entregando a mesma mensagem duas vezes.

1.7 WHEN o `sendWithRetry` em `evolution-api.ts` recebe `5xx` da Evolution após o servidor já ter aceitado a mensagem (cenário "200 perdido por timeout") THEN o helper aplica `attempt = 2` e `attempt = 3` com backoff `300ms / 900ms`, enviando a mesma mensagem 2 ou 3 vezes ao WhatsApp do cliente.

1.8 WHEN o anti-dup textual de 60s em `evolution-webhook/index.ts` (compara `message_text` exato dos últimos 60s) recebe duas respostas com textos ligeiramente diferentes (ex.: variável `{{nome}}` que renderizou strings diferentes em duas execuções concorrentes, ou um espaço/emoji a mais) THEN o filtro não detecta a duplicidade e ambas mensagens são enviadas.

1.9 WHEN o `runConversationalFlow` envia mídia inline via `sendStepMedia` E em seguida o `evolution-webhook` envia o `finalReply` no bloco `─── 10) Send reply ───` no mesmo turno THEN o cliente recebe a mídia + o texto novamente, porque a mídia foi enviada inline mas o `reply` do handler ainda contém o `message_text` configurado do passo (sem que `__inline_sent=true` desligue o caminho de texto duplicado em todos os ramos).

1.10 WHEN o `ai-agent-router` envia áudio do slot e o mesmo turno também envia `decision.reply_text` E o `evolution-webhook` (em chamada paralela disparada pelo mesmo webhook por causa do `aiShouldHandle`) também envia uma reply de fallback THEN o cliente recebe áudio + texto da Camila + texto do bot-flow para o mesmo input.

**B3 — Fluxo inconsistente / passo errado / fora de ordem**

1.11 WHEN dois webhooks consecutivos chegam para o mesmo `customer_id` (cliente mandou duas mensagens em <2s) e o primeiro ainda está processando THEN ambos leem o mesmo `conversation_step` (ex.: `flow:passo_3`), ambos calculam o próximo passo, ambos gravam `updates.conversation_step` separadamente, e o cliente recebe mensagens dos DOIS passos, fora da ordem do funil.

1.12 WHEN o customer está em um step de cadastro (`aguardando_conta`, `ask_cpf`, etc.) e o consultor liga `conversational_flow_enabled=true` no meio da conversa THEN o roteador "🚀 FONTE ÚNICA DE VERDADE" força `engine=flow` e zera `conversation_step` para `null`, fazendo o cliente recomeçar o fluxo do zero e perder o cadastro em andamento.

1.13 WHEN o `runConversationalFlow` detecta arquivo recebido em step conversacional e redireciona para `bot-flow.ts` com `conversation_step=aguardando_conta` THEN o passo legado é executado, mas se o consultor tinha um `flow:*` configurado para tratar a mídia, esse fluxo é ignorado, e o lead pula direto para o cadastro hardcoded em vez do passo configurado em `bot_flow_steps`.

1.14 WHEN o `auto-resume` reseta `status` para `pending` mas o `conversation_step` é normalizado por `normalizeOutgoing` com prefixo errado (engine `sys` recebendo step com prefixo `flow:` ou vice-versa) THEN a próxima mensagem do cliente é roteada pelo motor errado e responde uma mensagem que não pertence à etapa atual.

1.15 WHEN o cliente clica em um botão (`buttonId`) e o `parseEvolutionMessage` extrai `buttonId` mas o `messageText` fica vazio THEN handlers que ramificam por `messageText` (ex.: matching de FAQ por trigger phrase, classificador de intenção que ignora `buttonId`) não casam o input com o passo configurado e disparam o template `fallback`/`nao_entendi` em vez do passo correto da sequência.

1.16 WHEN um passo configurado em `bot_flow_steps` tem `position` reordenado pelo consultor no `/admin/fluxos` enquanto há clientes ativos cujo `conversation_step` aponta para um `step_key` que mudou de posição THEN o cliente recebe o passo na ordem antiga (mantida pelo `step_key` salvo) ou pula passos novos inseridos no meio, sem migração consistente.

**B4 — Passo errado da sequência (variante de B3 sob carga)**

1.17 WHEN o `aiShouldHandle` é avaliado como `true` (cliente em `welcome` com `ai_agent_config.enabled=true`) E o mesmo customer já tem um `bot_flow_steps` com passo de abertura configurado THEN o `evolution-webhook` invoca `ai-agent-router` (que envia áudio "boas_vindas" + reply) E o passo determinístico do flow do consultor para o mesmo step nunca é executado, mesmo quando o consultor configurou explicitamente uma sequência inicial.

1.18 WHEN o `ai-agent-router` decide `next_step` mas a IA escolhe um valor de `FUNNEL_STEPS` (ex.: `coleta_conta`) que não existe como `step_key` em `bot_flow_steps` do consultor THEN o customer é gravado com um step órfão e a próxima mensagem cai em fallback genérico em vez do passo configurado.

1.19 WHEN o `runConversationalFlow` falha em casar a mensagem com nenhuma `transition` do passo atual e o `fallback.mode = "ai"` chama `aiDecideFallback` THEN a IA retorna um `step_key` válido mas que pertence a uma ramificação não-linear do funil, fazendo o lead saltar para um passo distante sem ter cumprido as pré-condições do passo intermediário.

1.20 WHEN o handler "foto recebida fora de hora" redireciona para `aguardando_conta` com `__inline_sent=true` E o consultor desativou `consultant_flag=conversational_flow_enabled=false` THEN o engine é forçado para `sys` mas o `conversation_step=aguardando_conta` foi setado pelo redirect, e o `bot-flow.ts` legado recebe um step que ele não esperava no contexto do customer atual.

**B5 — Tempo irreal entre passos**

1.21 WHEN o passo configurado tem `text_delay_ms` muito pequeno (ex.: 0 ou 100ms) ou `delay_before_ms` na mídia muito pequeno THEN o cliente recebe áudio + texto + mídia em rajada (<500ms entre eles), claramente robotizado.

1.22 WHEN o passo tem múltiplas mídias em sequência e o `sleepForMedia` foi reduzido para `min(configuredDelay, 5_000)` para evitar timeout da Edge Function (60s) THEN o áudio de 30s ainda está tocando no celular do cliente quando a próxima mídia chega, criando sobreposição.

1.23 WHEN o `humanDelayMs` no `evolution-webhook` é calculado como `min(14000, max(3500, 3000 + length*60))` e a resposta tem 5 caracteres ("oii 😊") THEN o cliente espera 3.5s para receber 5 chars (lento demais), enquanto uma resposta de 200 chars demora os mesmos 14s (máximo), distribuição não-realista.

1.24 WHEN o `sendPresence` (typing) falha silenciosamente porque a Evolution API retorna 4xx/5xx no endpoint `/chat/sendPresence` THEN o "digitando…" não aparece no celular do cliente, mas o delay de 3.5s-14s é executado mesmo assim, fazendo o cliente esperar sem feedback visual.

1.25 WHEN o `ai-agent-router` aplica `should_pause_seconds` (0–8s) decidido pela IA sem somar com o `humanDelayMs` posterior do `evolution-webhook` THEN existem dois delays serializados (IA pause + edge delay), totalizando >20s, e o cliente percebe travamento.

1.26 WHEN o `runConversationalFlow` está enviando uma sequência de mídias e a Edge Function se aproxima do timeout (60s) THEN a última mídia/texto da sequência é cortada pelo runtime do Deno e o cliente recebe apenas parte do passo, sem feedback de erro.

**B6 — IA alucina ou erra ao responder**

1.27 WHEN o LLM (`gemini-2.5-flash`) retorna `decision.reply_text` com texto que viola as REGRAS DURAS do system prompt (cita preço, prazo, comissão, link inventado, ou diz "sou assistente virtual") E o `sanitizeHumanReply` só verifica regex contra um conjunto limitado de palavras proibidas E `length<=280` THEN texto alucinado passa pelo filtro e é enviado ao cliente como se fosse a Camila.

1.28 WHEN o LLM retorna `decision.media_to_send_ids` contendo um `id` que não está em `relevantMedia` (alucinação de ID inexistente) THEN o `ai-agent-router` tenta carregar a mídia da `ai_media_library`, recebe `null`, e silenciosamente não envia nada e o cliente fica sem resposta.

1.29 WHEN o LLM retorna `audio_slot_key` com um valor que não está em `validSlotKeys` THEN o sistema apenas loga `slot_key inválido` e segue, mas o `decision.reply_text` foi limpo para `""` em outras ramificações (ex.: primeiro contato), resultando em silêncio total ao cliente.

1.30 WHEN o LLM falha (timeout, 429, 5xx) e o fallback `decision = { reply_text: "", media_to_send_ids: [], audio_slot_key: "" }` é usado THEN o `ai-agent-router` retorna `ok` ao webhook mas o cliente não recebe nada, e o `evolution-webhook` já fez `return new Response({ ok: true, mode: "ai_agent" })` sem fallback determinístico.

1.31 WHEN o LLM retorna `next_step="cadastro_portal"` para um customer que ainda não tem `electricity_bill_value` nem `document_uploaded` THEN o `ai-agent-router` grava `conversation_step=cadastro_portal` mesmo violando a regra "para avançar para cadastro_portal o cliente precisa ter aceitado a proposta e ter conta de luz + documento enviados" do system prompt.

1.32 WHEN o `answerFaqWithAI` é chamado em `runConversationalFlow` e o LLM mistura conhecimento real com invenção (ex.: confunde duas distribuidoras, inventa horário de atendimento) THEN a resposta é enviada sem checagem contra `ai_knowledge_sections`, e o cliente recebe informação errada com aparência oficial.

**B7 — Falhas em escala (múltiplos consultores e clientes simultâneos)**

1.33 WHEN várias instâncias da Edge Function `evolution-webhook` rodam em paralelo (cold/warm starts em diferentes containers) THEN o `rateLimitMap = new Map<string, number[]>()` em memória local de cada instância não é compartilhado, e um cliente que dispara 10 mensagens em 5s pode passar pelo rate limiter em 3 containers diferentes (3×4 = 12 mensagens permitidas em vez do limite real de 4).

1.34 WHEN dois consultores diferentes recebem mensagens do mesmo número de telefone (cliente comum) THEN a busca de `customers` por `phone_whatsapp` + `consultant_id` é correta, mas a `webhook_message_dedup` é indexada apenas por `message_id` (UNIQUE), portanto se dois consultores receberem o mesmo `messageId` (cenário improvável mas possível com forwards), o segundo é deduplicado erroneamente e fica sem resposta.

1.35 WHEN o `aiInCooldown(cooldownKey)` em `_shared/bot/ai-cooldown.ts` é mantido em memória por instância THEN o cooldown de IA não é compartilhado entre containers, e a quota da API Gemini é estourada porque cada container tem seu próprio "modo cooldown desligado".

1.36 WHEN o `try_log_media_send` RPC garante atomicidade para o par `(consultant_id, customer_id, media_id)` mas o `sender.sendMedia` falha após a reserva ter sido gravada THEN a mídia é marcada como "enviada" no log, mas o cliente nunca recebeu, e nas próximas execuções o sistema não tentará reenviar (perda definitiva).

1.37 WHEN dois webhooks chegam quase simultaneamente para o mesmo `customer_id` THEN não existe lock por `customer_id` (não há `pg_advisory_lock` nem `conversation_lock`), e os dois processos atualizam `customers` na ordem da última gravação, sem garantia de consistência transacional sobre o estado da conversa.

1.38 WHEN a fila do Supabase atinge muitos webhooks por segundo do mesmo `consultant_id` (ex.: campanha de tráfego pago dispara 50 leads em 30s) THEN a Edge Function processa cada um em paralelo, sem coalescing, e o `ai-agent-router` consome cota Gemini de forma descontrolada, levando a 429s e quedas de qualidade.

### Expected Behavior (Correct)

Cada cláusula descreve o comportamento esperado para o sintoma correspondente em "Current Behavior". Numeração contínua na seção (X=2). Os agrupamentos B1–B7 correspondem aos mesmos da seção anterior.

**B1 — Perda silenciosa de mídia**

2.1 WHEN o cliente envia uma imagem/documento/áudio e `sender.downloadMedia` retorna `null` THEN o sistema SHALL registrar a falha de forma persistente em `customers.error_message`, SHALL responder ao cliente uma mensagem clara em português ("Desculpa, não consegui receber sua imagem. Pode reenviar, por favor?") OR SHALL solicitar reenvio mantendo o `conversation_step` no mesmo passo, e SHALL contabilizar a falha em uma métrica observável (log estruturado `evolution_media_lost`) para alarme.

2.2 WHEN o `downloadMedia` retorna base64 mas o upload para o MinIO falha THEN o sistema SHALL persistir a base64 (ou um pointer temporário) em uma tabela de retry (ex.: `inbound_media_retry`) com TTL e SHALL agendar/permitir um job de reenvio para o MinIO antes de descartar, garantindo que a mídia não seja perdida do histórico permanente.

2.3 WHEN o cliente envia mídia em um passo conversacional (welcome, qualificacao, flow:*) e `downloadMedia` falha THEN o sistema SHALL NOT redirecionar silenciosamente para `aguardando_conta` com `fileBase64=null`; SHALL pedir reenvio explicitamente E SHALL manter o passo conversacional original para que o próximo turno tente novamente.

2.4 WHEN a Evolution API entrega o webhook com `imageMessage.url`/`documentMessage.url` mas sem `message.message` válido THEN o sistema SHALL tentar baixar a URL diretamente (com headers da Evolution se necessário) E SHALL persistir o conteúdo no MinIO antes de seguir o fluxo, ou SHALL pedir reenvio se nenhum dos dois caminhos funcionar.

2.5 WHEN o cliente envia áudio (`audioMessage`) THEN o `parseEvolutionMessage` SHALL incluir o áudio no fluxo de download (`isFile=true` para áudio quando o passo conversacional precisa de transcript), o sistema SHALL baixar via `downloadMedia` E SHALL transcrevê-lo via `ai-transcribe-media` para alimentar o `ai-agent-router`.

**B2 — Envio duplicado de mensagens**

2.6 WHEN a Evolution API redentrega o mesmo webhook (`data.key.id` igual) durante processamento concorrente THEN o `checkAndMarkProcessed` SHALL ser chamado **antes** de qualquer leitura de `customers` ou envio de resposta, usando uma reserva atômica (INSERT ... ON CONFLICT) E o segundo executor SHALL retornar imediatamente sem efeitos colaterais (sem leitura, sem envio).

2.7 WHEN o `sendWithRetry` recebe `5xx` da Evolution após o servidor possivelmente ter aceitado a mensagem THEN o helper SHALL usar uma idempotency key (ex.: hash de `customer_id + step + content + minute_bucket` ou um UUID gerado por turno) registrada antes do envio, E retentativas SHALL incluir essa key para que a Evolution/WhatsApp possa deduplicar; OR o helper SHALL parar de retentar para `500 Connection Closed` (já é tratado como `needs_reconnect`) e marcar a mensagem como pendente sem reenvio cego.

2.8 WHEN o anti-dup verifica os últimos 60s de `conversations` THEN a comparação SHALL ser feita por hash normalizado (lowercase, trim, sem emojis variáveis, com `{{vars}}` renderizadas iguais) OU por `(customer_id, conversation_step, message_text_hash)` para capturar duplicatas que diferem só por whitespace/render.

2.9 WHEN um handler envia mídia inline via `sendStepMedia` E grava `updates.__inline_sent=true` THEN o `evolution-webhook` SHALL respeitar `__inline_sent=true` em **todos** os ramos posteriores e NÃO SHALL enviar `finalReply` do bloco "Send reply" se o handler já gerou a saída completa.

2.10 WHEN o `aiShouldHandle` é `true` THEN o `evolution-webhook` SHALL delegar exclusivamente ao `ai-agent-router` E SHALL NOT executar `runConversationalFlow`/`runBotFlow` no mesmo turno; o caminho de fallback determinístico SHALL ser invocado apenas se o `ai-agent-router` retornar erro ou `skipped`.

**B3 — Fluxo inconsistente / passo errado / fora de ordem**

2.11 WHEN dois webhooks chegam para o mesmo `customer_id` em janela curta THEN o sistema SHALL adquirir um lock de processamento por `customer_id` (ex.: `pg_advisory_xact_lock` em uma transação, ou um campo `processing_lock_until` em `customers` com TTL curto) E SHALL processar mensagens do mesmo customer em ordem serializada, garantindo que o segundo só leia `conversation_step` após o primeiro ter gravado.

2.12 WHEN o customer está em um step de cadastro (`CADASTRO_STEPS`) e o consultor altera `conversational_flow_enabled` durante a conversa THEN o roteador SHALL preservar `conversation_step` atual do customer (não zerar), SHALL deixar o cadastro em andamento concluir em `engine=sys`, E SHALL aplicar o flag novo apenas a customers que voltarem para `welcome`/`menu_inicial`.

2.13 WHEN o cliente envia mídia em step conversacional e existe um passo configurado em `bot_flow_steps` que captura `electricity_bill_value` ou que tem `step_type=image_capture` THEN o sistema SHALL tentar primeiro o passo configurado pelo consultor antes de fazer redirect hardcoded para `aguardando_conta`; o redirect hardcoded SHALL ser fallback apenas quando nenhum passo do flow trata mídia.

2.14 WHEN o `auto-resume` reseta status THEN o `conversation_step` SHALL receber prefixo correto (`flow:` ou cru) consistente com `engineUsed`, garantindo que `routeEngine` e `normalizeOutgoing` concordem no próximo turno; mismatched prefixes SHALL ser corrigidos em uma única etapa atomica de update.

2.15 WHEN o cliente clica em um botão (`buttonId` presente) THEN os handlers SHALL usar `buttonId` como input primário para matching de transição (antes de `messageText`); se `buttonId` casar com uma `transition.trigger_phrases` ou com um id especial (ex.: `cadastro`, `humano`), SHALL transitionar para o passo correspondente e NÃO SHALL cair em fallback.

2.16 WHEN o consultor reordena passos em `bot_flow_steps` enquanto há customers ativos THEN o sistema SHALL referenciar passos por `step_key` (estável) e não por `position`; o roteamento SHALL continuar a partir do `step_key` salvo no customer mesmo se a `position` mudou.

**B4 — Passo errado da sequência**

2.17 WHEN o `aiShouldHandle` é avaliado E o consultor tem um `bot_flow_steps` ativo com passo de abertura (`is_opening=true` em `bot_flow_qa` ou primeiro `step` da sequência) THEN o sistema SHALL priorizar a configuração explícita do consultor (executar o passo de abertura via `runConversationalFlow`) sobre a abertura genérica do `ai-agent-router`; a IA conversacional SHALL atuar apenas nos passos cobertos por `CONVERSATIONAL_STEPS` que o consultor não configurou.

2.18 WHEN o `ai-agent-router` decide `next_step` THEN o sistema SHALL validar que o `next_step` existe como `step_key` ativo em `bot_flow_steps` do consultor (ou pertence a `CADASTRO_STEPS`) ANTES de gravar; se não existir, SHALL manter o `conversation_step` atual e logar `ai_invalid_next_step` em `ai_agent_logs`.

2.19 WHEN o `aiDecideFallback` retorna um `step_key` THEN o sistema SHALL validar que o passo escolhido é alcançável a partir do passo atual (definido por `transitions` ou special goto) E SHALL honrar pré-condições do passo (ex.: `aguardando_facial` exige OTP validado) antes de transitionar; senão, SHALL ficar em `REPEAT`.

2.20 WHEN o redirect "foto recebida fora de hora" é acionado E o consultor desativou `conversational_flow_enabled` THEN o sistema SHALL respeitar o engine `sys` E SHALL aplicar o `conversation_step=aguardando_conta` somente após verificar que o customer está em um step compatível com receber conta de luz no fluxo legado.

**B5 — Tempo irreal entre passos**

2.21 WHEN um passo é enviado THEN o tempo entre o input do cliente e a primeira mensagem de saída SHALL ser pelo menos `min_typing_ms` (ex.: 2.5s) e proporcional ao tamanho da resposta (~50–80ms/char) com teto de `max_typing_ms` (ex.: 12s); o `sendPresence` "composing" SHALL ser disparado e renovado a cada 2.5–3s para manter o "digitando…" visível.

2.22 WHEN um passo tem múltiplas mídias em sequência THEN cada mídia SHALL aguardar `delay_before_ms` configurado pelo consultor (com piso de 800ms entre itens), E quando o item anterior é áudio/vídeo, SHALL aguardar pelo menos 60% da `duration_sec` do item anterior antes de enviar o próximo (limitado a 8s para não bloquear a Edge Function).

2.23 WHEN o `humanDelayMs` é calculado para uma resposta muito curta (≤10 chars) THEN o sistema SHALL usar um piso reduzido (ex.: 2s) em vez de 3.5s; para respostas longas (>200 chars), SHALL aplicar o teto de 12s consistentemente.

2.24 WHEN o `sendPresence` falha THEN o sistema SHALL logar a falha estruturadamente E SHALL reduzir o `humanDelayMs` para o piso mínimo (não esperar o delay completo se o cliente não está vendo "digitando…"), evitando travamento aparente.

2.25 WHEN o `ai-agent-router` define `should_pause_seconds` THEN o `evolution-webhook` posterior SHALL NOT adicionar um segundo delay; deve haver uma fonte única de timing por turno (decidida no router responsável pelo envio).

2.26 WHEN uma sequência de mídias se aproxima de 50s acumulados THEN o sistema SHALL retornar a resposta HTTP 200 e SHALL enfileirar o restante das mídias em uma fila assíncrona (ex.: `pg_cron` ou um job Supabase) para envio fora do timeout do webhook, em vez de cortar a sequência no meio.

**B6 — IA alucina ou erra ao responder**

2.27 WHEN o LLM retorna `decision.reply_text` THEN o `sanitizeHumanReply` SHALL aplicar grounding contra `ai_knowledge_sections`, contra os campos do customer, e contra valores numéricos conhecidos (preço, comissão, prazos), bloqueando ou reescrevendo respostas que contenham números/links/promessas que não existem na base de conhecimento.

2.28 WHEN o LLM retorna `decision.media_to_send_ids` THEN o sistema SHALL filtrar apenas IDs presentes em `relevantMedia` E SHALL ignorar silenciosamente IDs alucinados, registrando `ai_hallucinated_media_id` em `ai_agent_logs`; se nenhum ID restar válido E `reply_text` estiver vazio, SHALL cair em um `fallback_text` determinístico do consultor.

2.29 WHEN o LLM retorna `audio_slot_key` inválido THEN o sistema SHALL recuperar com fallback determinístico: se for primeiro contato, usar `boas_vindas` válido; senão, ignorar o slot e usar `decision.reply_text` ou um template do passo configurado, NUNCA permitindo silêncio total.

2.30 WHEN o LLM falha (timeout/429/5xx) E o fallback retorna `reply_text=""` THEN o `ai-agent-router` SHALL invocar uma fallback determinística (template configurado para o passo atual em `bot_flow_steps` ou frase padrão "oii 😊 me dá um instantinho") E SHALL garantir que algo seja enviado ao cliente.

2.31 WHEN o LLM retorna `next_step="cadastro_portal"` THEN o sistema SHALL validar que o customer atende as pré-condições do passo (`electricity_bill_value IS NOT NULL` AND `document_uploaded=true`) ANTES de gravar `conversation_step`; se não atender, SHALL manter o passo atual e logar a violação.

2.32 WHEN o `answerFaqWithAI` retorna texto THEN o sistema SHALL marcar a resposta com tag `[ai-faq]` e SHALL preferir `bot_flow_qa.text_response` quando o input casar com `bot_flow_qa_triggers` (matching exato precede LLM); o LLM SHALL ser usado apenas para parafrasear, nunca para inventar fatos.

**B7 — Falhas em escala (multi-tenancy)**

2.33 WHEN várias instâncias da Edge Function rodam em paralelo THEN o rate limiter SHALL ser persistente (ex.: tabela `webhook_rate_limit` com `(phone, window_start)` ou contador no Postgres com `INSERT ... ON CONFLICT UPDATE`) garantindo que o limite global (4 msgs / 5s / phone) seja aplicado consistentemente entre containers.

2.34 WHEN `webhook_message_dedup` é usado THEN o índice UNIQUE SHALL ser composto por `(message_id, instance_name)` (já é incluído no insert) garantindo que webhooks de instâncias diferentes não conflitem; e a função `checkAndMarkProcessed` SHALL passar `instance_name` corretamente em todos os call sites.

2.35 WHEN o cooldown da IA é necessário THEN o sistema SHALL persistir o cooldown em `ai_cooldown_state` (ou similar no banco) com TTL, compartilhado entre containers, em vez de Map em memória por instância.

2.36 WHEN o `try_log_media_send` reserva uma mídia E o `sender.sendMedia` falha THEN o sistema SHALL marcar a reserva como `dispatch_status=failed` (em vez de `sent`) E SHALL permitir nova tentativa em uma janela curta (ex.: 30s) antes de considerar a mídia como definitivamente entregue.

2.37 WHEN dois webhooks chegam simultaneamente para o mesmo `customer_id` THEN o sistema SHALL adquirir um lock por `customer_id` via `pg_advisory_xact_lock(hashtext(customer_id))` no início do processamento E SHALL liberar ao final, garantindo serialização por customer; clientes diferentes continuam processando em paralelo.

2.38 WHEN a fila de webhooks de um mesmo `consultant_id` cresce muito (ex.: campanha) THEN o sistema SHALL aplicar coalescing/throttle por consultor para chamadas ao Gemini (ex.: token bucket por `consultant_id`) E SHALL fazer fallback para resposta determinística (template do passo) quando a quota atingir o limite, em vez de retornar erro 500.

### Unchanged Behavior (Regression Prevention)

Comportamentos atuais que devem ser preservados sem alteração após o bugfix. Numeração contínua (X=3).

**Caminho feliz e funcionalidades existentes**

3.1 WHEN o cliente está em um passo `aguardando_conta` E envia uma foto que `downloadMedia` baixa com sucesso THEN o sistema SHALL CONTINUE TO rodar o OCR (Gemini), SHALL CONTINUE TO popular `electricity_bill_value`, `address_*`, `distribuidora`, e SHALL CONTINUE TO seguir para `confirmando_dados_conta` exatamente como hoje.

3.2 WHEN o cliente está em `aguardando_doc_frente` ou `aguardando_doc_verso` e envia um documento válido THEN o sistema SHALL CONTINUE TO chamar o OCR de documentos, SHALL CONTINUE TO popular `cpf`, `rg`, `birth_date`, `name`, e SHALL CONTINUE TO progredir o cadastro normalmente.

3.3 WHEN a Evolution API entrega `CONNECTION_UPDATE` THEN o `handleConnectionUpdate` SHALL CONTINUE TO atualizar `whatsapp_instances.status`, SHALL CONTINUE TO disparar `connected_phone`, e SHALL CONTINUE TO retornar `ok` sem processar como mensagem.

3.4 WHEN o customer tem `bot_paused=true` (handoff humano ativo) THEN o sistema SHALL CONTINUE TO registrar o inbound em `conversations` SHALL NOT responder automaticamente, e SHALL CONTINUE TO preservar `bot_paused_reason` e `bot_paused_at`.

3.5 WHEN o consultor desativou globalmente a IA (`isConsultantAIDisabled=true`) THEN o webhook SHALL CONTINUE TO retornar imediatamente com `global_ai_disabled_silent` sem registrar conversa nem enviar resposta.

3.6 WHEN o cliente envia uma mensagem que casa com `bot_flow_qa_triggers` (FAQ configurado) THEN o sistema SHALL CONTINUE TO retornar `bot_flow_qa.text_response` + mídias associadas E SHALL CONTINUE TO manter o passo atual (REPEAT), exatamente como o `matchQA` faz hoje.

3.7 WHEN o anti-loop detecta `similarity ≥ 0.8` entre `decision.reply_text` e a última outbound THEN o sistema SHALL CONTINUE TO esvaziar o `reply_text` e SHALL CONTINUE TO escalar para handoff se não houver áudio/mídia para enviar.

3.8 WHEN o cliente diz 3x consecutivos com `detected_intent=confuso` THEN o sistema SHALL CONTINUE TO acionar `handoff=true` com `handoff_reason=3x_confuso`.

3.9 WHEN o cliente diz `detected_intent=pediu_humano` THEN o sistema SHALL CONTINUE TO forçar `handoff=true` e SHALL CONTINUE TO pausar o bot com `bot_paused_reason=pediu_humano`.

3.10 WHEN o `runConversationalFlow` carrega um flow ativo com `variant="A"` ou `"B"` E o customer tem `flow_variant` setado THEN o sistema SHALL CONTINUE TO usar a variante correta (incluindo a transformação `audio→text` quando `variant="B"`).

3.11 WHEN o `KanbanBoard.tsx` move um deal entre estágios e dispara `messageSender.ts` THEN as funções de envio do `evolutionApi.ts` (front) SHALL CONTINUE TO funcionar exatamente como antes deste bugfix.

3.12 WHEN o `MessagePanel.tsx` envia mensagem individual via UI THEN o sistema SHALL CONTINUE TO encaminhar via `evolutionApi.ts` → proxy Supabase → Evolution API e SHALL CONTINUE TO logar em `conversations` com sucesso.

3.13 WHEN o `BulkSendPanel.tsx` envia mensagens em massa com intervalo de 2s THEN o sistema SHALL CONTINUE TO enviar sequencialmente com a barra de progresso e o resumo de sucesso/falha.

3.14 WHEN o customer atinge `complete` ou `registered_igreen` THEN o sistema SHALL CONTINUE TO criar um novo registro na próxima entrada do mesmo telefone (lógica `stepsFinalizados`/`statusFinalizados`).

3.15 WHEN o customer tem `status=abandoned`/`stuck_*`/`email_pendente_revisao` E volta a interagir THEN o sistema SHALL CONTINUE TO resetar para `pending` mantendo o `conversation_step` atual.

3.16 WHEN o `notifyNewLead` é chamado para um novo customer ou para reentrada após 24h THEN o sistema SHALL CONTINUE TO disparar a notificação ao consultor (com dedup interno de 60s).

3.17 WHEN o `syncDealStageFromStep` é chamado após gravar `conversation_step` THEN o sistema SHALL CONTINUE TO atualizar o estágio do deal no Kanban conforme o lead progride.

3.18 WHEN o `recover-stuck-otp` cron roda THEN o sistema SHALL CONTINUE TO recuperar OTPs travados sem alteração no comportamento.

3.19 WHEN o `try_log_media_send` retorna `true` (primeira reserva) THEN o sistema SHALL CONTINUE TO enviar a mídia e registrar `[flow-step:{step_key}:{kind}]` em `conversations`.

3.20 WHEN o consultor configura ordem `text→audio→video→image` em `flow_step_media_order` THEN o sistema SHALL CONTINUE TO respeitar essa ordem em `sendStepMedia`.

3.21 WHEN o `parseEvolutionMessage` recebe um webhook de grupo (`@g.us`) ou newsletter THEN o sistema SHALL CONTINUE TO retornar `null` e ignorar.

3.22 WHEN o `parseEvolutionMessage` detecta self-message (remoteJid == `connected_phone`) THEN o sistema SHALL CONTINUE TO retornar `null` e logar `evolution_self_message_ignored`.

3.23 WHEN o passo configurado tem `transitions` com `goto_special="cadastro"` ou `"humano"` THEN o sistema SHALL CONTINUE TO transicionar para `aguardando_conta` (cadastro) ou `aguardando_humano` (handoff) exatamente como hoje.

3.24 WHEN o `evolution-proxy` Edge Function é chamada do frontend (via `supabase.functions.invoke`) com `{path, method, body}` THEN o sistema SHALL CONTINUE TO repassar para a Evolution API com a apikey server-side, mantendo o comportamento corrigido pelo bugfix `whatsapp-message-send-fix`.

3.25 WHEN o customer está em um passo de `CADASTRO_STEPS` (`aguardando_conta`, `ask_cpf`, `aguardando_otp`, etc.) THEN o `runConversationalFlow` SHALL CONTINUE TO retornar `{ reply: "", updates: {} }` imediatamente para deixar o `bot-flow.ts` legado conduzir.

3.26 WHEN um passo envia mídia inline E texto inline E grava `__inline_sent=true` E o `reply` retornado é `""` THEN o `evolution-webhook` SHALL CONTINUE TO entender que o handler já enviou tudo e NÃO SHALL adicionar reply de fallback.

3.27 WHEN a Evolution API retorna `500 Connection Closed` para uma instância THEN o sistema SHALL CONTINUE TO marcar `whatsapp_instances.status=needs_reconnect` para alerta ao super-admin.

3.28 WHEN o consultor configura `strict_mode=true` no flow THEN o sistema SHALL CONTINUE TO usar apenas mídias e respostas definidas no flow, sem permitir LLM gerar conteúdo livre fora do roteiro.

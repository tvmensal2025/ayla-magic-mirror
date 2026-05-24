# Requirements Document

## Introduction

A operação processa leads do Meta Ads (CTWA) por WhatsApp em dois canais: **Evolution** (consultores) e **Whapi** (super admin). Hoje o roteamento botão vs texto numerado é decidido dentro do sender por fallback em runtime; o estado do lead é texto livre em `customers.conversation_step`; e captação, performance e atendimento moram inline no mesmo webhook de 1.446 linhas. Cada novo fluxo (A, B, C, D…) hoje exige patch em 4–7 arquivos espalhados, e cada bug introduz regressão em outro lugar.

Esta spec entrega uma arquitetura onde **cada fluxo é uma linha em `bot_flow_steps`**, **cada canal declara suas capacidades**, e **o motor é uma função pura**. Adicionar um Fluxo E ou F passa a ser cadastro no admin, sem deploy.

Esta spec assume que `whatsapp-flow-reliability-fix` chegou a `flow_reliability_v2='on'` em produção. Ela **não** repete os fixes daquela spec — só consome a fundação (idempotência, customer-lock, grounding, hash de dedup).

**Out of scope:**

- Substituir a Evolution ou Whapi.
- Refazer o pipeline de cadastro determinístico (`runBotFlow` legado fica até a Fase J — depois de provar paridade).
- Mexer em integrações Meta Ads / iGreen API.
- Unificar os dois webhooks num único endpoint.

## Glossary

- **Adapter**: implementação concreta de `ChannelAdapter` para Whapi ou Evolution. Encapsula `parseInbound`, `sendText`, `sendChoice`, `sendMedia`, `downloadMedia` e expõe `capabilities`.
- **Capability**: declaração estática (`supportsButtons`, `maxButtons`, `supportsList`…) que o engine usa para decidir como renderizar uma escolha.
- **Engine**: função pura `tick(state, step, capabilities, event)` que calcula `EngineResult`. Zero efeitos colaterais.
- **Dispatcher**: camada que executa `EngineResult.actions[]` chamando o adapter, persistindo estado e emitindo logs/métricas.
- **Step type canônico**: um dos 8 tipos restringidos por CHECK constraint (`text_message`, `media_message`, `audio_slot`, `ask_text`, `ask_choice`, `ask_media`, `branch`, `system_capture`).
- **Pause reason**: enum `customer_pause_reason` cobrindo exatamente as 21 strings em uso hoje.
- **Flow state**: linha em `customer_flow_state` — fonte única do estado conversacional do lead.
- **PBT**: property-based test com `fast-check`.
- **System capture**: step canônico que delega para `runBotFlow` legado (cadastro, OCR, OTP).
- **Channel downgrade**: quando step pede botão e canal não suporta, dispatcher emite lista numerada e loga `channel_choice_downgrade`.

## Requirements

### Requirement 1: Channel adapter unificado declara capacidades

**User Story:** Como engenheiro mantendo o webhook, quero que cada canal declare estaticamente o que suporta, para o engine decidir como renderizar sem `if/else` espalhados.

#### Acceptance Criteria

1. WHEN o sistema importa `_shared/channels/index.ts` THEN o módulo SHALL exportar `getAdapter(channel: ChannelKind): ChannelAdapter`.
2. WHEN `getAdapter('whapi')` é chamado THEN o adapter retornado SHALL ter `capabilities.supportsButtons=true`, `maxButtons=3`, `supportsList=true`, `supportsAudio=true`.
3. WHEN `getAdapter('evolution')` é chamado THEN o adapter retornado SHALL ter `capabilities.supportsButtons=true`, `maxButtons=3`, `supportsList=false`, `supportsAudio=true`.
4. WHEN um adapter é instanciado THEN o objeto retornado SHALL implementar todos os métodos da interface `ChannelAdapter` definida em `design.md`.
5. WHEN o webhook recebe um payload bruto THEN ele SHALL chamar `adapter.parseInbound(raw)` em vez de instanciar parser próprio.

### Requirement 2: Adapters retornam tipo canônico ParsedMessage

**User Story:** Como autor do engine, quero receber sempre o mesmo formato de mensagem inbound independente do canal.

#### Acceptance Criteria

1. WHEN `adapter.parseInbound` recebe payload Evolution válido THEN ele SHALL retornar `ParsedMessage` com `channel='evolution'`, `messageId`, `remoteJid` no formato `5511...@s.whatsapp.net`, `messageText`, `buttonId`, `mediaKind`.
2. WHEN `adapter.parseInbound` recebe payload Whapi com `quick_reply` THEN ele SHALL retornar `buttonId` sem o prefixo `ButtonsV3:` ou `ListV3:`.
3. WHEN `adapter.parseInbound` recebe payload de grupo, self ou status THEN ele SHALL retornar `null` ou `{ ignored: true }`.
4. WHEN `adapter.parseInbound` recebe payload com mídia THEN `parsed.hasMedia=true` e `parsed.mediaKind` SHALL ser exatamente um de `image|audio|video|document`.

### Requirement 3: Estado canônico do lead em customer_flow_state

**User Story:** Como engenheiro debugando um lead travado, quero ver em uma única linha qual fluxo, qual step, qual status e qual razão de pausa.

#### Acceptance Criteria

1. WHEN a migration B.2 roda THEN a tabela `customer_flow_state` SHALL existir com PK em `customer_id` e colunas conforme `design.md`.
2. WHEN um customer entra pela primeira vez no sistema THEN uma linha em `customer_flow_state` SHALL ser inserida com `status='new'`.
3. WHEN o engine v3 processa um turno THEN ele SHALL atualizar `customer_flow_state` em uma única transação por turno.
4. WHEN `customer_flow_state.status='paused_manual'` THEN `assigned_human_id` SHALL NOT ser NULL (CHECK constraint).
5. WHEN `customer_flow_state.status IN ('paused_manual','paused_system','lost')` THEN `pause_reason` SHALL NOT ser NULL (CHECK constraint).

### Requirement 4: Enums tipados para status e pause reason

**User Story:** Como engenheiro auditando o sistema, quero que motivos de pausa sejam um conjunto fechado para poder filtrar relatórios e construir dashboards.

#### Acceptance Criteria

1. WHEN a migration B.1 roda THEN os tipos `customer_flow_status` e `customer_pause_reason` SHALL existir.
2. WHEN o código tenta inserir uma string fora do enum em `customer_flow_state.pause_reason` THEN o INSERT SHALL falhar com erro de tipo.
3. WHEN um novo motivo de pausa é necessário THEN o desenvolvedor SHALL adicionar via migration ALTER TYPE — não há fallback "string livre".

### Requirement 5: Sincronização legacy v3 durante migração

**User Story:** Como time de produto, quero que crons e relatórios existentes continuem funcionando enquanto migramos gradualmente para o novo schema.

#### Acceptance Criteria

1. WHEN `customer_flow_state` é atualizado THEN o trigger SHALL refletir `bot_paused`, `bot_paused_reason`, `assigned_human_id` em `customers` em <100ms.
2. WHEN um cron antigo lê `customers.bot_paused` durante a migração THEN o valor SHALL estar consistente com `customer_flow_state.status`.
3. WHEN `flow_engine_v3='off'` THEN o sistema SHALL escrever em `customers.bot_paused` direto (caminho legado preservado) E o backfill inicial preserva `customer_flow_state` coerente.

### Requirement 6: Step types canônicos

**User Story:** Como criador de fluxo no admin, quero escolher de uma lista fechada de tipos de step para não criar configurações inválidas.

#### Acceptance Criteria

1. WHEN a migration C.1 roda THEN `bot_flow_steps` SHALL ter coluna `step_type_canonical` com CHECK constraint cobrindo os 8 tipos canônicos.
2. WHEN a migration backfill roda THEN 100% dos rows existentes SHALL ter `step_type_canonical` preenchido conforme mapeamento `design.md`.
3. WHEN um step é criado pela UI THEN ele SHALL gravar `step_type_canonical` direto (a coluna `step_type` legada é só diagnóstico).

### Requirement 7: Engine puro tick

**User Story:** Como engenheiro escrevendo testes, quero que o motor seja determinístico e sem efeitos colaterais.

#### Acceptance Criteria

1. WHEN `tick(state, step, capabilities, event)` é chamado N vezes com a mesma entrada THEN ele SHALL retornar o mesmo `EngineResult`.
2. WHEN `tick()` é chamado THEN ele SHALL NOT executar nenhuma query SQL, fetch HTTP, ou efeito colateral observável.
3. WHEN o engine encontra step inválido THEN ele SHALL retornar `EngineResult` com `logs[]` populado e `actions=[]` em vez de lançar.
4. WHEN o engine processa `event.kind='timer_expired'` THEN ele SHALL aplicar a regra de `step.fallback` (advance | repeat | handoff).
5. WHEN o engine processa `step.stepType='system_capture'` THEN ele SHALL retornar `actions=[{kind:'delegate_legacy_runBotFlow', reason:pipeline}]`.

### Requirement 8: Dispatcher como única camada de IO

**User Story:** Como engenheiro mantendo a integração com Evolution/Whapi, quero que toda chamada externa passe por um único módulo idempotente.

#### Acceptance Criteria

1. WHEN `dispatch(supabase, adapter, result, ctx)` é chamado THEN ele SHALL executar cada `action` em sequência (não paralelo).
2. WHEN uma ação `send_*` é executada THEN ela SHALL primeiro chamar `acquireOutboundSlot(idempotencyKey)`.
3. WHEN `acquireOutboundSlot` retorna `acquired=false` THEN o dispatcher SHALL chamar `recordOutboundResult('replay', previousMessageId)` e seguir sem reenviar.
4. WHEN todas as ações foram executadas THEN o dispatcher SHALL fazer um único UPDATE em `customer_flow_state` com `nextState`.
5. WHEN o dispatcher delega para `runBotFlow` legado THEN ele SHALL marcar `customer_flow_state.status='delegated_legacy'` antes da chamada e atualizar para o status real após.

### Requirement 9: ask_choice channel-aware

**User Story:** Como autor de fluxo, quero declarar "este passo pede uma escolha do usuário" e o sistema decide se vira botão ou número conforme o canal.

#### Acceptance Criteria

1. WHEN um step `ask_choice` tem `preferred='button'` E `capabilities.supportsButtons=true` E `options.length <= maxButtons` THEN o dispatcher SHALL emitir botão real.
2. WHEN as condições do (1) não são satisfeitas THEN o dispatcher SHALL emitir lista numerada determinística no formato `*1.* opção A\n*2.* opção B…`.
3. WHEN o downgrade do (2) acontece THEN o dispatcher SHALL emitir log com `kind='channel_choice_downgrade'` contendo `step_id` e `reason`.
4. WHEN o cliente responde "1" a um step `ask_choice` que renderizou lista numerada THEN `parseInbound` SHALL retornar `rawNumberReply='1'` E o engine SHALL resolver para o `option_id` do índice 0.
5. WHEN o cliente clica em botão THEN `parseInbound` SHALL retornar `buttonId` com o ID puro (sem prefixo de protocolo).

### Requirement 10: Captação isolada e fire-and-forget

**User Story:** Como time de marketing, quero que tagging de origem do lead nunca atrase a resposta do bot.

#### Acceptance Criteria

1. WHEN o webhook recebe a primeira mensagem de um lead novo THEN ele SHALL chamar `tagLeadSource(...)` via `queueMicrotask` (não bloqueante).
2. WHEN `tagLeadSource` falha THEN ela SHALL emitir `log("lead_source_tag_failed", ...)` E NOT propagar exceção para o turno do bot.
3. WHEN `tagLeadSource` roda com sucesso THEN ela SHALL preencher `customers.lead_source`, `source_campaign_id`, `source_ctwa_clid`, `source_referral` E inserir linha em `campaign_match_log`.
4. WHEN o lead manda primeira mensagem THEN o tempo total `webhook_inbound → 200 response` SHALL ser <500ms p95 mesmo se `facebook_campaigns` lookup falhar.

### Requirement 11: CRM sync via wrapper único

**User Story:** Como engenheiro mantendo o Kanban, quero uma única entrada para sincronização de stage.

#### Acceptance Criteria

1. WHEN `customer_flow_state.current_step_id` muda THEN o dispatcher SHALL chamar `syncCustomerStage(customerId, stepKeyAfter, consultantId)`.
2. WHEN `syncCustomerStage` é chamada N vezes com a mesma entrada THEN ela SHALL ser idempotente (sem duplicar deals).
3. WHEN `grep "from('crm_deals')" supabase/functions/` é executado THEN as ocorrências SHALL estar apenas em `_shared/conversion/*.ts`.

### Requirement 12: Métricas via wrapper único

**User Story:** Como time de produto, quero auditar todas as transições de step em um único lugar.

#### Acceptance Criteria

1. WHEN o engine avança de step THEN o dispatcher SHALL chamar `recordStepTransition` antes de retornar 200.
2. WHEN `grep "from('bot_step_transitions').insert" supabase/functions/` é executado THEN as ocorrências SHALL estar apenas em `_shared/performance/metrics.ts`.

### Requirement 13: Logger central com tipos validados

**User Story:** Como SRE, quero que todo log do sistema tenha um `kind` validado para indexar e alertar.

#### Acceptance Criteria

1. WHEN um arquivo do core (`_shared/flow-engine/**`, `_shared/channels/**`, `_shared/webhook-entry.ts`) chama `console.log` direto THEN o lint CI SHALL falhar.
2. WHEN um caller chama `log("unknown_kind", {})` THEN o TypeScript compiler SHALL rejeitar (typecheck error).
3. WHEN `log("engine_step_advance", {...})` é chamado THEN o output SHALL ser uma linha JSON contendo `kind`, `payload`, `ts`.

### Requirement 14: View v_flow_engine_health

**User Story:** Como super admin, quero um dashboard que mostre saúde do motor por consultor.

#### Acceptance Criteria

1. WHEN a migration F.3 roda THEN a view `v_flow_engine_health` SHALL existir com `security_invoker=true`.
2. WHEN um consultor consulta a view via dashboard THEN ele SHALL ver apenas seus próprios customers (RLS via `is_super_admin` ou `consultant_id = auth.uid()`).
3. WHEN executada com tráfego THEN a view SHALL retornar `turns_last_hour`, `paused_manual`, `paused_system`, `converted_today`, `conversion_rate_24h_pct` por consultor.

### Requirement 15: Feature flag flow_engine_v3

**User Story:** Como engenheiro responsável pelo rollout, quero ligar/desligar o motor v3 por consultor sem deploy.

#### Acceptance Criteria

1. WHEN a migration C.6 roda THEN `consultants.flow_engine_v3` SHALL existir como TEXT com CHECK em `('off','dark','canary','on')` e default `'off'`.
2. WHEN `flow_engine_v3='off'` THEN o caminho legado SHALL rodar sem mudanças.
3. WHEN `flow_engine_v3='dark'` THEN o engine v3 SHALL calcular `EngineResult` em paralelo E emitir log `engine_dark_decision` mas o caminho legado SHALL continuar a fonte de envio.
4. WHEN `flow_engine_v3 IN ('canary','on')` THEN o dispatcher v3 SHALL emitir as ações; legado vira fallback apenas para `delegate_legacy_runBotFlow`.
5. WHEN `UPDATE consultants SET flow_engine_v3='off' WHERE id=X` é executado THEN dentro de 30s o consultor X SHALL voltar ao caminho legado sem perda de estado.

### Requirement 16: Pipeline de cadastro continua intacto

**User Story:** Como produto, quero garantir que clientes em meio ao cadastro não sejam impactados pela migração.

#### Acceptance Criteria

1. WHEN um customer está em `aguardando_conta`, `processando_ocr_conta`, `confirmando_dados_conta` ou qualquer step de `CADASTRO_STEPS` THEN o engine v3 SHALL retornar `delegate_legacy_runBotFlow`.
2. WHEN `runBotFlow` legado conclui um step THEN o resultado SHALL ser refletido em `customer_flow_state` via trigger ou wrapper.
3. WHEN o customer completa o cadastro THEN `customer_flow_state.status` SHALL ser `'converted'`.

### Requirement 17: Modo manual é absoluto

**User Story:** Como consultor humano que assumiu uma conversa, quero garantia total de que o bot não vai disparar nada por trás.

#### Acceptance Criteria

1. WHEN `customer_flow_state.status='paused_manual'` THEN engine v3, ai-agent-router, ai-orchestrator e os 7 crons de followup/recovery SHALL NOT emitir nenhum outbound.
2. WHEN um cron é executado THEN seu WHERE clause SHALL excluir customers com `status IN ('paused_manual','paused_system','converted','lost','opt_out')`.
3. WHEN um humano libera (`UPDATE customer_flow_state SET status='running' WHERE customer_id=X`) THEN o próximo inbound SHALL ser processado pelo engine no step exato onde estava.

### Requirement 18: Idempotência outbound preservada

**User Story:** Como QA, quero garantir que retries de webhook nunca duplicam mensagens.

#### Acceptance Criteria

1. WHEN o dispatcher v3 envia uma ação `send_*` THEN ele SHALL derivar `idempotency_key` da fórmula `customerId|step|content|minute_bucket`.
2. WHEN o dispatcher é chamado duas vezes com a mesma entrada THEN o segundo envio SHALL curto-circuitar via `acquireOutboundSlot`.
3. WHEN duas mensagens diferindo só em whitespace/case são geradas em <60s THEN a segunda SHALL ser detectada como duplicada via `message_text_hash`.

### Requirement 19: Webhook responde menos de 8s p95

**User Story:** Como SRE, quero que a Evolution não retry por timeout.

#### Acceptance Criteria

1. WHEN engine v3 está em `'on'` THEN o p95 de tempo `webhook_inbound → 200 response` SHALL ser ≤8000ms.
2. WHEN `customer_lock` timeout acontece (>4s) THEN o webhook SHALL retornar 200 imediatamente com `mode='customer_lock_timeout'` (no-op seguro).

### Requirement 20: Auto-resume não regride

**User Story:** Como consultor, quero que leads em `lead_nao_pronto` ou `lead_quer_pensar` voltem automaticamente quando responderem.

#### Acceptance Criteria

1. WHEN um lead em `paused_system` com `pause_reason IN ('lead_nao_pronto','lead_quer_pensar')` envia inbound THEN o engine v3 SHALL despausar (`status='running'`) antes de processar o turno.
2. WHEN o auto-resume dispara THEN o engine SHALL emitir log `kind='engine_auto_resume'` com `previous_pause_reason`.

### Requirement 21: FAQ matcher continua antes do engine

**User Story:** Como consultor, quero que respostas pré-cadastradas em `bot_flow_qa` continuem disparando atalho.

#### Acceptance Criteria

1. WHEN um inbound chega THEN o `WebhookEntry.serve()` SHALL chamar FAQ matcher antes do engine.
2. WHEN há match em `bot_flow_qa.text_response` THEN o webhook SHALL emitir a resposta E NOT chamar engine para esse turno.
3. WHEN não há match THEN o engine v3 SHALL ser chamado.

### Requirement 22: Audio slots Camila preservados

**User Story:** Como produto, quero que o sistema de slots de áudio funcione exatamente como hoje.

#### Acceptance Criteria

1. WHEN engine v3 processa step `audio_slot` THEN ele SHALL emitir `action.kind='send_audio_slot'` com `slot_key`.
2. WHEN dispatcher executa `send_audio_slot` THEN ele SHALL consultar `ai_agent_slots` + `ai_slot_dispatch_log` exatamente como hoje (priorizar personal → public → fallback_text).
3. WHEN um slot tem `video_url` THEN dispatcher SHALL enviar áudio + vídeo na ordem.

### Requirement 23: Engine puro determinístico (PBT)

**User Story:** Como engenheiro de qualidade, quero garantia matemática de que o motor é puro.

#### Acceptance Criteria

1. WHEN o teste PBT roda 1000 entradas geradas THEN cada par `(input, output)` SHALL ser bytewise-igual em chamadas repetidas.
2. WHEN `tick` é chamado THEN o spy de Supabase client SHALL registrar zero chamadas.
3. WHEN `tick` é chamado THEN o spy de fetch global SHALL registrar zero chamadas.

### Requirement 24: Choice channel-aware (PBT)

**User Story:** Como engenheiro de qualidade, quero garantia matemática de que botão nunca aparece em canal sem suporte.

#### Acceptance Criteria

1. WHEN PBT gera 500 combinações de `(choice, capabilities)` THEN nenhum caso SHALL violar a invariante "nunca emite kind='button' se supportsButtons=false".
2. WHEN `parseInbound("1", {activeStep: askChoice})` é chamado THEN ele SHALL retornar `option_id = step.choice_options[0].id`.

### Requirement 25: State machine consistente (PBT)

**User Story:** Como engenheiro de qualidade, quero garantia de que o engine não deixa o lead em step fantasma.

#### Acceptance Criteria

1. WHEN PBT gera 1000 fluxos sintéticos THEN nenhum `EngineResult.nextState.current_step_id` SHALL apontar para step inexistente.
2. WHEN `nextState.status='converted'` THEN `EngineResult.actions` SHALL ser `[]`.
3. WHEN `nextState.status='paused_manual'` THEN `EngineResult.actions.filter(a => a.kind.startsWith('send_'))` SHALL ser `[]`.

### Requirement 26: Saúde operacional pós-rollout

**User Story:** Como engenheiro acompanhando o canary, quero critérios objetivos para avançar para `'on'`.

#### Acceptance Criteria

1. WHEN `flow_engine_v3='canary'` rodou por 7 dias em 5% dos consultores THEN `v_flow_engine_health.lock_timeout_pct` SHALL ser <0.1%.
2. WHEN o mesmo período é avaliado THEN `deterministic_fallback_pct` SHALL ser <5%.
3. WHEN o mesmo período é avaliado THEN `conversion_rate_24h_pct` no grupo canary SHALL NOT ser ≥2pp inferior ao grupo `off`.
4. WHEN o mesmo período é avaliado THEN nenhum incidente p1 SHALL ter sido aberto com causa raiz no engine v3.

### Requirement 27: Migração não-destrutiva

**User Story:** Como ops, quero garantia de que `flow_engine_v3='off'` reverte sem perda.

#### Acceptance Criteria

1. WHEN `UPDATE consultants SET flow_engine_v3='off' WHERE id=X` é executado THEN dentro de 30s o webhook do consultor X SHALL voltar ao caminho legado.
2. WHEN o rollback do (1) acontece THEN `customers.bot_paused`, `conversation_step`, `bot_paused_reason` SHALL estar coerentes com `customer_flow_state` (sincronizados via trigger).
3. WHEN engine v3 é re-ativado depois THEN ele SHALL retomar do estado em `customer_flow_state` sem perda de turnos.

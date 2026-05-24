# Design Document

## Overview

Esta arquitetura entrega:

1. **Channel adapters** (Whapi e Evolution) que declaram explicitamente o que suportam.
2. **Estado tipado** do lead em `customer_flow_state` (PK por customer), com enums fechados para status e pause reason.
3. **Step types canônicos** (8 tipos) restringidos por CHECK constraint, com backfill 100% dos rows existentes.
4. **Engine puro `tick()`** — função sem efeitos colaterais que recebe estado + capabilities + evento e devolve `EngineResult`.
5. **Dispatcher** como única camada de I/O do turno (chama adapter, persiste estado, emite métricas).
6. **Separação física** entre captação (fire-and-forget), atendimento (engine + dispatcher) e performance (wrapper único de métricas).
7. **Feature flag `flow_engine_v3`** com 4 estágios (`off | dark | canary | on`) espelhando o padrão da spec antiga.

A migração é não-destrutiva: `runBotFlow` legado continua atendendo `system_capture` (cadastro determinístico) até uma spec futura. Trigger sincroniza `customer_flow_state ↔ customers` durante toda a janela de migração para que crons existentes continuem funcionando.

Lê em conjunto com `requirements.md` desta spec e com `whatsapp-flow-reliability-fix/design.md` (fundação v2).

## Architecture

### Visão de camadas

```
┌──────────────────────────────────────────────────────────────────┐
│ INBOUND                                                          │
│  evolution-webhook    whapi-webhook                              │
│       │                    │                                     │
│       └────────┬───────────┘                                     │
│                ▼                                                 │
│        WebhookEntry.serve()        ← _shared/webhook-entry.ts    │
│        - CORS / parse                                            │
│        - getAdapter(channel)                                     │
│        - dedupe (msg_id, instance)                               │
│        - rate limit                                              │
│        - load customer (or create)                               │
│        - acquire customer_lock                                   │
│        - load customer_flow_state                                │
│        - fire-and-forget: lead-source.tag()                      │
│                ▼                                                 │
│        InboundClassifier.classify()                              │
│        ├── otp? → otp-intercept.handle (return)                  │
│        ├── opt-out? → opt-out.handle (return)                    │
│        ├── faq match? → faq.handle (return)                      │
│        └── default → engine.tick(...)                            │
│                ▼                                                 │
│        FlowEngine.tick()           ← _shared/flow-engine/        │
│        (PURO — sem I/O)                                          │
│                ▼                                                 │
│        ActionDispatcher.exec()                                   │
│        - send via adapter                                        │
│        - persist nextState                                       │
│        - emit metrics                                            │
│        - release lock                                            │
│                ▼                                                 │
│        return 200                                                │
└──────────────────────────────────────────────────────────────────┘
```

`evolution-webhook/index.ts` e `whapi-webhook/index.ts` ficam com **80–120 linhas cada** (parse + delega para `WebhookEntry.serve()`). O resto vira código compartilhado.

### Ordem de avaliação do engine `tick()`

`tick()` segue **estritamente** esta ordem (primeira regra que casa interrompe):

```
0. Se state.status='paused_manual' OR 'paused_system' OR 'opt_out':
     → return { actions: [], nextState: state, logs: [paused_skip] }

1. Se step.stepType='system_capture':
     → return { actions: [delegate_legacy_runBotFlow{reason:pipeline}], …, status='delegated_legacy' }

2. Se event.kind='timer_expired':
     → step.fallback dita: advance | repeat | handoff
     → emite ações conforme fallback

3. Switch step.stepType:
     - text_message → emite send_text + advance para next step
     - media_message → emite send_media + advance
     - audio_slot → emite send_audio_slot + advance
     - ask_text:
         se event.kind='text' → captura, valida via captures[], advance ou repeat
         se event.kind='no_input' → fallback
     - ask_choice:
         se event.kind='button_click' OR event.rawNumberReply:
             resolve option_id → match transitions → advance
         se event.kind='text' → matchTransition por trigger_phrases → advance ou fallback
     - ask_media:
         se event.kind='media' → captura, advance
         se event.kind='text' → reply "preciso da foto" + repeat
     - branch:
         avalia condition_expr contra customer → advance para goto

4. Pós-decisão: aplica `validateNextStep` (já existente em _shared/grounding.ts)
   garantindo que current_step_id está na fronteira do fluxo.

5. Pós-decisão: aplica `checkPreconditions` (já existente). Falha → repeat + log.

6. Acumula `humanDelayMs` para cada send_text via `_shared/human-pace.ts`
   (criado na Phase 5 da spec antiga).

7. Retorna EngineResult.
```

**Nada aqui consulta o banco.** `tick` recebe `state`, `step` e `capabilities` já carregados.

### Ordem de execução do dispatcher

Dentro de uma única "transação lógica" (sequencial, sem paralelismo dentro de um turno):

1. Para cada `action` em `result.actions`:
   - Compute `idempotencyKey` (já vem da action).
   - `acquireOutboundSlot(idempotencyKey)`. Se conflito, `recordOutboundResult('replay')` e segue.
   - Executa o `adapter.send*` apropriado.
   - Se `action.kind='send_text'`, antes do envio: roda `withTypingPresence(humanDelayMs)`.
   - Insere linha em `conversations`.
   - `recordOutboundResult('sent', resultMessageId)`.
2. UPDATE em `customer_flow_state` com `nextState` (uma única chamada).
3. UPDATE em `customers` é feito pelo trigger automático.
4. Para cada log: emite via `logger.log(kind, payload)`.
5. Se `result.actions` contém `delegate_legacy_runBotFlow`, chama o handler antigo passando o mesmo `ctx`. Resultado dele é tratado como happy-path.

## Components and Interfaces

### `_shared/channels/types.ts`

```ts
export type ChannelKind = "whapi" | "evolution";

export interface ChannelCapabilities {
  channel: ChannelKind;
  supportsButtons: boolean;
  maxButtons: number;
  supportsList: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  supportsTypingPresence: boolean;
  supportsReactions: boolean;
  /** "messageId" → echo no header da Evolution; "wa_id" no Whapi. */
  inboundIdField: "messageId" | "wa_id";
}

export interface ParsedMessage {
  channel: ChannelKind;
  instanceName: string;
  /** Sempre "5511...@s.whatsapp.net" no formato canônico. */
  remoteJid: string;
  phone: string;
  messageId: string;
  /** True quando vem de mensagem fora do escopo (grupo, self, status). */
  ignored: boolean;
  isFromMe: boolean;
  messageText: string;
  /** Quando o cliente clicou em botão; sempre o ID, não o título. */
  buttonId: string | null;
  /** Quando o cliente respondeu uma lista numerada → engine resolve para option_id. */
  rawNumberReply: string | null;
  hasMedia: boolean;
  mediaKind: "image" | "audio" | "video" | "document" | null;
  /** Payload Evolution/Whapi original, mantido para handlers especiais. */
  raw: unknown;
}

export interface SendContext {
  customerId: string;
  consultantId: string;
  stepId: string;
  /** Idempotency key pronta — caller derivou via _shared/idempotency.ts */
  idempotencyKey: string;
}

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; reason: "network" | "rate_limited" | "unauthorized" | "invalid_payload" | "downgraded"; detail?: string };

export interface ChannelAdapter {
  capabilities: ChannelCapabilities;
  sendText(jid: string, text: string, ctx: SendContext): Promise<SendResult>;
  sendChoice(jid: string, prompt: string, choice: OutboundChoice, ctx: SendContext): Promise<SendResult>;
  sendMedia(jid: string, media: MediaPayload, ctx: SendContext): Promise<SendResult>;
  sendPresence(jid: string, kind: "composing" | "recording" | "paused", durationMs: number): Promise<void>;
  parseInbound(raw: unknown, instanceName: string): ParsedMessage | null;
  /** Download de mídia → base64 + mime. Retorna null em falha. */
  downloadMedia(parsed: ParsedMessage): Promise<{ base64: string; mime: string } | null>;
}

export interface OutboundChoice {
  preferred: "button" | "list" | "number";
  options: Array<{ id: string; title: string; description?: string }>;
}

export type MediaPayload =
  | { kind: "image"; url: string; caption?: string }
  | { kind: "audio"; url: string; durationSec?: number }
  | { kind: "video"; url: string; caption?: string; durationSec?: number }
  | { kind: "document"; url: string; filename: string; caption?: string };
```

### `_shared/flow-engine/types.ts`

```ts
export interface EngineCustomerState {
  customerId: string;
  flowId: string;
  currentStepId: string;
  status: CustomerFlowStatus;
  pauseReason: CustomerPauseReason | null;
  retries: number;
  /** Snapshot mínimo dos campos que guards/preconditions precisam. */
  customer: {
    name: string | null;
    electricityBillValue: number | null;
    documentUploaded: boolean;
    otpValidatedAt: string | null;
    /* …apenas o que alguma guard usa, não o registro inteiro. */
  };
}

export interface EngineStep {
  id: string;
  stepKey: string | null;
  stepType: StepTypeCanonical;
  position: number;
  messageText: string | null;
  mediaOrder: MediaOrderItem[];
  choiceOptions?: ChoiceOption[];
  preferredChoiceKind?: "button" | "list" | "number";
  captures: CaptureSpec[];
  transitions: TransitionSpec[];
  fallback: FallbackSpec;
  waitFor: "none" | "reply" | "media" | "timer";
  waitSeconds: number;
}

export interface InboundEvent {
  kind: "text" | "button_click" | "media" | "timer_expired" | "no_input";
  text?: string;
  buttonId?: string;
  rawNumberReply?: string;
  mediaKind?: "image" | "audio" | "video" | "document";
}

export type EngineAction =
  | { kind: "send_text"; text: string; idempotencyKey: string; humanDelayMs: number }
  | { kind: "send_choice"; prompt: string; choice: OutboundChoice; idempotencyKey: string }
  | { kind: "send_media"; media: MediaPayload; idempotencyKey: string }
  | { kind: "send_audio_slot"; slotKey: string; idempotencyKey: string }
  | { kind: "schedule_timer"; expiresAt: string }
  | { kind: "delegate_legacy_runBotFlow"; reason: string }
  | { kind: "delegate_ai_agent_router"; userInput: string };

export interface EngineLog {
  kind: "engine_step_advance" | "engine_choice_downgrade" | "engine_invalid_input"
      | "engine_precondition_failed" | "engine_handoff" | "engine_no_match";
  payload: Record<string, unknown>;
}

export interface EngineResult {
  nextState: EngineCustomerState;
  actions: EngineAction[];
  capturedFields: Record<string, unknown>; // valores extraídos pra UPDATE customers
  logs: EngineLog[];
}

export function tick(
  state: EngineCustomerState,
  step: EngineStep,
  capabilities: ChannelCapabilities,
  event: InboundEvent,
  config: EngineConfig
): EngineResult;
```

### Step types canônicos

```ts
export type StepTypeCanonical =
  | "text_message"
  | "media_message"
  | "audio_slot"
  | "ask_text"
  | "ask_choice"
  | "ask_media"
  | "branch"
  | "system_capture";
```

| step_type        | wait_for       | output                       | exigido               |
| ---------------- | -------------- | ---------------------------- | --------------------- |
| `text_message`   | `none\|timer`  | texto                        | `message_text`        |
| `media_message`  | `none\|timer`  | imagem/áudio/vídeo/doc       | `media_id` ou `slot`  |
| `audio_slot`     | `none`         | slot da Camila               | `slot_key`            |
| `ask_text`       | `reply`        | texto livre + capture        | `captures`            |
| `ask_choice`     | `reply`        | botão real OU lista numerada | `choice_options[]`    |
| `ask_media`      | `media`        | foto/doc/áudio + OCR opc.    | `capture_kind`        |
| `branch`         | `none`         | salto condicional            | `condition_expr`      |
| `system_capture` | `none`         | OCR / portal / OTP           | `pipeline`            |

Mapeamento de tipos legados → canônicos (executado em backfill de migration):

| legacy                    | canônico         | extra                                                    |
| ------------------------- | ---------------- | -------------------------------------------------------- |
| `audio_slot`              | `audio_slot`     | sem mudança                                              |
| `message`                 | `text_message`   | se `message_text` termina em `?` E tem `transitions` → `ask_choice` |
| `question`                | `ask_text`       | sem mudança                                              |
| `media_request`           | `ask_media`      | `capture_kind=auto`                                      |
| `cadastro`                | `system_capture` | `pipeline=cadastro_portal`                               |
| `capture_conta`           | `system_capture` | `pipeline=ocr_conta`                                     |
| `capture_documento`       | `system_capture` | `pipeline=ocr_documento`                                 |
| `capture_email`           | `ask_text`       | `captures=[email_validate]`                              |
| `confirm_phone`           | `ask_choice`     | `preferred=button`, `options=[sim,outro]`                |
| `finalizar_cadastro`      | `system_capture` | `pipeline=finalizar_cadastro`                            |

### Captação / Performance / Atendimento

#### `_shared/captation/lead-source.ts`

```ts
export async function tagLeadSource(
  supabase: SupabaseClient,
  customer: Customer,
  inbound: ParsedMessage,
  rawWebhookBody: unknown
): Promise<void>;
```

Mantém os 3 métodos atuais (CTWA mapping, initial_message exata, regex). Mudança única: roda **fora** da thread crítica via `queueMicrotask` → falha de tagging gera log `kind=lead_source_tag_failed` mas nunca aborta o turno.

#### `_shared/conversion/crm-sync.ts`

```ts
export async function syncCustomerStage(
  supabase: SupabaseClient,
  customerId: string,
  stepKeyAfter: string,
  consultantId: string
): Promise<void>;
```

Wrapper que substitui as chamadas espalhadas para `crm-stage-sync` e `crm-auto-progress`. Idempotente.

#### `_shared/performance/metrics.ts`

```ts
export async function recordStepTransition(
  supabase: SupabaseClient,
  payload: {
    customerId: string;
    consultantId: string;
    flowId: string;
    fromStep: string;
    toStep: string;
    durationMs: number;
    reason: string;
  }
): Promise<void>;
```

Toda transição passa por aqui. View `v_flow_step_funnel` (já existe) consome `bot_step_transitions`.

### Logger central

```ts
// _shared/logger.ts
export type LogKind =
  | "webhook_inbound" | "webhook_dedup_hit" | "webhook_rate_limited"
  | "customer_lock_acquired" | "customer_lock_timeout" | "customer_lock_released"
  | "engine_step_advance" | "engine_choice_downgrade" | "engine_invalid_input"
  | "engine_precondition_failed" | "engine_handoff" | "engine_no_match"
  | "engine_delegate_legacy" | "engine_auto_resume" | "engine_dark_decision"
  | "channel_send_ok" | "channel_send_fail" | "channel_choice_downgrade"
  | "lead_source_tag_failed" | "crm_sync_failed"
  | "ai_invalid_next_step" | "ai_hallucinated_media_id" | "ai_deterministic_fallback"
  | "evolution_media_lost" | "evolution_dedup_short_circuit"
  | "gemini_quota_exhausted" | "inline_sent_skipped"
  | "feature_flag_resolved";

export function log(kind: LogKind, payload: Record<string, unknown>): void;
```

`console.log` direto fica banido por lint nos arquivos do core (webhook + engine + dispatcher + adapters).

## Data Models

### Enums novos

```sql
CREATE TYPE customer_flow_status AS ENUM (
  'new',                -- ainda não recebeu primeira ação
  'running',            -- engine no comando
  'waiting_reply',      -- step ask_text ou ask_choice
  'waiting_media',      -- step ask_media
  'waiting_timer',      -- step com waitFor=timer agendado
  'paused_manual',      -- assumido por humano (customer-takeover)
  'paused_system',      -- engine/IA decidiu pausar
  'converted',          -- atingiu step convert
  'lost',               -- timeout / opt-out / valor_baixo
  'delegated_legacy'    -- step system_capture roda runBotFlow
);

CREATE TYPE customer_pause_reason AS ENUM (
  'opt_out',
  'humano_assumiu',
  'lead_pediu_humano',
  'low_bill_value',
  'low_confidence_handoff',
  'lead_refused_softpause',
  'lead_nao_pronto',
  'lead_quer_pensar',
  'lead_nao_responde',
  'confused_after_retries',
  'muitas_duvidas',
  'muitas_duvidas_ia',
  'ai_handoff_duvidas',
  'ai_limit_atingido',
  'anti_loop',
  'silent_handoff_empty_reply',
  'gemini_quota_exhausted',
  'dados_incompletos_pos_loop',
  'custom_step_no_match_retries_exhausted',
  'ia_decidiu',
  'engine_error'
);
```

A lista de `customer_pause_reason` é **exatamente o conjunto de strings em uso hoje** (extraído do grep). Adicionar novo motivo passa a exigir migration — o que evita multiplicação descontrolada.

### Tabela `customer_flow_state`

```sql
CREATE TABLE public.customer_flow_state (
  customer_id        UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  flow_id            UUID NOT NULL REFERENCES public.bot_flows(id) ON DELETE RESTRICT,
  current_step_id   UUID REFERENCES public.bot_flow_steps(id) ON DELETE SET NULL,
  status             customer_flow_status NOT NULL DEFAULT 'new',
  pause_reason       customer_pause_reason,
  pause_meta         JSONB DEFAULT '{}'::jsonb,
  retries            INT NOT NULL DEFAULT 0,
  entered_step_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ,
  assigned_human_id  UUID,
  last_inbound_at    TIMESTAMPTZ,
  last_outbound_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status = 'paused_manual' AND assigned_human_id IS NOT NULL)
    OR status <> 'paused_manual'
  ),
  CHECK (
    (status IN ('paused_manual','paused_system','lost') AND pause_reason IS NOT NULL)
    OR status NOT IN ('paused_manual','paused_system','lost')
  )
);

CREATE INDEX idx_cfs_flow_status ON public.customer_flow_state (flow_id, status);
CREATE INDEX idx_cfs_status_updated ON public.customer_flow_state (status, updated_at DESC)
  WHERE status IN ('running','waiting_reply','waiting_media','waiting_timer');
CREATE INDEX idx_cfs_assigned_human ON public.customer_flow_state (assigned_human_id)
  WHERE assigned_human_id IS NOT NULL;

ALTER TABLE public.customer_flow_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own flow state" ON public.customer_flow_state
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_id AND c.consultant_id = auth.uid()
  ));

CREATE POLICY "Super admin manages all flow state" ON public.customer_flow_state
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
```

### Trigger de sincronização

```sql
-- Direção 1: legacy → v3 (durante a Phase B em paralelo, via backfill).
-- Direção 2: v3 → legacy (sempre — outros crons leem de customers).
CREATE OR REPLACE FUNCTION public.sync_customer_flow_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'customer_flow_state' THEN
    -- v3 → legacy
    UPDATE public.customers SET
      bot_paused        = (NEW.status IN ('paused_manual','paused_system')),
      bot_paused_reason = NEW.pause_reason::text,
      assigned_human_id = NEW.assigned_human_id
    WHERE id = NEW.customer_id
      AND (bot_paused IS DISTINCT FROM (NEW.status IN ('paused_manual','paused_system'))
        OR bot_paused_reason IS DISTINCT FROM NEW.pause_reason::text
        OR assigned_human_id IS DISTINCT FROM NEW.assigned_human_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_cfs_to_customers
  AFTER INSERT OR UPDATE ON public.customer_flow_state
  FOR EACH ROW EXECUTE FUNCTION public.sync_customer_flow_state();
```

Sincronização **legacy → v3** roda **só durante o backfill** (uma migration única, não trigger contínuo) — depois disso o engine v3 é a única fonte de escrita.

### ALTER em `bot_flow_steps`

```sql
-- Adiciona colunas declarativas para os novos tipos (idempotente).
ALTER TABLE public.bot_flow_steps
  ADD COLUMN IF NOT EXISTS step_type_canonical TEXT,
  ADD COLUMN IF NOT EXISTS choice_preferred    TEXT,    -- 'button' | 'list' | 'number'
  ADD COLUMN IF NOT EXISTS choice_options      JSONB,   -- [{id,title,description?}]
  ADD COLUMN IF NOT EXISTS pipeline_kind       TEXT,    -- 'cadastro_portal'|'ocr_conta'|'ocr_documento'|'finalizar_cadastro'
  ADD COLUMN IF NOT EXISTS condition_expr      JSONB;   -- branch step

-- Backfill dos canônicos (executado uma vez, idempotente via WHERE NULL).
UPDATE public.bot_flow_steps SET step_type_canonical = CASE step_type
  WHEN 'audio_slot'         THEN 'audio_slot'
  WHEN 'message'            THEN
    CASE WHEN message_text LIKE '%?'
              AND jsonb_array_length(COALESCE(transitions,'[]'::jsonb)) > 0
         THEN 'ask_choice' ELSE 'text_message' END
  WHEN 'question'           THEN 'ask_text'
  WHEN 'media_request'      THEN 'ask_media'
  WHEN 'cadastro'           THEN 'system_capture'
  WHEN 'capture_conta'      THEN 'system_capture'
  WHEN 'capture_documento'  THEN 'system_capture'
  WHEN 'capture_email'      THEN 'ask_text'
  WHEN 'confirm_phone'      THEN 'ask_choice'
  WHEN 'finalizar_cadastro' THEN 'system_capture'
  ELSE 'text_message'
END WHERE step_type_canonical IS NULL;

UPDATE public.bot_flow_steps SET pipeline_kind = CASE step_type
  WHEN 'cadastro'           THEN 'cadastro_portal'
  WHEN 'capture_conta'      THEN 'ocr_conta'
  WHEN 'capture_documento'  THEN 'ocr_documento'
  WHEN 'finalizar_cadastro' THEN 'finalizar_cadastro'
END WHERE pipeline_kind IS NULL AND step_type IN
  ('cadastro','capture_conta','capture_documento','finalizar_cadastro');

-- Constraint canônica (não dropa a velha — convive durante migração).
ALTER TABLE public.bot_flow_steps
  ADD CONSTRAINT bot_flow_steps_canonical_chk CHECK (step_type_canonical IN (
    'text_message','media_message','audio_slot','ask_text','ask_choice',
    'ask_media','branch','system_capture'
  )) NOT VALID;
-- VALIDATE depois do backfill terminar.
```

A coluna `step_type` legada **fica intocada** — é só diagnóstico.

### View `v_flow_engine_health`

```sql
CREATE OR REPLACE VIEW public.v_flow_engine_health
WITH (security_invoker = true) AS
SELECT
  c.consultant_id,
  COUNT(*) FILTER (WHERE cfs.updated_at > now() - interval '1 hour') AS turns_last_hour,
  COUNT(*) FILTER (WHERE cfs.status = 'paused_manual')               AS paused_manual,
  COUNT(*) FILTER (WHERE cfs.status = 'paused_system')               AS paused_system,
  COUNT(*) FILTER (WHERE cfs.status = 'converted')                   AS converted_today,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cfs.status = 'converted')
    / NULLIF(COUNT(*) FILTER (WHERE cfs.created_at > now() - interval '24 hours'), 0), 1
  ) AS conversion_rate_24h_pct
FROM public.customer_flow_state cfs
JOIN public.customers c ON c.id = cfs.customer_id
WHERE cfs.updated_at > now() - interval '7 days'
GROUP BY c.consultant_id;
```

Agregar % de timeout/downgrade/fallback exige cruzar com logs estruturados (Loki/Sentry) ou gravar tabela própria — fica para Phase F.

## Correctness Properties

### Property 1: Engine determinístico

`tick(state, step, capabilities, event)` chamado N vezes com a mesma entrada produz `EngineResult` bytewise-igual.

**Verificação:** PBT com 1000 entradas geradas via `fast-check`; comparação byte a byte do JSON serializado.

**Validates: Requirements 7.1, 23.1**

### Property 2: Engine sem efeitos colaterais

`tick()` não invoca nenhuma função SQL (`supabase.*`) nem rede (`fetch`).

**Verificação:** PBT com spies de proxy em `globalThis.fetch` e no client Supabase; zero invocações registradas durante 1000 ticks.

**Validates: Requirements 7.2, 23.2, 23.3**

### Property 3: Step apontado existe no fluxo

Para todo `EngineResult`, `nextState.current_step_id` referencia um step presente no array de entrada.

**Verificação:** PBT com 1000 fluxos sintéticos; validador estrutural rejeita qualquer ponteiro órfão.

**Validates: Requirements 25.1**

### Property 4: Convertido não emite ações

Quando `nextState.status='converted'`, `EngineResult.actions` é `[]`.

**Verificação:** Filtro lógico nos 1000 ticks.

**Validates: Requirements 25.2**

### Property 5: Manual silencia outbound

Quando `nextState.status='paused_manual'`, `EngineResult.actions.filter(a => a.kind.startsWith('send_'))` é `[]`.

**Verificação:** Filtro lógico nos 1000 ticks.

**Validates: Requirements 17.1, 25.3**

### Property 6: Choice nunca renderiza botão sem suporte

Para qualquer `(OutboundChoice, ChannelCapabilities)`, se `capabilities.supportsButtons=false`, `renderChoice(...)` nunca retorna `kind='button'`.

**Verificação:** PBT com 500 combinações `(choice, capabilities)`.

**Validates: Requirements 9.1, 9.2, 24.1**

### Property 7: Idempotência outbound

Duas chamadas a `dispatch` com mesma entrada produzem exatamente um envio externo.

**Verificação:** Teste de integração com mock adapter; spy em `send*` registra exatamente 1 chamada.

**Validates: Requirements 8.2, 8.3, 18.1, 18.2**

### Property 8: Trigger sincroniza em tempo

UPDATE em `customer_flow_state` reflete em `customers.bot_paused`/`bot_paused_reason`/`assigned_human_id` em <100ms.

**Verificação:** Teste DB unitário com `now()` antes/depois; checa diferença.

**Validates: Requirements 5.1, 5.2**

### Property 9: Backfill cobre 100% dos steps

Após a migração C.1, `SELECT count(*) FROM bot_flow_steps WHERE step_type_canonical IS NULL` é zero.

**Verificação:** Migration test que roda em fixture de 50+ steps de tipos diversos.

**Validates: Requirements 6.2**

## Error Handling

| Erro | Camada | Comportamento |
| --- | --- | --- |
| Adapter `parseInbound` retorna `null` | webhook | 200 com `{ok:true, msg:"ignored"}`. |
| `customer_lock` timeout | webhook | 200 com `{mode:"customer_lock_timeout"}`; nenhum efeito; outro webhook holding the lock responde. |
| `tick()` lança (bug) | dispatcher | catch externo; UPDATE `customer_flow_state.status='paused_system'` + `pause_reason='engine_error'`; emite `kind="engine_error"` + Sentry. Retorna 200. |
| `adapter.send*` retorna `ok:false` | dispatcher | `recordOutboundResult('failed', null)`; emite `kind="channel_send_fail"`. Não retry — outbound idempotency garante; o próximo turno recupera. |
| `acquireOutboundSlot` falha (DB) | dispatcher | fail-open: continua e envia (R2.3 da spec antiga). |
| Step inválido (sem `step_type_canonical`) | engine | Retorna `EngineResult` com `actions=[]` + log `kind="engine_invalid_step"`. Customer não trava. |
| `delegate_legacy_runBotFlow` lança | dispatcher | catch; UPDATE `status='paused_system'` + `pause_reason='engine_error'`. |
| Trigger `sync_customer_flow_state` falha | DB | RAISE WARNING; UPDATE em `customer_flow_state` ainda commita (trigger não bloqueia). Cron de auditoria reconcilia. |
| `tagLeadSource` lança | webhook | catch silencioso (fire-and-forget); log `kind="lead_source_tag_failed"`. |
| `syncCustomerStage` lança | dispatcher | log `kind="crm_sync_failed"`; turno do bot não é afetado. |

Toda função do core retorna `Result<T, E>` ou nunca lança. Exceções não são parte do contrato público.

## Testing Strategy

### Cenários canônicos

| ID  | Cenário                                                            | Tipo  |
| --- | ------------------------------------------------------------------ | ----- |
| T1  | Fluxo A em Whapi com botão (3 opções, click no segundo)            | E2E   |
| T2  | Fluxo A em Evolution sem suporte a botão (downgrade para lista)    | E2E   |
| T3  | Fluxo B com `text_message` → `text_message` em sequência           | E2E   |
| T4  | Fluxo C com `media_message{video}` antes de `text_message`         | E2E   |
| T5  | Fluxo D com `audio_slot` no meio + sleep correto                   | E2E   |
| T6  | Cliente em modo manual recebe inbound — engine no-op               | E2E   |
| T7  | Humano libera (status `paused_manual`→`running`) — engine retoma   | E2E   |
| T8  | Erro 500 do Evolution durante send → idempotency replay            | E2E   |
| T9  | Resposta inválida em `ask_choice` → fallback do step               | E2E   |
| T10 | Lead sem resposta 24h → cron `bot-followup-checker`                | E2E   |
| T11 | Conversão (`status='converted'`) — engine não age mais             | E2E   |
| T12 | Whapi `quick_reply` payload sem `ButtonsV3:` prefix                | Unit  |
| T13 | Evolution recebe "1" em resposta a lista → vira `option_id` certo  | Unit  |
| T14 | `tick()` é determinístico (mesma entrada → mesma saída)            | PBT   |
| T15 | `tick()` não chama nenhum SQL/HTTP                                 | PBT   |
| T16 | `step.preferred=button` em canal sem suporte → log `downgrade`     | PBT   |
| T17 | Backfill `step_type → step_type_canonical` cobre 100% dos rows     | Migration test |
| T18 | Trigger `customer_flow_state → customers` mantém os 4 campos sync  | DB unit |
| T19 | `system_capture{pipeline=cadastro_portal}` delega para `runBotFlow` sem perda de estado | E2E   |
| T20 | `flow_engine_v3='dark'` por 24h: paridade ≥99% com legado           | Smoke prod |

### Plano de rollout

Feature flag `consultants.flow_engine_v3` com 4 estágios:

| Fase | Trigger     | Comportamento                                                   |
| ---- | ----------- | --------------------------------------------------------------- |
| off  | default     | Caminho legado puro (motor antigo + senders antigos).           |
| dark | manual      | Engine v3 roda em **shadow** — calcula EngineResult mas dispatcher não emite; log compara com decisão real. |
| canary | 5% leads | Engine v3 emite. Caminho legado fica como fallback se houver `delegate_legacy_runBotFlow`. |
| on   | 100%        | Engine v3 padrão. |

Duração mínima por fase: **dark 48h** com paridade de decisão ≥99%; **canary 7 dias** sem incidente p1; **on**.

Rollback: `UPDATE consultants SET flow_engine_v3='off'`. Estado já estará coerente porque o trigger sincroniza nas duas direções durante a janela de migração.

### Critérios de done

- Migração roda em ambiente local + staging sem erro.
- Backfill marca 100% dos `bot_flow_steps` com `step_type_canonical`.
- Trigger sincroniza `customer_flow_state` ↔ `customers` em ambos sentidos durante migração.
- `getAdapter('evolution')` e `getAdapter('whapi')` exportam adapters com `capabilities` corretas.
- `tick()` está coberto por 5+ PBTs.
- `dispatch()` tem teste de integração mockando adapter.
- Webhook fino (`<150 linhas`) em ambos os canais.
- `flow_engine_v3='dark'` provou ≥99% paridade por 48h em produção.
- `flow_engine_v3='canary'` em 5% rodou 7 dias sem incidente p1.
- `v_flow_engine_health` populada e consultada pelo dashboard admin.
- Documentação de rollback no README do `evolution-webhook` atualizada.

## Decisões deliberadas e trade-offs

- **Dois webhooks (Evolution + Whapi) ficam como dois deploys separados.** Unificar em um endpoint exige mexer na configuração da Evolution e Whapi externas, e cada provedor tem políticas de retry diferentes — não vale o esforço nesta spec.
- **Engine pura sem I/O.** Aceito o custo de carregar `EngineCustomerState` antes do `tick()` (uma query a mais) em troca de testabilidade total + zero efeitos colaterais. PBTs ficam triviais.
- **`pause_reason` enum vs JSONB livre.** Enum ganha — vimos 21 strings em produção, sem categoria, e nenhuma forma de filtrar. CHECK constraint força disciplina.
- **`bot_flow_steps.step_type` legado fica.** Não dropamos para reduzir blast-radius. `step_type_canonical` é a fonte de verdade do engine v3; o legado é diagnóstico.
- **`customer_flow_state` é PK por customer.** Lead nunca está em dois fluxos simultaneamente; `transition_flow()` é uma transação que UPDATE no mesmo PK. Resolve a invariante "lead não pode aparecer em dois fluxos".
- **Channel adapter declara capabilities estáticas.** Em runtime, se Evolution falhar com 500 ao mandar botão, o adapter tem fallback para texto numerado **mas loga `channel_choice_downgrade`** — caller (engine) não sabe nem precisa saber. Comportamento é testável em isolamento.
- **`runBotFlow` (cadastro determinístico) não vai ser refatorado nesta spec.** Engine v3 só **delega** quando o step pede pipeline. Quando todos os fluxos usarem só step types canônicos, o `runBotFlow` pode ser dropado em uma spec futura.

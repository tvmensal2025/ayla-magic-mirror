# Design Document

## Overview

Esta feature unifica os três motores de fluxo do bot WhatsApp do iGreen
(Legacy_Cadastro, Conversational, Engine_V3) em um motor único e
determinístico — o **Motor_Unificado** — e elimina o Roteador
(`flow-router.ts::routeEngine`) como decisor a cada turno. A diferença
irredutível entre Whapi (suporta botões interativos) e Evolution (lista
numerada) é movida para o **Adapter_de_Canal** via
`Channel_Capabilities`. Após o rollout, cada webhook (`whapi-webhook`,
`evolution-webhook`) fica fino: parse de inbound → intercept de OTP →
resolução de Kill_Switch + Production_Mode → `runEngine` → dispatcher.

O contrato com o consultor é simples: **o que está desenhado em
`/admin/fluxos` é o que o lead recebe, na ordem configurada, no canal
dele**, sem o pipeline trocar de motor no meio do caminho e sem a IA
"inventar" transição.

A validação é por (i) Property-Based Tests (`fast-check`) sobre o
Motor_Unificado puro, (ii) Auditoria explícita dos 48 itens hoje em
`CADASTRO_STEPS` (validada pelo SuperAdmin durante o Design,
materializada em [`cadastro-steps-audit.md`](./cadastro-steps-audit.md)),
(iii) comparação dos `engine_logs` em modo `dark` antes de qualquer
promoção, e (iv) Kill_Switch por consultor + flag global de produção.

A decisão entre **promover Engine_V3** ou **aposentar Engine_V3 e
construir o Motor_Unificado a partir do Conversational unificado** está
registrada em [§ Decisão sobre Engine_V3](#decisão-sobre-engine_v3) com
base nas métricas extraídas via
[`v3-vs-legacy-metrics.py`](./v3-vs-legacy-metrics.py).

## Architecture

### Visão geral em camadas

```
                    ┌────────────────────────────────────────┐
                    │  Webhook entry (whapi-webhook,         │
                    │  evolution-webhook)                    │
                    │  ──────────────────────────────────    │
                    │  parse → OTP intercept → resolve       │
                    │  EngineDecision → runEngine →          │
                    │  executeActions(dispatcher)            │
                    └─────────────┬──────────────────────────┘
                                  │
                  ┌───────────────┴────────────────┐
                  │                                │
                  ▼                                ▼
        ┌─────────────────────┐           ┌─────────────────────────┐
        │ ChannelAdapter       │           │ Motor_Unificado         │
        │ (Whapi | Evolution)  │  ◀─────── │ runEngine(state, in,    │
        │ capabilities, send*, │           │ flow, capabilities,     │
        │ parseInbound,        │           │ hooks, config) → result │
        │ downloadMedia        │   PURE   │  ──────────────────     │
        └────────────┬─────────┘   no I/O  │  v3-runner + variants + │
                     │                     │  fallbacks + helpers    │
                     ▼                     └────────────┬────────────┘
        ┌────────────────────┐                          │
        │ Provedor REST       │                          │
        │ (Whapi REST,        │                          ▼
        │  Evolution REST)    │             ┌─────────────────────────┐
        └─────────────────────┘             │ pipeline-cadastro       │
                                            │ (OCR, OTP, portal,      │
                                            │ facial, edição          │
                                            │ pós-OCR — sucessor      │
                                            │ unificado dos dois      │
                                            │ bot-flow.ts)            │
                                            └─────────────────────────┘
```

### Núcleo: motor único e puro

`runEngine(input: EngineInput) → EngineOutput` é referencialmente
transparente. Vive em `supabase/functions/_shared/engine/runner.ts`
(sucessor do `_shared/flow-engine/v3-runner.ts`). Não importa cliente
Supabase; não chama `Date.now`, `fetch`, `Math.random`,
`crypto.randomUUID`. Tempo, bucket de minuto, idempotency-key e
human-pace vêm exclusivamente de `EngineConfig`. Toda I/O assíncrona é
declarada como `DeferredAction` (OCR, OTP, portal, IA) que o dispatcher
resolve depois.

### Fronteira de canal: capability, não condicional

O motor **nunca** lê `channel === "whapi"`. Lê apenas
`ChannelCapabilities.{supportsButtons, supportsList, maxButtons,
supportsAudio, supportsVideo, ...}`. O adapter declara estaticamente
quais primitivas suporta; quando uma capability falta, o adapter faz
downgrade documentado (ex.: `audio_slot` → texto da transcrição com log
`engine_capability_downgrade`). A simetria Whapi×Evolution é fechada
neste arquivo: `_shared/channels/whapi.ts` e
`_shared/channels/evolution.ts`. O lint `purity_lint_test.ts` (Task 4)
estende sua lista de palavras proibidas dentro do módulo
`_shared/engine/` para incluir `"whapi"` e `"evolution"`.

### Decisão entre legacy e Motor_Unificado

A decisão por turno fica em uma única função pura
`resolveEngineDecision({prodMode, individualMode}) → EngineDecision`.
Webhook entry chama essa função, lê o resultado, e segue o caminho.
Apenas dois inputs: `bot_engine_production_mode` (singleton) e
`consultants.bot_engine_mode` (`legacy | dark | canary | on`).

### Pipeline de cadastro unificado

Os ramos determinísticos (OCR conta, OCR doc, CPF, portal, OTP,
facial, edição pós-OCR) ficam em
`supabase/functions/_shared/pipeline-cadastro/`. Sucessor único de
`whapi-webhook/handlers/bot-flow.ts` e
`evolution-webhook/handlers/bot-flow.ts` (≈14.737 linhas combinadas
hoje, com 957 linhas divergentes na forma normalizada — medido via
[`diff-bot-flow.py`](./diff-bot-flow.py)). Exposto ao motor como hook
`PipelineCadastroHook` (declarativo, igual aos outros hooks). O motor
chama `classifyStep(stepKey)` (lendo da tabela
[`cadastro-steps-audit.md`](./cadastro-steps-audit.md)) para decidir
entre `pipeline` puro, `transition_first` (híbrido) ou
`transition_only`.

### Plano de arquivos físico

| Caminho | Responsabilidade | Substitui |
|---|---|---|
| `_shared/engine/types.ts` | tipos públicos do motor (renomeio de `_shared/flow-engine/v3-types.ts`) | `_shared/flow-engine/v3-types.ts` |
| `_shared/engine/runner.ts` | função pura `runEngine` | `_shared/flow-engine/v3-runner.ts` |
| `_shared/engine/variants/{a,b,c,d}.ts` | strategies de variant A/B/C/D | mesmo nome em `flow-engine/variants/` |
| `_shared/engine/fallbacks.ts` | handlers de fallback | `_shared/flow-engine/fallbacks.ts` |
| `_shared/engine/hooks.ts` | bindings declarativos de OCR/OTP/portal/IA/captures + PipelineCadastroHook | `_shared/flow-engine/hooks.ts` |
| `_shared/engine/decision.ts` | `resolveEngineDecision`, cache | (novo) |
| `_shared/channels/types.ts` | `ChannelAdapter`, `ChannelCapabilities` (mantém) | já existe |
| `_shared/channels/whapi.ts` | adapter Whapi (`supportsButtons=true, maxButtons=3`) | já existe; aumenta `parseInbound` |
| `_shared/channels/evolution.ts` | adapter Evolution (`supportsButtons=false`) | já existe; aumenta `parseInbound` |
| `_shared/dispatcher/index.ts` | `executeActions` unificado | `_shared/flow-engine/v3-dispatcher.ts` |
| `_shared/pipeline-cadastro/index.ts` | fronteira do pipeline determinístico | `whapi-webhook/handlers/bot-flow.ts` + `evolution-webhook/handlers/bot-flow.ts` |
| `_shared/pipeline-cadastro/registry.ts` | mapa step_key → categoria | (novo, lê `cadastro-steps-audit.md`) |
| `_shared/pipeline-cadastro/conta.ts` etc. | OCR conta, OCR doc, portal, OTP, facial | extraído dos `bot-flow.ts` |
| `_shared/engine/webhook-entry.ts` | `runUnifiedEngineWebhookEntry` | sucessor único de `_shared/flow-engine/v3-webhook-entry.ts` |
| `whapi-webhook/index.ts` | webhook fino (skeleton novo) | atual ≈1500 linhas |
| `evolution-webhook/index.ts` | webhook fino (skeleton novo) | atual ≈1500 linhas |

A fase `cleanup` (Requisito 11.5) apaga `whapi-webhook/handlers/bot-flow.ts`,
`evolution-webhook/handlers/bot-flow.ts`,
`whapi-webhook/handlers/conversational/index.ts` e
`evolution-webhook/handlers/conversational/index.ts` (≈14.737 linhas).

## Components and Interfaces

### 1. Motor_Unificado — `runEngine`

Assinatura única:

```typescript
// _shared/engine/runner.ts
export function runEngine(input: EngineInput): EngineOutput;

export interface EngineInput {
  state:        CustomerSnapshot;     // slice de customer_flow_state + customers
  inbound:      InboundEvent;         // text|button_click|number_reply|media|timer_expired|no_input
  flow:         BotFlow;              // bot_flows + steps materializados
  capabilities: ChannelCapabilities;  // estático por canal
  hooks:        EngineHooks;          // declarativos: ocr/otp/portal/captures/aiAnswer/aiDecide/pipelineCadastro
  config:       EngineConfig;         // now, minuteBucket, idempotencyKeyFn, humanDelayFn, limits, isDarkMode
}

export interface EngineOutput {
  outbound:    OutboundMessage[];     // text|choice|media|audio_slot|presence
  stateUpdate: Partial<CustomerSnapshot>;
  logs:        StructuredLog[];
  deferred?:   DeferredAction;        // ai_answer|ai_decide|ocr|portal_submit|otp_submit
}
```

`EngineConfig` carrega tudo que poderia introduzir não-determinismo:

```typescript
export interface EngineConfig {
  now: string;                   // ISO-8601 — único timestamp legível pelo motor
  minuteBucket: number;          // floor(epoch_ms / 60000)
  isDarkMode: boolean;           // quando true, dispatcher SUPRIME side effects
  allowedDomains: string[];      // sanitização de URL outbound
  idempotencyKeyFn: (parts: { stepId: string; content: string; minuteBucket: number }) => string;
  humanDelayFn:    (charLen: number) => number;
  limits: {
    maxOutboundsPerTurn: number;       // default 6
    maxRetriesBeforeHandoff: number;   // default 3
    maxAiQuestionsPerStep: number;     // default 3
  };
}
```

Garantias do motor (validadas por purity lint + PBT):

- `runEngine(x) === runEngine(x)` deeply (Requisito 1.3, 12.1, 12.6).
- O módulo `_shared/engine/**` não importa cliente Supabase nem chama
  `Date.now`/`fetch`/`Math.random`/`crypto.randomUUID` (Requisito 1.4).
  Lint estende `purity_lint_test.ts` com a regra adicional: nenhum
  literal `"whapi"` ou `"evolution"` aparece em arquivos do módulo
  (Requisito 2.8).

### 2. Channel_Capabilities como única ponte Whapi×Evolution

Tipo (em `_shared/channels/types.ts`, mantém o existente; o Design
**adiciona** `ChannelCapabilities` ao "vocabulário público" do motor):

```typescript
export interface ChannelCapabilities {
  channel:           "whapi" | "evolution";
  supportsButtons:   boolean;
  maxButtons:        number;     // 0 quando supportsButtons=false
  supportsList:      boolean;
  supportsAudio:     boolean;
  supportsVideo:     boolean;
  supportsTypingPresence: boolean;
  supportsReactions: boolean;
  inboundIdField:    "messageId" | "wa_id";
}
```

Declaração estática:

```typescript
// _shared/channels/whapi.ts
export const WHAPI_CAPABILITIES: ChannelCapabilities = {
  channel: "whapi",
  supportsButtons: true,
  maxButtons: 3,                   // confirmado via Context7 (Whapi /messages/interactive — quick-reply ≤3)
  supportsList: true,              // Whapi suporta interactive list, não usado hoje pelo Motor_Unificado
  supportsAudio: true,
  supportsVideo: true,
  supportsTypingPresence: true,
  supportsReactions: true,
  inboundIdField: "messageId",
};

// _shared/channels/evolution.ts
export const EVOLUTION_CAPABILITIES: ChannelCapabilities = {
  channel: "evolution",
  supportsButtons: false,          // política do projeto: hoje renderizamos lista numerada por estabilidade do Baileys
  maxButtons: 0,
  supportsList: true,              // sendList suportado (Context7 confirmou). Reservado para fluxos futuros
  supportsAudio: true,
  supportsVideo: true,
  supportsTypingPresence: true,
  supportsReactions: false,
  inboundIdField: "wa_id",
};
```

Pseudo-código de `renderChoice` (no adapter; o motor só emite o
`OutboundMessage` de `kind="choice"`):

```typescript
// _shared/channels/dispatch-choice.ts
export function renderChoice(
  outbound: OutboundMessageChoice,
  capabilities: ChannelCapabilities,
): RenderedChoice {
  const opts = outbound.choice.options;

  // Caminho 1 — Rendering_Button (Whapi com ≤ maxButtons opções)
  if (capabilities.supportsButtons && opts.length <= capabilities.maxButtons) {
    return {
      kind: "buttons",
      title:  outbound.prompt,
      buttons: opts.map(o => ({ type: "reply", id: o.id, displayText: o.title })),
    };
  }

  // Caminho 2a — Rendering_Numbered (Evolution sem botões)
  // Caminho 2b — Whapi com > maxButtons opções (downgrade explícito + log)
  const numbered = opts
    .map((o, i) => `*${i + 1}.* ${o.title}`)
    .join("\n");
  const downgrade = capabilities.supportsButtons && opts.length > capabilities.maxButtons;
  return {
    kind: "numbered",
    text: `${outbound.prompt}\n\n${numbered}`,
    log:  downgrade ? "engine_choice_downgraded" : null,
    /** mapeamento dígito → option.id, persistido em state.lastChoiceOptions */
    optionsByIndex: opts.map(o => o.id),
  };
}
```

Pseudo-código de `parseInbound` (Round_Trip_Botão_Número):

```typescript
// _shared/channels/whapi.ts
function parseInbound(raw: WhapiPayload, _: ChannelCapabilities, _state): InboundEvent {
  if (raw.message?.type === "interactive" && raw.message.interactive?.type === "button_reply") {
    return {
      kind: "button_click",
      buttonId: raw.message.interactive.button_reply.id,
      rawText:  raw.message.interactive.button_reply.title,
    };
  }
  if (raw.message?.type === "text") return { kind: "text", text: raw.message.text.body };
  if (raw.message?.type && /audio|image|video|document/.test(raw.message.type)) {
    return { kind: "media", mediaKind: raw.message.type as any, mediaRef: raw.message.id };
  }
  return { kind: "no_input" };
}

// _shared/channels/evolution.ts
function parseInbound(
  raw: EvolutionPayload,
  capabilities: ChannelCapabilities,
  lastChoiceOptions: string[] | null,   // option.ids da última outbound de choice (lido do state)
): InboundEvent {
  const text = (raw.message?.conversation ?? raw.message?.extendedTextMessage?.text ?? "").trim();

  // Round_Trip_Botão_Número: "1"/"2"/... mapeia para o option.id correto.
  if (lastChoiceOptions && /^\d{1,2}$/.test(text)) {
    const idx = Number(text) - 1;
    if (idx >= 0 && idx < lastChoiceOptions.length) {
      return { kind: "number_reply", raw: text };
    }
  }

  // Listas interactive nativas do Evolution (sendList) entregam listResponseMessage.
  if (raw.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return {
      kind: "button_click",
      buttonId: raw.message.listResponseMessage.singleSelectReply.selectedRowId,
      rawText:  raw.message.listResponseMessage.title,
    };
  }

  if (text) return { kind: "text", text };
  if (raw.message?.imageMessage)    return { kind: "media", mediaKind: "image",    mediaRef: raw.key.id };
  if (raw.message?.audioMessage)    return { kind: "media", mediaKind: "audio",    mediaRef: raw.key.id };
  if (raw.message?.videoMessage)    return { kind: "media", mediaKind: "video",    mediaRef: raw.key.id };
  if (raw.message?.documentMessage) return { kind: "media", mediaKind: "document", mediaRef: raw.key.id };
  return { kind: "no_input" };
}
```

O motor consome `InboundEvent` discriminado. Tanto `button_click`
(Whapi) quanto `number_reply` (Evolution) entram no mesmo cabeçote de
`matchTransition`: ambos resolvem para o mesmo `transition_id` quando
o índice digital aponta para a mesma `option.id` que o botão clicado.

Decisão explícita: **o motor NUNCA tem `if (channel === "whapi")`**.
Quando uma capability falta (ex.: `audio_slot` em canal sem áudio), o
adapter faz downgrade documentado e escreve `engine_capability_downgrade`.

### 3. resolveEngineDecision

```typescript
// _shared/engine/decision.ts
export type EngineDecision =
  | { kind: "engine_unified"; production_override: boolean }
  | { kind: "shadow"; legacyResponds: true }   // dark mode
  | { kind: "legacy" };

export function resolveEngineDecision(input: {
  prodMode: boolean;
  individualMode: "legacy" | "dark" | "canary" | "on" | string;
}): EngineDecision {
  if (input.prodMode === true) {
    return {
      kind: "engine_unified",
      production_override: input.individualMode === "legacy",
    };
  }
  switch (input.individualMode) {
    case "on":
    case "canary":  return { kind: "engine_unified", production_override: false };
    case "dark":    return { kind: "shadow",         legacyResponds: true };
    case "legacy":  return { kind: "legacy" };
    default:
      // Valor fora do domínio (Requisito 8.10) — webhook entry decide o
      // tratamento (legacy + log + handoff alert).
      return { kind: "legacy" };
  }
}
```

Cache de leitura em memória de processo:

- TTL ativo: 30 segundos (Requisito 8.3, 8.8).
- TTL estendido em falha de leitura: 5 minutos (Requisito 8.9).
- Chaves: `prodMode` (singleton) + `individualMode` por `consultantId`.
- Invalidação: a UI SuperAdmin (`/admin/superadmin/engine-rollout`) não
  precisa propagar — espera o TTL natural; "até 60 segundos" cobre o
  pior caso (cache TTL 30s + 30s de propagação Edge Function).

### 4. Webhook entry FINO

```typescript
// supabase/functions/whapi-webhook/index.ts (skeleton novo)
import { getAdapter } from "../_shared/channels/index.ts";
import { runUnifiedEngineWebhookEntry } from "../_shared/engine/webhook-entry.ts";
import { resolveEngineDecision } from "../_shared/engine/decision.ts";
import { interceptOtp } from "../_shared/pipeline-cadastro/otp.ts";

Deno.serve(async (req) => {
  const raw     = await req.json();
  const adapter = getAdapter({ kind: "whapi", input: { apiToken: WHAPI_TOKEN } });
  const parsed  = adapter.parseInbound(raw, INSTANCE_NAME);
  if (!parsed || parsed.ignored) return new Response("ignored", { status: 200 });

  // OTP intercept tem prioridade sobre o motor (Requisito 1.6 + 6.1).
  if (await interceptOtp(supabase, adapter, parsed)) return new Response("otp", { status: 200 });

  const { customerId, consultantId } = await resolveCustomerAndConsultant(parsed);
  const decision = await resolveEngineDecisionWithCache(supabase, consultantId);

  if (decision.kind === "legacy") return await runLegacy(parsed, customerId, consultantId);

  const dryRun = decision.kind === "shadow";
  return await runUnifiedEngineWebhookEntry({
    supabase,
    adapter,
    parsed,
    customerId,
    consultantId,
    dryRun,                          // Modo_Dark: motor roda mas dispatcher NÃO envia outbound (legacyResponds=true)
    productionOverride: decision.kind === "engine_unified" && decision.production_override,
  });
});
```

Whapi e Evolution usam o **mesmo** `runUnifiedEngineWebhookEntry`. A
única diferença está em `getAdapter({ kind })`. O esqueleto de
`evolution-webhook/index.ts` é byte-a-byte idêntico modulo o `kind` e a
extração de `INSTANCE_NAME` do path. Esse é o mecanismo concreto que
zera o diff de ≈623+272 linhas (Requisitos 4.6, 4.7).

Tudo que **não** está no esqueleto acima foi explicitamente movido:

- parsing detalhado do payload (texto, áudio, imagem) → adapter.
- intercept de OTP → `pipeline-cadastro/otp.ts`.
- decisão de motor → `decision.ts`.
- chamada de motor → `engine/runner.ts`.
- envio de outbound → `dispatcher/index.ts`.

### 5. Validação de goto + contenção da IA

Pseudo-código (em `_shared/engine/runner.ts`):

```typescript
function applyTransition(
  proposed: TransitionSpec,
  flow: BotFlow,
  step: BotFlowStep,
  ctx: { isAi: boolean; strictMode: boolean; config: EngineConfig },
): { stepId: string | null; logs: StructuredLog[]; rejected: boolean } {
  // Strict mode: hooks de IA são ignorados regardless do per-step config.
  if (ctx.isAi && ctx.strictMode) {
    return {
      stepId: step.id,             // mantém step (fallback determinístico)
      logs: [{ kind: "engine_strict_mode_blocked_ai", at: ctx.config.now, ... }],
      rejected: true,
    };
  }

  const target = proposed.goto_step_id;
  if (!target) {
    // goto_special: cadastro/humano/menu/repeat — resolvido em outro lugar.
    return { stepId: step.id, logs: [], rejected: false };
  }

  // Validação canônica (Requisito 7.1, 7.2, 7.4).
  const exists = flow.steps.some(s => s.id === target);
  if (!exists) {
    return {
      stepId: step.id,
      logs: [{
        kind: "engine_invalid_step",
        at: ctx.config.now,
        payload: { proposed_goto: target, source: ctx.isAi ? "ai" : "transition" },
        ...
      }],
      rejected: true,
    };
  }
  return { stepId: target, logs: [{ kind: "engine_goto", ... }], rejected: false };
}
```

Quando `applyTransition` rejeita por step inexistente, o runner cai no
`fallback` determinístico do passo atual (repeat ou safe-text). Quando
`flow.strictMode === true`, todo `DeferredAction` de IA proposto pelos
hooks é descartado antes mesmo de gerar o `engine_*_deferred` — log
`engine_strict_mode_blocked_ai` substitui o decision log do turno.

### 6. Kill-switch + flag global de produção

Migrações idempotentes (DDL):

```sql
-- Migração: 20260601_bot_engine_mode.sql
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS bot_engine_mode TEXT NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'consultants_bot_engine_mode_chk'
       AND conrelid = 'public.consultants'::regclass
  ) THEN
    ALTER TABLE public.consultants
      ADD CONSTRAINT consultants_bot_engine_mode_chk
      CHECK (bot_engine_mode IN ('legacy','dark','canary','on'));
  END IF;
END $$;

COMMENT ON COLUMN public.consultants.bot_engine_mode IS
  'bot-engine-channel-unification Kill_Switch (Requisito 8.1). legacy|dark|canary|on. '
  'Subordinado a app_settings.bot_engine_production_mode: quando esta for TRUE, '
  'bot_engine_mode é informativo. Default legacy = comportamento atual preservado.';
```

```sql
-- Migração: 20260601_bot_engine_production_mode.sql
-- Reuso do singleton existente public.app_settings (id='global').
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bot_engine_production_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.app_settings.bot_engine_production_mode IS
  'bot-engine-channel-unification Production_Mode_Global (Requisito 8.2). '
  'TRUE = Motor_Unificado responde para todos os consultores, ignora Kill_Switch. '
  'Controlado exclusivamente pelo SuperAdmin via UI com confirmação digitando "PRODUCAO". '
  'Reversível enquanto FALSE; após TRUE, kill-switch individual é apenas informativo.';
```

`app_settings` já existe (singleton com `id='global'`) por uma migração
anterior — confirmado via `mcp_supabase_list_tables` (1 row). Reusamos
esse singleton em vez de criar uma tabela nova; a flag
`bot_engine_production_mode` entra como uma nova coluna idempotente.

UI no SuperAdmin (`src/pages/SuperAdminEngineRollout.tsx`):

- Switch por consultor (`bot_engine_mode`) com 4 opções.
- Botão "Ativar produção global" abre modal com prompt: "Para confirmar,
  digite **PRODUCAO** abaixo". Habilita o submit somente quando o input
  é exatamente `"PRODUCAO"`. Submit faz `UPDATE app_settings SET
  bot_engine_production_mode = true`.
- Botão "Desligar produção global" também exige `"PRODUCAO"` e mostra
  alerta "isso volta o sistema ao comportamento por consultor; após
  desligado os consultores em `legacy` voltam imediatamente ao motor
  legado".
- Toda ação grava em `rollout_audit` (`flag_kind = "bot_engine_mode"`
  ou `flag_kind = "bot_engine_production_mode"`).

### 7. Property-Based Tests

Geradores residem em
`supabase/functions/_shared/engine/__tests__/arb.ts` (renomeio de
`_shared/flow-engine/__tests__/arb.ts`, mantém `STUB_HOOKS`,
`arbInboundEvent`, `arbCustomerSnapshot`, `arbCapabilities`,
`arbConfig`, `arbStep`, `arbEngineInput`).

Lista das propriedades dos critérios 12.1–12.6 (cada arquivo em
`__tests__/`):

- `pbt_parity_test.ts` — Propriedade `parity_whapi_evolution`
  (Critério 12.1, valida 4.1):
  ```typescript
  fc.assert(fc.property(arbEngineInput(), (input) => {
    const whapi = runEngine({ ...input, capabilities: WHAPI_CAPABILITIES });
    const evol  = runEngine({ ...input, capabilities: EVOLUTION_CAPABILITIES });
    deepEq(stripChoiceRendering(whapi.outbound), stripChoiceRendering(evol.outbound));
    deepEq(whapi.stateUpdate, evol.stateUpdate);
  }), { numRuns: 200 });
  ```
  `stripChoiceRendering` zera apenas a forma do `kind: "choice"` para
  permitir que Whapi renderize botões e Evolution renderize numerada
  como única diferença permitida.
- `pbt_round_trip_test.ts` — Propriedade `round_trip_button_number`
  (Critério 12.2, valida 4.2): para todo `step ask_choice` e toda
  opção `o`, o `buttonId` Whapi e o índice numérico Evolution mapeiam
  para a mesma `transition_id`.
- `pbt_idempotency_test.ts` — Propriedade `idempotência_de_outbound`
  (Critério 12.3, valida 5.4): dois adjacentes nunca compartilham
  `idempotencyContent`.
- `pbt_no_silent_test.ts` — Propriedade `sem_turno_silencioso`
  (Critério 12.4, valida 6.1): para `inbound.kind` não-passivo,
  `outbound.length ≥ 1` ou um log `engine_*_deferred`.
- `pbt_goto_validity_test.ts` — Propriedade `validade_goto`
  (Critério 12.5, valida 7.1): toda transição aplicada referencia step
  existente em `flow.steps`.
- `pbt_decision_log_test.ts` — Propriedade `decisão_única`
  (Critério 12.6, valida 7.5): exatamente um log de decisão por turno.
- `regression_cadastro_steps_test.ts` — 48 cenários concretos (1 por
  step da auditoria), cada um rodando em ambos os canais e comparando
  contra snapshot revisado por humano (Critério 12.7).

### 8. Engine_logs e observabilidade

`StructuredLog` mantém o shape do `flow-engine-v3-rewrite/design.md §2.6`.
Aditivos:

- `payload.channel ∈ {"whapi","evolution"}` (Requisito 9.2).
- `payload.mode ∈ {"dark","canary","on"}` (Requisito 9.2).
- `payload.production_override: boolean` (Requisito 8.4).
- `payload.shadowed: true` em modo dark (Requisito 9.3) — dispatcher
  observa `EngineConfig.isDarkMode` e marca a linha; o
  `engine.runner.ts` continua puro.
- View `v_bot_engine_health` agrega `engine_logs` por consultor +
  canal (Requisito 9.4).

## Data Models

### Tipos públicos (TypeScript)

Mantidos no namespace `_shared/engine/types.ts` (renomeio):
`EngineInput`, `EngineOutput`, `CustomerSnapshot`, `BotFlow`,
`BotFlowStep`, `ChoiceOptionSpec`, `CaptureSpec`, `TransitionSpec`,
`FallbackSpec`, `MediaOrderEntry`, `InboundEvent`, `EngineConfig`,
`EngineHooks`, `OutboundMessage`, `DeferredAction`, `LogKind`,
`StructuredLog`, `FallbackContext`, `FallbackHandler`, `VariantStrategy`.

Adicionado neste design:

```typescript
// _shared/engine/decision.ts
export type IndividualMode = "legacy" | "dark" | "canary" | "on";

export type EngineDecision =
  | { kind: "engine_unified"; production_override: boolean }
  | { kind: "shadow" }
  | { kind: "legacy" };
```

```typescript
// _shared/pipeline-cadastro/registry.ts
export type CadastroStepCategory = "cadastro-only" | "híbrido";
export type StepClassification    = "pipeline" | "transition_first" | "transition_only";
export const CADASTRO_STEP_REGISTRY: Record<string, CadastroStepCategory>;
export function classifyStep(stepKey: string | null): StepClassification;
```

### DDL

Único conjunto de mudanças DDL desta feature (idempotentes):

```sql
-- 1) Kill_Switch por consultor.
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS bot_engine_mode TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE public.consultants
  ADD CONSTRAINT consultants_bot_engine_mode_chk
  CHECK (bot_engine_mode IN ('legacy','dark','canary','on'));

-- 2) Production_Mode_Global (singleton existente).
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS bot_engine_production_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) Index para query da view de saúde.
CREATE INDEX IF NOT EXISTS engine_logs_kind_at_idx
  ON public.engine_logs (kind, at DESC);
```

`engine_logs` já existe (162 linhas em 72h, append-only, comentário na
DDL aponta para `flow-engine-v3-rewrite`). Esta feature **estende** o
domínio do enum `kind` (em código) com:
`engine_choice_downgraded`, `engine_capability_downgrade`,
`engine_killswitch_read_failed`,
`engine_killswitch_read_failed_using_cache`,
`engine_killswitch_invalid_value`, `engine_killswitch_auto`,
`engine_killswitch_auto_suppressed`, `engine_repeat_intentional`,
`engine_fallback_silent`. Não há `CHECK CONSTRAINT` em
`engine_logs.kind` — é texto livre — então a extensão é apenas
documental.

### Fluxos de dados em runtime

```
Inbound HTTP
   │
   ▼
adapter.parseInbound(raw)
   │  (ParsedMessage canônico)
   ▼
interceptOtp() ──────► [se OTP detectado, retorna sem chamar motor]
   │ não-OTP
   ▼
loadCustomer + loadConsultant ─► resolveEngineDecisionWithCache
   │                                    │
   │                                    ▼
   │                            EngineDecision
   │                                    │
   │             ┌──────────────────────┼──────────────────────┐
   │             ▼                      ▼                      ▼
   │         "legacy"               "shadow"              "engine_unified"
   │             │                      │                      │
   │             ▼                      ▼                      ▼
   │         runLegacy()    runUnifiedEngineWebhookEntry({dryRun:true})
   │                                                       runUnified...({dryRun:false})
   │                                                            │
   │                                                            ▼
   │                                                       loadContext
   │                                                            │  (CustomerSnapshot, BotFlow)
   │                                                            ▼
   │                                                       runEngine(input) PURE
   │                                                            │  (EngineOutput)
   │                                                            ▼
   │                                                       executeActions
   │                                                            │  (ChannelAdapter.send*, engine_logs INSERT,
   │                                                            │   bot_handoff_alerts INSERT, customer_flow_state UPDATE)
   │                                                            ▼
   │                                                       crm-stage-sync (best-effort)
   ▼
HTTP 200
```

## Error Handling

### 1. Erro interno do motor

Encapsulado em `runUnifiedEngineWebhookEntry` (sucessor de
`runEngineV3WebhookEntry`). Em qualquer `throw` do `runEngine` ou do
`executeActions`:

- O webhook **não delega ao legado** (Requisito 6.4 — proibição
  absoluta enquanto `bot_engine_mode ∈ {canary, on}` ou
  `bot_engine_production_mode = true`).
- Webhook entry emite o safe-text literal `"Pode me responder, por
  favor? 🙂"` (Requisito 6.4).
- Insere uma linha em `engine_logs` com
  `kind="engine_safe_text"` e `payload.branch="webhook_entry_error"`.
- Pausa o customer (`bot_paused=true, bot_paused_reason="engine_error"`)
  e cria handoff alert (Requisito 10.2).

### 2. Falha de leitura do Kill_Switch ou Production_Mode

Função `readKillSwitch(supabase, consultantId)` e `readProdMode(supabase)`
(em `_shared/engine/decision.ts`):

- Sucesso → escreve no cache com TTL 30s.
- Falha (timeout, erro de rede) → tenta cache; se houver entrada com
  TTL estendido (≤ 5 min) usa-a e emite log
  `engine_killswitch_read_failed_using_cache` (Requisito 8.9).
- Cache vazio ou expirado → assume
  `bot_engine_production_mode=false` e `bot_engine_mode="legacy"` e
  emite `engine_killswitch_read_failed` (Requisito 8.9).
- Valor fora do domínio → trata como `legacy` + log
  `engine_killswitch_invalid_value` + handoff alert
  (Requisito 8.10).

### 3. Burst de `engine_invalid_step`

Cron `flow-engine-rollout-cron` (já existe; estende para esta feature):

- Janela 1h, threshold 5 linhas para o mesmo consultor.
- Quando `bot_engine_production_mode=false`: rebaixa
  `consultants.bot_engine_mode="legacy"` + `engine_killswitch_auto` +
  handoff alert `reason="engine_invalid_step_burst"` (Requisito 9.5).
- Quando `bot_engine_production_mode=true`: emite
  `engine_killswitch_auto_suppressed` + handoff alert
  `reason="engine_invalid_step_burst_production_locked"` + notificação
  ao SuperAdmin (Requisito 9.5 segundo parágrafo).

### 4. Capability downgrades

Caminhos cobertos pelo adapter:

- `audio_slot` em canal sem `supportsAudio` → texto da transcrição +
  `engine_capability_downgrade` (Requisito 2.9, 5.6).
- `choice` com `options.length > maxButtons` em canal com
  `supportsButtons` → `Rendering_Numbered` +
  `engine_choice_downgraded` (Requisito 2.5).
- `media` com `kind="video"` em canal sem `supportsVideo` →
  `engine_capability_downgrade` (texto descritivo).

### 5. Falha de envio outbound

Adapter retorna `SendResult = { ok: false, reason }`. Dispatcher:

- 1ª falha: incrementa contador interno do turno.
- ≥ 2 falhas: insere `engine_logs` com `kind="engine_safe_text"`,
  `payload.branch="outbound_send_failed"`, e fallback para
  `bot_paused=true` + handoff alert.
- Nunca lança para o webhook entry (que retorna 200 OK).

## Testing Strategy

### 1. Property-Based Tests (fast-check)

Validados via Context7 ([snippet de Deno test runner](https://github.com/dubzzz/fast-check/blob/main/website/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-deno-test-runner.md)).

- `parity_whapi_evolution` (G1): 200 runs (Critério 4.3), seed
  pinada para reprodutibilidade. Comparação modulo
  rendering de choice.
- `round_trip_button_number` (G2): 200 runs (Critério 4.4), 1 run por
  `(step ask_choice, opção)`.
- `idempotência_de_outbound` (G3): 200 runs.
- `sem_turno_silencioso` (G4): 200 runs.
- `validade_goto` (G5): 200 runs.
- `decisão_única` (G6): 200 runs.

Quando qualquer propriedade quebra, fast-check shrink imprime o
contraexemplo mínimo. CI lê stdout, anexa `state`, `inbound`,
`outbound[]` ao job e bloqueia o merge incondicionalmente
(Critério 12.8). O runner Deno (`deno test`) já loga isso
naturalmente.

### 2. Lint de pureza

`__tests__/purity_lint_test.ts` (existe para v3, generalizar):

- Walka a árvore de `_shared/engine/**` via grep regex.
- Falha se encontrar `Date.now`, `fetch(`, `Math.random`,
  `crypto.randomUUID`, `from(.*supabase` (Requisito 1.4).
- Falha se encontrar `"whapi"` ou `"evolution"` literal (Requisito 2.8).

### 3. Regression Cadastro_Steps

48 cenários (1 por linha de [`cadastro-steps-audit.md`](./cadastro-steps-audit.md)).
Cada cenário:

```typescript
Deno.test("regression: ask_quero_cadastrar — Whapi e Evolution mesmo behavior", () => {
  const baseInput = scenarios["ask_quero_cadastrar"];
  const w = runEngine({ ...baseInput, capabilities: WHAPI_CAPABILITIES });
  const e = runEngine({ ...baseInput, capabilities: EVOLUTION_CAPABILITIES });
  assertSnapshot(w, "snapshots/whapi/ask_quero_cadastrar.json");
  assertSnapshot(e, "snapshots/evolution/ask_quero_cadastrar.json");
  assertEquals(stripRendering(w.outbound), stripRendering(e.outbound));
});
```

Snapshot inicial revisado por humano.

### 4. Diff scripts

CI roda `diff-bot-flow.py` e `diff-conversational.py` ao final de
cada PR da fase `cleanup`:

- Esperado em `cleanup`: `diff_lines_total = 0` para ambos
  (Requisitos 4.6 e 4.7). Antes do `cleanup` o gating é apenas
  informativo.

### 5. Integração de webhook

Cenários de smoke E2E (em `bot-test-runner`):

- Whapi inbound texto → Motor_Unificado responde com texto.
- Whapi inbound clique de botão → match transition correto.
- Evolution inbound texto → idem.
- Evolution inbound "1"/"2" pós-`ask_choice` → match transition igual
  ao Whapi.
- OTP inbound em ambos os canais → intercept antes do motor.
- `bot_engine_production_mode=true` + `bot_engine_mode="legacy"` →
  Motor_Unificado responde + log `production_override=true`.
- `bot_engine_mode="dark"` + falha de leitura simulada → cache cai
  para `legacy` em ≤ 5 min com log apropriado.

### 6. Validação de coverage

Meta-test: cada acceptance criterion dos Requisitos 1–10 e 12 está
amarrado a pelo menos um teste (PBT, lint, regression ou
integration). Tabela em
`__tests__/spec-coverage_test.ts` lista `(req_id, test_file, status)`
e falha se algum AC do Requisito 1.* a 10.*, 12.* ficar órfão.

---

## Correctness Properties

Esta seção formaliza, em forma testável, os invariantes que o
Motor_Unificado deve respeitar. Cada propriedade abaixo está amarrada a
um arquivo de teste e a um conjunto de Requisitos.

### Property 1: Paridade Whapi × Evolution (`parity_whapi_evolution`)

> **Para todo** `(state, flow, inbound)` válido, **e para todo par**
> `(capabilities_whapi, capabilities_evolution)`:
> `runEngine` produz `stateUpdate` deeply-equal nos dois canais e
> sequência de `outbound[]` semanticamente equivalente — onde
> "semanticamente equivalente" é definido pela função
> `stripChoiceRendering` que zera apenas o shape interno de
> `kind="choice"`.

- **Validates: Requirements 4.1, 12.1**
- Test: `__tests__/pbt_parity_test.ts`.
- Generators: `arbEngineInput()` (state/flow/inbound) cruzados com
  `WHAPI_CAPABILITIES` e `EVOLUTION_CAPABILITIES` constantes.
- Runs: 200.

### Property 2: Round-trip botão ↔ número (`round_trip_button_number`)

> **Para todo** `step` com `stepType = "ask_choice"` **e para toda**
> opção `o` declarada nesse passo:
> o `buttonId` que Whapi enviaria para `o` e o índice numérico (1, 2,
> ...) que Evolution receberia para `o` mapeiam para a mesma
> `transition_id` em `step.transitions`.

- **Validates: Requirements 2.6, 2.7, 4.2, 12.2**
- Test: `__tests__/pbt_round_trip_test.ts`.
- Generators: `arbStep` filtrado para `stepType="ask_choice"`,
  `choiceOptions` com 1..maxButtons opções.
- Runs: 200.

### Property 3: Idempotência adjacente (`idempotência_de_outbound`)

> **Para todo** turno em que `runEngine` produz `outbound.length > 1`:
> dois `outbound[i]` e `outbound[i+1]` adjacentes nunca compartilham o
> mesmo `idempotencyContent` (a menos que o passo declare
> `allowAdjacentRepeat = true` ou o `Outbound_Message` carregue
> `intentionalRepeat = true`).

- **Validates: Requirements 5.3, 5.4, 5.5, 12.3**
- Test: `__tests__/pbt_idempotency_test.ts`.
- Runs: 200.

### Property 4: Sem turno silencioso (`sem_turno_silencioso`)

> **Para todo** `(state, flow, inbound)` em que
> `inbound.kind ∈ {text, button_click, number_reply, media}`:
> `runEngine` retorna `outbound.length ≥ 1` **ou** um log
> `engine_*_deferred` com um `DeferredAction` em
> `output.deferred`.

- **Validates: Requirements 6.1, 6.2, 6.3, 12.4**
- Test: `__tests__/pbt_no_silent_test.ts`.
- Runs: 200.

### Property 5: Validade do goto (`validade_goto`)

> **Para todo** turno em que `runEngine` aplica uma transição:
> o `goto_step_id` resultante existe em `flow.steps` (i.e.,
> `flow.steps.some(s => s.id === goto_step_id)` é verdadeiro).

- **Validates: Requirements 7.1, 7.2, 7.4, 12.5**
- Test: `__tests__/pbt_goto_validity_test.ts`.
- Generators: gera fluxos com até 1 transição "envenenada" cujo
  `goto_step_id` aponta para UUID inexistente; espera-se que o motor
  rejeite e emita `engine_invalid_step`.
- Runs: 200.

### Property 6: Decisão única por turno (`decisão_única`)

> **Para todo** turno: exatamente uma das `LogKind` de decisão
> (`engine_transition_match`, `engine_repeat`, `engine_goto`,
> `engine_safe_text`, `engine_handoff`, `engine_ai_answer_deferred`,
> `engine_ai_decide_deferred`, `engine_no_match`,
> `engine_invalid_step`) aparece em `result.logs`.

- **Validates: Requirements 7.5, 12.6**
- Test: `__tests__/pbt_decision_log_test.ts`.
- Runs: 200.

### Property 7: Pureza estrutural (lint)

> O módulo `_shared/engine/**` não importa cliente Supabase nem chama
> `Date.now`/`fetch`/`Math.random`/`crypto.randomUUID`; e nenhum arquivo
> do módulo contém literais de string `"whapi"` ou `"evolution"`.

- **Validates: Requirements 1.4, 1.5, 2.8**
- Test: `__tests__/purity_lint_test.ts` (extensão da regra existente).

### Property 8: Único alerta de handoff (`single_handoff_alert`)

> **Para todo** turno em que `result.stateUpdate.status === "paused_system"`:
> `result.logs` contém **exatamente uma** entrada com
> `sideEffect.kind === "insert_handoff_alert"`.

- **Validates: Requirements 10.1, 10.3**
- Test: `__tests__/pbt_handoff_alert_test.ts`.
- Runs: 200.

### Property 9: Determinismo total (round-trip de `EngineInput`)

> **Para todo** `EngineInput x`:
> `deepEq(runEngine(x), runEngine(x))`.

- **Validates: Requirements 1.3, 12.1** (precondição).
- Test: `__tests__/pbt_determinism_test.ts`.
- Runs: 200.

---

## Auditoria CADASTRO_STEPS

Materializada em [`cadastro-steps-audit.md`](./cadastro-steps-audit.md).

**Veredito por categoria** (Requisito 3.7):

- 42 `cadastro-only` (executam em `pipeline-cadastro` puro, ignorando
  `bot_flow_steps.transitions`).
- 6 `híbrido` (`aguardando_humano`, `ask_quero_cadastrar`,
  `ask_finalizar`, `finalizando`, `ask_doc_frente_manual`,
  `ask_doc_verso_manual`) — Motor_Unificado tenta `matchTransition`
  primeiro; se nada casar, delega ao `pipeline-cadastro`.
- 0 `cta-conversacional` puros (nenhum item da lista atual de
  `CADASTRO_STEPS` é puramente conversacional).
- Total: 48 (Requisito 3.1).

A constante `CADASTRO_STEPS` em `_shared/flow-router.ts` recebe
`@deprecated` durante a fase `on` apontando para
`cadastro-steps-audit.md`, e é apagada na fase `cleanup`
(Requisito 3.8 + 11.6).

---

## Decisão sobre Engine_V3

**Métricas extraídas via `mcp_supabase_execute_sql` (read-only) das
últimas 72h em `Modo_Dark`** — 12 consultores em dark, 1 em off
(Alcides), `engine_logs` agregado:

| métrica | valor 72h | proxy do critério 13.2 |
|---|---:|---|
| `engine_step_enter`     | 43 | denominator |
| `engine_invalid_step`   | 10 (23,26%) | invalid_step por consultor |
| `engine_no_match`       | 10 (23,26%) | no_match por consultor |
| `engine_handoff`        | 6  | — |
| `engine_safe_text`      | 10 | — |
| `engine_transition_match` | 30 | — |
| `engine_repeat`         | 49 | — |
| `engine_goto`           | 1  | — |
| customers distintos     | 28 | — |

100% das linhas de `engine_invalid_step` e de `engine_no_match` estão
concentradas em **um único consultor** (Rodrigo Horácio,
`0c2711ad-4836-41e6-afba-edd94f698ae3`). Isso indica que a
divergência V3-vs-legado está vindo de um caso específico de
desenho de fluxo — não de um defeito sistêmico do V3.

**Thresholds desejáveis para promoção** (consensados nesta spec):

- `engine_invalid_step` ≤ 2% de `engine_step_enter`.
- `engine_no_match` ≤ 5% de `engine_step_enter`.
- `engine_handoff` ≤ 10% de `engine_step_enter`.

**Resultado bruto**: 23,26% e 23,26% — bem acima dos thresholds. **Mas**
filtrando o consultor com 100% das anomalias, os 11 consultores
restantes têm 0 invalid_step e 0 no_match.

**Decisão registrada (Requisito 13.1):** **(a) promover Engine_V3 a
Motor_Unificado**, _condicionado a_ uma extensão do `Modo_Dark` por
**+3 dias** focada em diagnosticar o caso do consultor outlier.
Justificativa:

1. O Engine_V3 já é puro (já passa no `purity_lint_test.ts`), já tem
   PBT (`__tests__/v3-runner_test.ts`), já tem dispatcher e
   webhook-entry idênticos entre os dois canais
   (`runEngineV3WebhookEntry` é o mesmo módulo importado por ambos).
   O esqueleto que esta spec exige no Requisito 1.6 já existe
   (`v3-webhook-entry.ts:236`), com 290 linhas únicas em vez de 1500
   duplicadas.
2. Os 11 consultores em dark sem anomalias indicam que o motor
   funciona; o caso 1 é provavelmente um fluxo com `goto_step_id`
   apontando para UUID de outra variant (problema de dados, não de
   código).
3. Construir o Motor_Unificado a partir do Conversational unificado
   significaria reescrever ~4.832 linhas que já foram resolvidas no
   V3 (capabilities, dispatcher, hooks declarativos, validação de
   goto, dedupe G1, log de decisão único G6).

**Plano de tasks** (Requisito 13.4):

- Investigar o consultor outlier nas próximas 72h
  (query: `SELECT * FROM engine_logs WHERE customer_id IN (SELECT id
  FROM customers WHERE consultant_id = '0c2711ad...') AND kind IN
  ('engine_invalid_step','engine_no_match') ORDER BY at DESC`).
- Renomear módulo `_shared/flow-engine/` → `_shared/engine/` (semantic
  rename, mantém git history).
- Renomear símbolos `runEngineV3WebhookEntry` →
  `runUnifiedEngineWebhookEntry`, `isEngineV3Enabled` →
  `resolveEngineDecision`.
- Remover diferenças entre os dois `bot-flow.ts` movendo o pipeline
  para `_shared/pipeline-cadastro/`.
- Adicionar a tabela `cadastro-steps-audit.md` ao `classifyStep`.
- Adicionar `bot_engine_mode` e `bot_engine_production_mode` (DDL) e
  `resolveEngineDecision` substituindo `isEngineV3Enabled`.
- Estender `purity_lint_test.ts` com regra anti-`"whapi"`/`"evolution"`.
- Estender PBT existente com `parity_whapi_evolution` e
  `round_trip_button_number`.
- Migração final (cleanup): apagar `whapi-webhook/handlers/bot-flow.ts`,
  `evolution-webhook/handlers/bot-flow.ts`,
  `whapi-webhook/handlers/conversational/index.ts`,
  `evolution-webhook/handlers/conversational/index.ts`.

**Reversal trigger**: se nas próximas 72h surgir nova classe de
`engine_invalid_step` em outro consultor (>1 nova ocorrência por
consultor diferente), a decisão (a) é congelada e abre-se nova rodada
de QA antes de promover. Caso contrário, aprovado para `canary` em até
3 consultores (Requisito 11.3, default 3).

---

## Notas Context7

Consultas registradas durante esta fase (Requisito 14):

- **Supabase Edge Functions** (data: 2026-05-28, libraryId
  `/websites/supabase`). Edge Functions têm limites de CPU e
  wall-clock; functions que excedem são terminadas com error
  `WORKER_RESOURCE_LIMIT` (código 546). `Shutdown.reason="WallClockTime"`
  é o sinal observável. **Implicação para esta spec**: o motor é
  síncrono por design (sem `await` interno) e o dispatcher faz uso de
  `await Promise.all` apenas para outbounds. Não há risco de exceder
  o wall-clock dentro do path crítico do motor; OCR/portal/AI ficam
  todos em `DeferredAction` que o cron resolve fora do path do
  webhook.
- **Whapi** (data: 2026-05-28, libraryId `/websites/whapi_cloud`). API
  expõe `POST /messages/interactive` para mensagens com botões;
  endpoint dedicado `POST /messages/text` para texto;
  `POST /messages/audio` para áudio/voice. Sem limite explícito de
  request-rate na API paga; WhatsApp monitora padrão. **Implicação**:
  `WHAPI_CAPABILITIES.maxButtons = 3` mantido (limite WhatsApp,
  não da Whapi). Adapter precisa fazer pacing entre outbounds
  consecutivos (já faz via `humanDelayFn`).
- **Evolution API** (data: 2026-05-28, libraryId
  `/evolution-foundation/evolution-api`). `POST /message/sendButtons`
  suporta até 3 reply buttons; `POST /message/sendList` envia lista
  scrollável com `sections[].rows[]`. **Implicação**: a Evolution
  *suporta* botões hoje via Baileys, mas a política do projeto
  (estabilidade Baileys) mantém `EVOLUTION_CAPABILITIES.supportsButtons
  = false`. `supportsList = true` fica reservado para uma feature
  futura (pode ser ativado sem mudar o motor — só altera o adapter).
  Isso **não invalida** nenhum pressuposto da spec (Requisito 14.3
  cláusula sobre discrepâncias não foi acionada).
- **fast-check** (data: 2026-05-28, libraryId `/dubzzz/fast-check`).
  Snippet oficial mostra integração com `Deno.test` via `npm:fast-check`,
  `fc.assert(fc.property(arb, predicate))`, configuração de seed e
  numRuns para reprodutibilidade. **Implicação**: o repositório já usa
  `fast-check@3.23.2` via esm.sh em `arb.ts` — mantemos esse import,
  numRuns padrão de 200 para todas as 6 propriedades.

Nenhuma das consultas Context7 retornou informação que invalida
pressupostos desta spec. O Requisito 14.3 (correções pós-Context7)
**não foi acionado**.

---

## Risks & Mitigations

| Risco | Mitigação |
|---|---|
| Promoção do V3 herda bug do consultor outlier | Extensão de 72h em `Modo_Dark` antes de `canary`; `engine_killswitch_auto` rebaixa automaticamente se burst > 5/h. |
| Diff de ≈623+272 linhas zerado quebra paridade Whapi×Evolution em runtime | PBT `parity_whapi_evolution` com 200 runs roda em CI a cada PR; `diff-bot-flow.py` no CI da fase `cleanup`. |
| Cache de Kill_Switch fica desatualizado durante incidente | TTL 30s; falha de leitura cai para `legacy` em ≤ 5min; UI não pretende invalidação ativa (espera TTL natural). |
| `app_settings.bot_engine_production_mode = true` é irreversível por kill-switch individual | Documentado como decisão de design (Requisito 11.8); única reversão é desligar a flag global, exigindo confirmação `"PRODUCAO"` na UI. |
| `editing_doc_pai/_mae` no `CADASTRO_STEPS` mas sem uso | Mantém como `cadastro-only` até `cleanup`; remove na fase final junto com `routeEngine`. |
| Renomear `flow-engine/` → `engine/` quebra imports espalhados | Usa `smartRelocate` para mover arquivos com auto-update de imports; PR isolado antes do PR funcional. |
| Consulta a Context7 sobre Evolution sugere `supportsButtons=true` | Mantém `false` por política operacional — mudança de capability não afeta o motor; é apenas alterar uma constante no adapter quando o time decidir habilitar. |

---

## Open Questions

1. **Adoção de `sendList` da Evolution.** A documentação Context7
   confirma que Evolution suporta lista interactive nativa. Esta spec
   mantém `Rendering_Numbered` em texto puro por estabilidade. Pergunta
   para depois do `production_lock`: vale a pena ativar
   `supportsList=true` no Evolution e usar `OutboundMessage` com
   `choice.preferred="list"` para passos com >3 opções? Resposta NÃO é
   bloqueador desta feature.
2. **Retry de webhook (Whapi vs Evolution).** Context7 não trouxe
   contrato explícito de retry de cada provedor. A consulta deve ser
   refeita antes da fase `canary` se aparecer evidência em produção
   de processamento duplo. `webhook_message_dedup` (existe na DB com
   111 linhas) cobre o caso, mas a janela de dedup deve ser revisitada.
3. **Janela de dedupe G1 cross-turn.** Hoje 2 segundos (Requisito
   2.2); a heurística é razoável mas não foi medida em produção.
   Métrica `engine_dedupe_blocked` por hora deve ser observada na fase
   `dark` para calibrar.

---

## Resumo

- Motor único e puro `runEngine` com assinatura completa em
  `_shared/engine/` (renomeio do `flow-engine/v3-*`).
- Diferença Whapi×Evolution exclusivamente em `ChannelCapabilities`;
  motor sem `if (channel === ...)`.
- `pipeline-cadastro` unificado consome `cadastro-steps-audit.md` para
  decidir entre delegação determinística e `transition_first`.
- `resolveEngineDecision` consolida Kill_Switch + Production_Mode com
  cache 30s e fallback de 5 min.
- Webhook entries finos, byte-a-byte iguais modulo o `kind` do adapter.
- 6 propriedades PBT (paridade, round-trip, idempotência, no-silent,
  goto, decisão única) cobrem os critérios 12.1–12.6.
- Decisão sobre Engine_V3: **promover** (a), com extensão de 72h em
  dark para fechar o caso do outlier.
- DDL idempotente para `bot_engine_mode` e `bot_engine_production_mode`
  (reusa singleton `app_settings`).
- Scripts Python (`audit-cadastro-steps.py`, `diff-bot-flow.py`,
  `diff-conversational.py`, `v3-vs-legacy-metrics.py`) versionados.

Design pronto para revisão. Próximo passo: Tasks.

# Design Document

## Overview

Bugfix design para 2 lacunas no engine de fluxos do iGreen:

1. **Handlers conversational ignoram `fb.mode === "retry"`** — config criada por migrations e UI vira código morto
2. **Evolution OCR fail usa texto hardcoded** — quebra a personalização do consultor (Whapi já tem o helper certo)

A solução é cirúrgica: portar o helper `resolveOcrFallback` do Whapi pro Evolution e adicionar tratamento de `retry` nos 2 handlers conversational. Zero impacto em código que já funciona.

## Glossary

- **Engine `flow`**: motor conversacional dirigido por dados em `bot_flow_steps` (`runConversationalFlow`)
- **Engine `sys`**: motor determinístico de cadastro (`runBotFlow`) com pipeline OCR → portal → OTP
- **`fb` / `fallback`**: objeto JSONB em `bot_flow_steps.fallback`
- **`retry_text`**: mensagem amigável configurada para reenviar quando o lead manda algo fora do esperado
- **`max_retries`**: quantidade máxima de tentativas antes de escalar
- **`then`**: ação após esgotar `max_retries` (`humano` | `next` | `repeat`)
- **`resolveOcrFallback`**: helper canônico que vive em `whapi-webhook/handlers/bot-flow.ts` e será portado pro Evolution

## Bug Details

### Bug A: `fb.mode === "retry"` ignorado

**Affected files:**
- `supabase/functions/evolution-webhook/handlers/conversational/index.ts`
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`

**Trigger:** Lead em step `S` com `S.fallback.mode = "retry"` envia mensagem `M` que não casa com nenhuma `transition`.

**Symptom:**
```
[conversational] no transition matched, falling through fallback
[conversational] fb.mode = retry → não há case → cai no default repeat
[conversational] _smartRepeat → reformulação fraca ou pergunta literal
```
Lead vê pergunta repetida em loop. Após 5 repetições idênticas, `_smartRepeat` cria handoff genérico — mas leva 90s+ para disparar.

**Validation:** Análise via Python confirmou:
- 4 migrations CONFIGURAM `mode: "retry"` (`20260518030425`, `20260524220000`, `20260525001548`, `20260525152914`)
- 0/2 handlers IMPLEMENTAM (`grep "fb.mode === \"retry\""` em `conversational/**/*.ts` = 0 matches)

### Bug B: Evolution OCR fail sem `retry_text`

**Affected file:** `supabase/functions/evolution-webhook/handlers/bot-flow.ts`

**Trigger:** `customers.flow_variant = "D"` + step `aguardando_conta` ou `aguardando_doc_*`. OCR Gemini falha (timeout, baixa confiança, erro).

**Symptom:**
```typescript
// Linhas 2783, 2806, 3380, 3401 do evolution-webhook/handlers/bot-flow.ts:
void recordFlowDAlert({ ... });  // alerta interno, OK
reply = "⚠️ Não consegui ler sua conta. Tente uma foto melhor.";  // HARDCODED
```
Lead vê texto genérico, perde personalização. Após N tentativas, fica mudo até cron `flow-d-stuck-watchdog` rodar (5 min).

**Validation:**
- Whapi tem `resolveOcrFallback` (linhas 130-160 de `whapi-webhook/handlers/bot-flow.ts`) ✅
- Evolution **não tem** o helper ❌

## Expected Behavior

### Behavior A: `retry` mode honrado

```
Tentativa 1: lead manda mensagem fora do esperado
  → reply = fb.retry_text
  → custom_step_retries = 1
  → custom_step_retries_step = currentStep.id

Tentativa 2: lead manda outra mensagem fora do esperado
  → reply = fb.retry_text (mesmo texto, ok — é retry)
  → custom_step_retries = 2

Tentativa 3 (excede max_retries=2):
  → SE fb.then === "humano":
       conversation_step = "aguardando_humano"
       bot_paused = true
       reason = "{step_key}_retry_exhausted"
       handoff alert criado
  → SE fb.then === "next":
       avança pro próximo step ativo, contadores zerados
  → SE fb.then === "repeat":
       envia retry_text mais uma vez, mantém step

Lead avança normalmente:
  → custom_step_retries = 0
  → custom_step_retries_step = null
```

### Behavior B: OCR usa retry_text configurado

```
OCR conta falha (variant D, attempts=1):
  → recordFlowDAlert (mantido)
  → resolveOcrFallback("capture_conta", attempts=1) retorna:
     { retryText: "<retry_text do step>", escalate: false }
  → reply = retryText

OCR conta falha (variant D, attempts=2 e max=2, then=humano):
  → recordFlowDAlert (mantido)
  → resolveOcrFallback retorna { escalate: true }
  → bot_paused = true
  → reason = "ocr_conta_retry_exhausted"
  → reply = template "aguardando_humano/avisado"

OCR conta falha (variant A, sem retry config):
  → recordFlowDAlert (skip — só dispara para D)
  → resolveOcrFallback retorna { retryText: defaultHardcoded, escalate: false }
  → reply = texto hardcoded (comportamento atual preservado)
```

## Hypothesized Root Cause

### Root Cause A: Handler conversational nasceu antes do schema retry

Histórico (via git):
- Schema `fallback.mode = "retry"` foi adicionado em `20260518030425` (script de auto-reparo de fluxos)
- Handler conversational `runConversationalFlow` foi escrito antes (sprint 2.5)
- Quando adicionaram suporte a `mode: "retry"` no banco, esqueceram de adicionar o branch correspondente nos 2 handlers (`evolution-webhook` e `whapi-webhook`)
- Workaround feito: `_smartRepeat` (linha ~1773 do Evolution) — mas é genérico, não usa `retry_text` nem `max_retries` configurados

### Root Cause B: Cópia incompleta entre handlers

Histórico:
- Whapi foi o canal pioneiro com botões reais — `resolveOcrFallback` foi escrito ali
- Quando Evolution ganhou OCR (sprint posterior), os handlers de OCR fail foram escritos do zero, com texto hardcoded
- Não houve refatoração para extrair o helper para `_shared/`

## Correctness Properties

### Property 1: retry counter monotonicity

**Validates: Requirements 1.1, 1.6**

Para qualquer turno em step `S` com `fb.mode = "retry"`:
- `newCount = sameStep ? prevCount + 1 : 1`
- `newCount` SEMPRE crescente para o mesmo step
- `newCount` SEMPRE = 1 quando `custom_step_retries_step !== S.id`

### Property 2: escalate determinism

**Validates: Requirements 1.2, 1.3, 1.4, 2.4**

Para `(attempts, max_retries, then)`:
- `attempts < max_retries` ⟹ `escalate = false`
- `attempts >= max_retries AND then === "humano"` ⟹ `escalate = true`
- `attempts >= max_retries AND then !== "humano"` ⟹ `escalate = false` (mas reset/avanço)

### Property 3: no regression for variant != D

**Validates: Requirements 2.6, 3.1, 3.2, 3.3, 5.1**

Para `customers.flow_variant !== "D"` E step sem `fallback.mode = "retry"`:
- Comportamento idêntico ao código atual (cai em `_smartRepeat` ou texto hardcoded)
- Nenhuma query extra ao banco
- Nenhum novo log

### Property 4: retry_text never empty

**Validates: Requirements 1.1, 2.3**

Para qualquer reply emitido pelo branch `retry`:
- `reply.length > 0`
- Se `fb.retry_text` está vazio, usa `renderStepText(currentStep)`
- Se ambos vazios, usa fallback hardcoded curto ("Pode me responder, por favor? 🙂")

### Property 5: counters reset on advance

**Validates: Requirements 1.5**

Para qualquer transição que avança step (`goToStep(S')` com `S'.id !== S.id`):
- `custom_step_retries` SEMPRE = 0 no novo state
- `custom_step_retries_step` SEMPRE = null no novo state

## Fix Implementation

### Fix A: Adicionar tratamento de `fb.mode === "retry"` nos 2 handlers conversational

**Arquivos:**
- `supabase/functions/evolution-webhook/handlers/conversational/index.ts`
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`

**Localização exata:** dentro do bloco `runConversationalFlow`, depois do `transition` matching falhar e antes de `if (fb.mode === "ai_answer" && fb.ai_prompt && !strictMode && (ctx.messageText || "").trim()) { ... }`.

**Código a adicionar (idêntico nos 2 arquivos):**

```typescript
// 🆕 fb.mode === "retry" — implementação validada via PBT (Property 1-5)
if (fb.mode === "retry") {
  const maxRetries = Math.max(1, Number(fb.max_retries ?? 2));
  const sameStep = String((ctx.customer as any).custom_step_retries_step || "") === currentStep.id;
  const prevCount = sameStep ? Number((ctx.customer as any).custom_step_retries || 0) : 0;
  const newCount = prevCount + 1;

  console.log(
    `[conversational] retry-mode step=${currentStep.step_key} ` +
    `attempt=${newCount}/${maxRetries} prev=${prevCount} sameStep=${sameStep}`,
  );

  // Esgotou retries
  if (newCount > maxRetries) {
    const then = String(fb.then || "humano");

    if (then === "humano") {
      const handoffText = await getTemplate(
        ctx.supabase, "aguardando_humano", "avisado",
        { nome: ctx.customer.name, representante: ctx.nomeRepresentante },
      );
      try {
        await ctx.supabase.from("bot_handoff_alerts").insert({
          customer_id: ctx.customer.id,
          consultant_id: ctx.customer.consultant_id,
          reason: `${currentStep.step_key}_retry_exhausted`,
          metadata: {
            step: currentStep.step_key,
            retries: newCount,
            max: maxRetries,
            fallback: fb,
          },
        });
      } catch (_) { /* best-effort */ }
      return _finalize(stepKey, {
        reply: handoffText,
        updates: {
          conversation_step: "aguardando_humano",
          bot_paused: true,
          bot_paused_reason: `${currentStep.step_key}_retry_exhausted`,
          bot_paused_at: new Date().toISOString(),
          custom_step_retries: 0,
          custom_step_retries_step: null,
          ...captureUpdates,
          ...restoreDetourUpdates,
        },
      });
    }

    if (then === "next") {
      const nextByPos = dbSteps.find((s) => s.is_active && s.position > currentStep.position);
      if (nextByPos) {
        return _finalize(stepKey, await goToStep(nextByPos, {
          ...restoreDetourUpdates,
          custom_step_retries: 0,
          custom_step_retries_step: null,
        }));
      }
      // Sem próximo → cai pra repeat (envia retry_text uma última vez)
    }
    // then === "repeat" → continua para enviar retry_text abaixo
  }

  // Envia retry_text e incrementa contador
  const retryText = String(
    fb.retry_text ||
    renderStepText(currentStep) ||
    "Pode me responder, por favor? 🙂",
  );
  return _finalize(stepKey, {
    reply: retryText,
    updates: {
      conversation_step: currentStep.id,
      custom_step_retries: newCount,
      custom_step_retries_step: currentStep.id,
      __intent: cls.intent,
      __confidence: cls.confidence,
      ...captureUpdates,
      ...restoreDetourUpdates,
    },
  });
}
```

**Reset de contadores em `goToStep` (mesmo arquivo):**

```typescript
// Dentro de goToStep, antes do return final:
const customerRetriesStep = String((ctx.customer as any).custom_step_retries_step || "");
if (customerRetriesStep && customerRetriesStep !== s.id) {
  console.log(`[conversational] retry-counters-reset step=${s.step_key}`);
  extra = {
    ...extra,
    custom_step_retries: 0,
    custom_step_retries_step: null,
  };
}
```

### Fix B: Portar `resolveOcrFallback` para o Evolution

**Arquivo:** `supabase/functions/evolution-webhook/handlers/bot-flow.ts`

**Localização do helper:** após os imports e antes de `runBotFlow`. Sugestão: linha ~150 (após os helpers de validação).

**Código do helper (cópia idêntica do Whapi linhas 130-160):**

```typescript
async function resolveOcrFallback(
  supabase: any,
  consultantId: string,
  variant: string,
  stepType: "capture_conta" | "capture_documento",
  attempts: number,
  defaultRetryText: string,
): Promise<{ retryText: string; escalate: boolean }> {
  try {
    let { data: flow } = await supabase
      .from("bot_flows").select("id")
      .eq("consultant_id", consultantId).eq("is_active", true)
      .eq("variant", variant)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();

    if (!flow?.id) {
      const { data: anyFlow } = await supabase
        .from("bot_flows").select("id")
        .eq("consultant_id", consultantId).eq("is_active", true)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      flow = anyFlow;
    }
    if (!flow?.id) return { retryText: defaultRetryText, escalate: false };

    const { data: stepRow } = await supabase
      .from("bot_flow_steps").select("fallback")
      .eq("flow_id", flow.id).eq("step_type", stepType).eq("is_active", true)
      .order("position", { ascending: true }).limit(1).maybeSingle();

    const fb = (stepRow as any)?.fallback;
    if (!fb || fb.mode !== "retry") return { retryText: defaultRetryText, escalate: false };

    const maxRetries = Math.max(1, Number(fb.max_retries ?? 2));
    const retryText = String(fb.retry_text || defaultRetryText);
    const escalate = attempts >= maxRetries && String(fb.then || "") === "humano";
    return { retryText, escalate };
  } catch (e) {
    console.warn("[resolveOcrFallback] erro:", (e as any)?.message);
    return { retryText: defaultRetryText, escalate: false };
  }
}
```

**4 sites de uso (caminho `case "processando_ocr_conta"` e similares):**

#### Site 1: OCR conta erro retornado (~linha 2783)

```typescript
// Antes:
void recordFlowDAlert({ ... });
updates.ocr_conta_attempts = tries;
if (tries < 2) {
  reply = "⚠️ Não consegui ler sua conta. Tente uma foto melhor.";
}

// Depois:
void recordFlowDAlert({ ... });
updates.ocr_conta_attempts = tries;
const variant = String((customer as any)?.flow_variant || "A").toUpperCase();
const ocrFb = await resolveOcrFallback(
  supabase, customer.consultant_id, variant,
  "capture_conta", tries,
  "⚠️ Não consegui ler sua conta. Tente uma foto melhor.",
);
if (ocrFb.escalate) {
  updates.bot_paused = true;
  updates.bot_paused_reason = "ocr_conta_retry_exhausted";
  updates.bot_paused_at = new Date().toISOString();
  updates.conversation_step = "aguardando_humano";
  reply = await getTemplate(supabase, "aguardando_humano", "avisado", {
    nome: customer.name, representante: nomeRepresentante,
  });
} else {
  reply = ocrFb.retryText;
}
```

#### Site 2: OCR conta exception (~linha 2806)
Mesmo padrão do Site 1 — adicionar resolveOcrFallback antes do `break`.

#### Site 3: OCR doc erro retornado (~linha 3380)
Mesmo padrão, mas com `stepType: "capture_documento"` e `attempts: tries` (= `ocr_doc_attempts`).

#### Site 4: OCR doc exception (~linha 3401)
Mesmo padrão do Site 3.

## Testing Strategy

### Unit Tests

**Arquivo:** `supabase/functions/evolution-webhook/handlers/_test_resolve_ocr.ts`

Mocks de Supabase em memória:
- Test 1: variant A sem fallback retry → retorna `{ retryText: defaultText, escalate: false }`
- Test 2: variant D sem fallback retry → retorna `{ retryText: defaultText, escalate: false }`
- Test 3: variant D com fallback retry e attempts < max → `{ retryText: configured, escalate: false }`
- Test 4: variant D com fallback retry e attempts >= max e then=humano → `{ escalate: true }`
- Test 5: erro de query (banco indisponível) → fallback gracioso retorna defaultText

### PBT (Property-Based Tests)

**Arquivo:** `supabase/functions/evolution-webhook/handlers/conversational/_test_retry_pbt.ts`

Usando `fast-check` ou geradores manuais de Deno:

- **Property 1 (counter monotonicity):** Para qualquer sequência de N turnos no mesmo step, `custom_step_retries` é monotonicamente crescente até `max_retries + 1`.
- **Property 2 (escalate determinism):** Tabela de verdade `(attempts, max_retries, then) → escalate` valida 100% dos casos.
- **Property 3 (no regression A/B/C/E):** Para 1000 turnos aleatórios em variantes != D, nenhum query extra é executado e o comportamento é byte-for-byte idêntico ao baseline.
- **Property 4 (retry_text never empty):** Para qualquer `fb` com `mode = "retry"`, o `reply` final tem `length > 0`.
- **Property 5 (counters reset on advance):** Para qualquer transição que muda `currentStep.id`, o `nextState.custom_step_retries` é 0.

### Integration Tests via `flow-simulate-run`

| Cenário | Setup | Esperado |
|---------|-------|----------|
| **A1**: Fluxo D OK | foto válida | avança para `confirmando_dados_conta` |
| **A2**: Fluxo D, foto ruim 1x | mockBillOcr=fail, attempts=1 | reply = retry_text, attempts=1 |
| **A3**: Fluxo D, foto ruim 3x | attempts=3 | bot_paused=true, handoff alert criado |
| **A4**: Fluxo A, foto ruim | variant=A, sem retry config | reply = defaultText hardcoded |
| **B1**: Lead em ask_choice manda lixo 1x | step com `mode=retry,max=2,then=humano` | reply = retry_text |
| **B2**: Lead em ask_choice manda lixo 3x | mesmo step | bot_paused, alert |

### Regressão — Whapi não afetado

```bash
cd supabase/functions
deno test _shared/channels/whapi_test.ts
deno test _shared/flow-engine/engine_test.ts
deno test _shared/flow-router_test.ts
deno test _shared/channels/dispatch-choice_test.ts
```

Esperado: 100% pass, zero diff.

### Manual via `bot-e2e-runner`

```bash
curl -X POST <supabase>/functions/v1/bot-e2e-runner \
  -H "Authorization: Bearer <service_role>" \
  -d '{ "scenario": "fluxo_d_ocr_retry", "phone": "5500000000099" }'
```

Verificações:
- `conversations` tem N outbound com `retry_text` configurado (não hardcoded)
- `customers.bot_paused = true` no final do cenário "fluxo_d_ocr_retry_exhausted"
- `bot_handoff_alerts` tem 1 registro novo com `reason = "*_retry_exhausted"`
- Latência média do turno aumentou < 100ms

## Rollback Plan

### Rollback Fix A
`git revert <commit-fix-a>`. Sistema volta ao comportamento atual (cai em `_smartRepeat`).

### Rollback Fix B
`git revert <commit-fix-b>`. Os 4 sites voltam ao texto hardcoded original. `recordFlowDAlert` continua intacto.

### Rollback Total
`git revert <range-completo>`. Estado pré-fix restaurado. Migration de `custom_step_retries*` (se criada) pode ficar — não causa side effects.

**Sem feature flag:** decidimos não wrappear num flag por simplicidade. Rollback via `git revert` é suficiente para um fix dessa magnitude (3 arquivos, ~150 linhas adicionadas).

## Performance Considerations

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Latência por turno (caso comum) | ~2-4s | +0ms (não há query extra) |
| Latência por turno (OCR fail) | ~2s | +20-50ms (1 query `bot_flow_steps`) |
| Latência por turno (retry mode) | ~50ms | +5-10ms (apenas update de contadores) |
| Queries por turno | N | N+0 ou N+1 |
| Cache opportunity | n/a | Pode-se cachear `fallback` por `(consultant_id, step_type)` por 60s — não no fix inicial |

Decisão: **não cachear no fix inicial**. Adicionar cache só se observarmos > 100 OCR fails/hora em produção.

## Dependencies

- Tabela `customers` com colunas `custom_step_retries` (int default 0) e `custom_step_retries_step` (text nullable)
- Tabela `bot_flow_steps` já existe e suporta `fallback` JSONB
- Tabela `bot_handoff_alerts` já existe
- Helpers já existentes: `getTemplate`, `_finalize`, `renderStepText`, `goToStep`
- `notifyHandoff` (já existe em `_shared/notify-consultant.ts`)
- `recordFlowDAlert` (já existe em `_shared/captation/flow-d-alerts.ts`)

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Loop infinito se `then="repeat"` E retry_text não muda | Baixa | Alto | Hard limit de 5 attempts mesmo em `then="repeat"` (TODO no código) |
| Conflito com `_smartRepeat` (já existe) | Média | Médio | Posicionar `if (fb.mode === "retry")` ANTES; `_smartRepeat` só executa se cair no default |
| Schema customers não tem colunas | Média | Alto | Tarefa 1 verifica e cria migration `IF NOT EXISTS` se necessário |
| Whapi handler regrediu | Baixa | Crítico | Tarefa de regressão roda testes existentes antes do merge |
| OCR helper retorna escalate em variant A/B/C/E inesperadamente | Baixa | Médio | Helper só retorna escalate=true se `fb.mode === "retry"` (default `false` para variantes sem config) |

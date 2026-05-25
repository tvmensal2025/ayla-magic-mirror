// Property-based tests for `fb.mode === "retry"` — bugfix
// `flow-d-retry-rules-fix`, task 10.
//
// These tests validate the 5 correctness properties from design.md
// "Correctness Properties" against a faithful pure copy of the retry
// decision logic that lives inline inside `runConversationalFlow`
// (evolution-webhook/handlers/conversational/index.ts ~linha 2025).
//
// Why pure copy: the production handler is heavily coupled to Supabase,
// EvolutionSender, captureUpdates, etc. The PBT exists to validate the
// CORE LOGIC (counter monotonicity, escalate determinism, retry_text
// resolution, reset on advance), not the database wiring. The
// integration concerns are covered by `order_test.ts` and the
// `bot-e2e-runner` scenarios (task 11).
//
// **Heads-up:** PBT runs with `numRuns: 100` per property × 5
// properties — full file may take 30s+ on cold deno cache.
//
// Run:
//   deno test supabase/functions/evolution-webhook/handlers/conversational/_test_retry_pbt.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "https://esm.sh/fast-check@3.23.2";

// ─── Pure logic under test ──────────────────────────────────────────────
// Mirrors `if (fb.mode === "retry") { ... }` block from
// evolution-webhook/handlers/conversational/index.ts (~linha 2025) AND
// the reset-counters logic inside `goToStep` (~linha 1748).
//
// Inputs/Outputs intentionally stripped of Supabase/sender side-effects.

interface Fallback {
  mode?: string;
  max_retries?: number;
  then?: string; // "humano" | "next" | "repeat"
  retry_text?: string;
}

interface Step {
  id: string;
  step_key: string;
  position: number;
  is_active: boolean;
  message_text?: string | null;
}

interface CustomerLike {
  custom_step_retries?: number;
  custom_step_retries_step?: string | null;
}

type RetryDecision =
  | { kind: "skip" } // fb.mode !== "retry"
  | {
    kind: "retry-text";
    reply: string;
    newCount: number;
    newStepRef: string;
  }
  | {
    kind: "escalate-humano";
    reply: string;
    botPaused: true;
    reason: string;
    nextStep: "aguardando_humano";
  }
  | {
    kind: "advance-next";
    targetStepId: string;
    resetCounters: true;
  }
  | {
    kind: "repeat-final";
    reply: string;
    newCount: number;
    newStepRef: string;
  };

/**
 * Pure replica of the retry decision block. Used exclusively for PBT —
 * verify that whatever change we make to the production code keeps these
 * properties holding.
 */
function decideRetry(
  fb: Fallback,
  currentStep: Step,
  customer: CustomerLike,
  dbSteps: Step[],
  defaultHandoffText = "Já chamei alguém pra te ajudar 🤝",
): RetryDecision {
  if (fb.mode !== "retry") return { kind: "skip" };

  const maxRetries = Math.max(1, Number(fb.max_retries ?? 2));
  const sameStep = String(customer.custom_step_retries_step || "") === currentStep.id;
  const prevCount = sameStep ? Number(customer.custom_step_retries || 0) : 0;
  const newCount = prevCount + 1;

  // resolve retry_text with the same precedence as production:
  //   fb.retry_text || renderStepText(currentStep) || hardcoded default
  const retryText = String(
    fb.retry_text ||
      (currentStep.message_text || "").trim() ||
      "Pode me responder, por favor? 🙂",
  );

  if (newCount > maxRetries) {
    const then = String(fb.then || "humano");

    if (then === "humano") {
      return {
        kind: "escalate-humano",
        reply: defaultHandoffText,
        botPaused: true,
        reason: `${currentStep.step_key}_retry_exhausted`,
        nextStep: "aguardando_humano",
      };
    }

    if (then === "next") {
      const nextByPos = dbSteps.find((s) => s.is_active && s.position > currentStep.position);
      if (nextByPos) {
        return {
          kind: "advance-next",
          targetStepId: nextByPos.id,
          resetCounters: true,
        };
      }
      // no next step → fall through to repeat
    }

    // then === "repeat" or fallthrough from "next"
    return {
      kind: "repeat-final",
      reply: retryText,
      newCount,
      newStepRef: currentStep.id,
    };
  }

  return {
    kind: "retry-text",
    reply: retryText,
    newCount,
    newStepRef: currentStep.id,
  };
}

/**
 * Pure replica of the goToStep reset-counters logic
 * (evolution-webhook/handlers/conversational/index.ts ~linha 1748).
 * Returns the patch that goToStep would apply when transitioning to `target`.
 */
function applyAdvanceReset(
  customer: CustomerLike,
  target: Step,
): { custom_step_retries: number; custom_step_retries_step: null } | Record<string, never> {
  const customerRetriesStep = String(customer.custom_step_retries_step || "");
  if (customerRetriesStep && customerRetriesStep !== target.id) {
    return { custom_step_retries: 0, custom_step_retries_step: null };
  }
  return {};
}

// ─── Arbitraries ────────────────────────────────────────────────────────

const stepKeyArb = fc.constantFrom(
  "ask_choice",
  "d_pedir_conta",
  "d_pedir_documento",
  "qualificacao",
  "menu_inicial",
);

const stepIdArb = fc.uuidV(4);

const stepArb: fc.Arbitrary<Step> = fc.record({
  id: stepIdArb,
  step_key: stepKeyArb,
  position: fc.integer({ min: 0, max: 50 }),
  is_active: fc.constant(true),
  message_text: fc.option(fc.string({ minLength: 0, maxLength: 80 }), { nil: null }),
});

const fbRetryArb: fc.Arbitrary<Fallback> = fc.record({
  mode: fc.constant("retry"),
  max_retries: fc.integer({ min: 1, max: 5 }),
  then: fc.constantFrom("humano", "next", "repeat"),
  retry_text: fc.option(
    fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
    { nil: undefined as unknown as string },
  ),
});

const fbNonRetryArb: fc.Arbitrary<Fallback> = fc.record({
  mode: fc.constantFrom("repeat", "ai_answer", "goto", undefined as unknown as string),
  max_retries: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined as unknown as number }),
  then: fc.option(
    fc.constantFrom("humano", "next", "repeat") as fc.Arbitrary<string>,
    { nil: undefined as unknown as string },
  ),
  retry_text: fc.option(fc.string({ minLength: 0, maxLength: 60 }), { nil: undefined as unknown as string }),
});

// ─── Property 1: counter monotonicity ──────────────────────────────────
// **Validates: Property 1 (Requirements 1.1, 1.6)**
//
// For any sequence of N turns in the SAME step with `fb.mode = "retry"`,
// `custom_step_retries` increases by exactly +1 on every turn that
// produces a retry-text or repeat-final reply. (When `then=repeat` is
// configured the counter keeps growing without bound — acknowledged as
// a known TODO in design.md "Risks & Mitigations". The invariant we
// guard here is strict +1 monotonicity, which guarantees the counter
// is never reset/decreased mid-step.)

Deno.test("PBT — Property 1: counter monotonicity over N turns in the same step", () => {
  fc.assert(
    fc.property(
      fbRetryArb,
      stepArb,
      fc.integer({ min: 1, max: 10 }), // sequence length
      (fb, step, n) => {
        let customer: CustomerLike = {
          custom_step_retries: 0,
          custom_step_retries_step: null,
        };
        const observed: number[] = [];

        for (let i = 0; i < n; i++) {
          const dec = decideRetry(fb, step, customer, [step]);

          if (dec.kind === "retry-text") {
            observed.push(dec.newCount);
            customer = {
              custom_step_retries: dec.newCount,
              custom_step_retries_step: dec.newStepRef,
            };
          } else if (dec.kind === "repeat-final") {
            observed.push(dec.newCount);
            // production still updates counters in repeat-final case
            customer = {
              custom_step_retries: dec.newCount,
              custom_step_retries_step: dec.newStepRef,
            };
          } else {
            // escalate-humano or advance-next reset to 0; we stop here.
            break;
          }
        }

        // strictly +1 monotonic — every turn increments by exactly 1
        for (let i = 0; i < observed.length; i++) {
          if (observed[i] !== i + 1) return false;
        }
        return true;
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 2: escalate determinism ──────────────────────────────────
// **Validates: Property 2 (Requirements 1.2, 1.3, 1.4, 2.4)**
//
// Truth table on (attempts, max_retries, then) → escalate result.

Deno.test("PBT — Property 2: escalate determinism follows the truth table", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 5 }), // max_retries
      fc.integer({ min: 1, max: 10 }), // attempts (= prevCount + 1)
      fc.constantFrom("humano", "next", "repeat"),
      stepArb,
      fc.option(
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
        { nil: undefined as unknown as string },
      ),
      (maxRetries, attempts, then, step, retryText) => {
        // Setup customer state so newCount === attempts
        const prevCount = attempts - 1;
        const customer: CustomerLike = {
          custom_step_retries: prevCount,
          custom_step_retries_step: prevCount > 0 ? step.id : null,
        };
        const fb: Fallback = {
          mode: "retry",
          max_retries: maxRetries,
          then,
          retry_text: retryText,
        };
        // dbSteps has ONLY the current step (no next step possible) so
        // then="next" without a successor falls through to repeat-final.
        const dec = decideRetry(fb, step, customer, [step]);

        const exceeds = attempts > maxRetries;
        if (!exceeds) {
          return dec.kind === "retry-text" && dec.newCount === attempts;
        }

        // attempts > maxRetries: escalate iff then === "humano"
        if (then === "humano") {
          return dec.kind === "escalate-humano" &&
            (dec as { reason: string }).reason === `${step.step_key}_retry_exhausted`;
        }
        if (then === "next") {
          // no successor in dbSteps → falls through to repeat-final (no escalate)
          return dec.kind === "repeat-final";
        }
        // then === "repeat"
        return dec.kind === "repeat-final";
      },
    ),
    { numRuns: 100 },
  );
});

// Sanity: when there IS a next step in dbSteps, then=next routes to advance-next.
Deno.test("PBT — Property 2 (next-with-successor): exceeds + then=next routes to advance-next", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: 2, max: 10 }), // attempts must exceed
      stepArb,
      stepArb,
      (maxRetries, attempts, currentStep, _nextStepRaw) => {
        // Build a strictly later next step
        const nextStep: Step = { ..._nextStepRaw, position: currentStep.position + 1, is_active: true };
        const fb: Fallback = {
          mode: "retry",
          max_retries: maxRetries,
          then: "next",
          retry_text: "x",
        };
        const customer: CustomerLike = {
          custom_step_retries: attempts - 1,
          custom_step_retries_step: attempts - 1 > 0 ? currentStep.id : null,
        };
        const exceeds = attempts > maxRetries;
        if (!exceeds) return true; // not the regime we test here

        const dec = decideRetry(fb, currentStep, customer, [currentStep, nextStep]);
        return dec.kind === "advance-next" &&
          (dec as { targetStepId: string }).targetStepId === nextStep.id &&
          (dec as { resetCounters: true }).resetCounters === true;
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 3: no regression for variant != D / non-retry fb ─────────
// **Validates: Property 3 (Requirements 2.6, 3.1, 3.2, 3.3, 5.1)**
//
// For any `fb` with `fb.mode !== "retry"`, decideRetry MUST return
// `{ kind: "skip" }` — production code falls through to the existing
// `_smartRepeat` / hardcoded text path unchanged. No counters touched,
// no extra queries.

Deno.test("PBT — Property 3: non-retry fb produces 'skip' (no behavioral change)", () => {
  fc.assert(
    fc.property(
      fbNonRetryArb,
      stepArb,
      fc.integer({ min: 0, max: 5 }), // arbitrary prev counter
      (fb, step, prev) => {
        const customer: CustomerLike = {
          custom_step_retries: prev,
          custom_step_retries_step: prev > 0 ? step.id : null,
        };
        const dec = decideRetry(fb, step, customer, [step]);
        return dec.kind === "skip";
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 4: retry_text never empty ────────────────────────────────
// **Validates: Property 4 (Requirements 1.1, 2.3)**
//
// For any `fb.mode = "retry"`, every reply emitted by decideRetry has
// `length > 0`. Precedence: fb.retry_text → step.message_text → hardcoded.

Deno.test("PBT — Property 4: retry_text resolution never yields empty reply", () => {
  fc.assert(
    fc.property(
      // fb where retry_text MAY be empty/missing
      fc.record({
        mode: fc.constant("retry"),
        max_retries: fc.integer({ min: 1, max: 5 }),
        then: fc.constantFrom("humano", "next", "repeat"),
        retry_text: fc.option(
          fc.oneof(
            fc.constant(""),
            fc.string({ minLength: 0, maxLength: 30 }),
          ),
          { nil: undefined as unknown as string },
        ),
      }),
      // step where message_text MAY be empty/null
      fc.record({
        id: stepIdArb,
        step_key: stepKeyArb,
        position: fc.integer({ min: 0, max: 10 }),
        is_active: fc.constant(true),
        message_text: fc.option(
          fc.oneof(
            fc.constant(""),
            fc.constant("   "),
            fc.string({ minLength: 0, maxLength: 40 }),
          ),
          { nil: null },
        ),
      }) as fc.Arbitrary<Step>,
      fc.integer({ min: 0, max: 4 }), // attempts state
      (fb, step, prev) => {
        const customer: CustomerLike = {
          custom_step_retries: prev,
          custom_step_retries_step: prev > 0 ? step.id : null,
        };
        const dec = decideRetry(fb, step, customer, [step]);

        // skip never produces a reply (fb.mode is always "retry" here)
        if (dec.kind === "skip") return false;
        // advance-next has no reply (handled by goToStep downstream)
        if (dec.kind === "advance-next") return true;

        const reply = (dec as { reply: string }).reply;
        return typeof reply === "string" && reply.length > 0;
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Property 5: counters reset on step advance ────────────────────────
// **Validates: Property 5 (Requirements 1.5)**
//
// For ANY transition where the target step.id differs from
// `customer.custom_step_retries_step`, the patch returned by goToStep
// includes `custom_step_retries: 0` and `custom_step_retries_step: null`.

Deno.test("PBT — Property 5: counters reset whenever step.id changes on advance", () => {
  fc.assert(
    fc.property(
      stepArb,
      stepArb,
      fc.integer({ min: 1, max: 10 }),
      (sourceStep, targetStep, prev) => {
        // Force distinct ids
        if (sourceStep.id === targetStep.id) return true; // tautology, skip
        const customer: CustomerLike = {
          custom_step_retries: prev,
          custom_step_retries_step: sourceStep.id,
        };
        const patch = applyAdvanceReset(customer, targetStep);
        return (
          (patch as { custom_step_retries?: number }).custom_step_retries === 0 &&
          (patch as { custom_step_retries_step?: null }).custom_step_retries_step === null
        );
      },
    ),
    { numRuns: 100 },
  );
});

// Sanity counterpart: when target.id === stored ref, NO reset is emitted.
Deno.test("PBT — Property 5 (negative): no reset when staying on the same step", () => {
  fc.assert(
    fc.property(
      stepArb,
      fc.integer({ min: 1, max: 10 }),
      (step, prev) => {
        const customer: CustomerLike = {
          custom_step_retries: prev,
          custom_step_retries_step: step.id,
        };
        const patch = applyAdvanceReset(customer, step);
        return Object.keys(patch).length === 0;
      },
    ),
    { numRuns: 100 },
  );
});

// ─── Smoke unit tests for decideRetry (anchor cases) ───────────────────

Deno.test("decideRetry: skip when fb.mode is undefined", () => {
  const dec = decideRetry({}, fakeStep("s1"), {}, []);
  assertEquals(dec.kind, "skip");
});

Deno.test("decideRetry: first retry uses fb.retry_text and counts 1", () => {
  const dec = decideRetry(
    { mode: "retry", max_retries: 2, then: "humano", retry_text: "Tente de novo!" },
    fakeStep("s1"),
    { custom_step_retries: 0, custom_step_retries_step: null },
    [fakeStep("s1")],
  );
  assertEquals(dec.kind, "retry-text");
  if (dec.kind === "retry-text") {
    assertEquals(dec.reply, "Tente de novo!");
    assertEquals(dec.newCount, 1);
  }
});

Deno.test("decideRetry: exceeded with then=humano escalates with reason", () => {
  const dec = decideRetry(
    { mode: "retry", max_retries: 2, then: "humano", retry_text: "x" },
    { ...fakeStep("step-id-1"), step_key: "ask_choice" },
    { custom_step_retries: 2, custom_step_retries_step: "step-id-1" },
    [{ ...fakeStep("step-id-1"), step_key: "ask_choice" }],
  );
  assertEquals(dec.kind, "escalate-humano");
  if (dec.kind === "escalate-humano") {
    assert(dec.reason.endsWith("_retry_exhausted"));
    assertEquals(dec.nextStep, "aguardando_humano");
  }
});

Deno.test("decideRetry: stored ref differs from current → counter starts at 1 again", () => {
  const dec = decideRetry(
    { mode: "retry", max_retries: 2, then: "humano", retry_text: "x" },
    { ...fakeStep("s1"), id: "STEP_NOW" },
    { custom_step_retries: 5, custom_step_retries_step: "STEP_OLD" },
    [{ ...fakeStep("s1"), id: "STEP_NOW" }],
  );
  assertEquals(dec.kind, "retry-text");
  if (dec.kind === "retry-text") {
    assertEquals(dec.newCount, 1);
  }
});

function fakeStep(id: string): Step {
  return {
    id,
    step_key: "ask_choice",
    position: 0,
    is_active: true,
    message_text: "Pergunta original",
  };
}

/**
 * Variant B — "Sem áudio, texto persuasivo".
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.2.2.
 * Validates: Requirements 5.3, 5.4, 16.3, 16.6.
 *
 * Pure builder. The runner picks this strategy when
 * `flow.variant === "B"`. Variant B never emits audio — neither
 * `kind: "audio_slot"` outbounds nor `media` outbounds with
 * `media.kind: "audio"` — regardless of `mediaOrderByStepKey`. This
 * static guarantee is asserted by Property G4b (Task 21).
 *
 * Behaviour:
 *  - Text body comes from `step.persuasiveText` (preferred) falling back
 *    to `step.messageText` (Requirement 5.4 / 16.3).
 *  - When BOTH are empty/blank, the function throws so the dispatcher
 *    can surface a misconfiguration rather than letting safe-text mask
 *    it (Requirement 16.6). The runner's top-level try/catch turns this
 *    into a single safe-text outbound + log so the customer is never
 *    silenced.
 *  - When `step.stepType === "ask_choice"`, append a `choice` outbound
 *    respecting `step.preferredChoiceKind` — defaulting to `"number"`
 *    (numbered text list) since variant B is the no-frills variant.
 */

import type { OutboundMessage, VariantStrategy } from "../types.ts";
import { buildIdempotencyContent } from "./a.ts";

export const variantB: VariantStrategy = {
  buildStepOutbound({ step }) {
    const persuasive = (step.persuasiveText ?? "").trim();
    const message = (step.messageText ?? "").trim();
    const text = persuasive || message;

    if (!text) {
      // Requirement 16.6 — surface the misconfiguration. The runner's
      // catch wrapper converts this into a safe-text outbound.
      throw new Error(
        `variantB: step ${step.id} has neither persuasiveText nor messageText (Requirement 16.6)`,
      );
    }

    const out: OutboundMessage[] = [
      {
        kind: "text",
        text,
        idempotencyContent: buildIdempotencyContent(step.id, "text", text),
      },
    ];

    if (
      step.stepType === "ask_choice" &&
      step.choiceOptions &&
      step.choiceOptions.length > 0
    ) {
      const ids = step.choiceOptions.map((c) => c.id).join("|");
      out.push({
        kind: "choice",
        prompt: text,
        choice: {
          // OutboundChoice.preferred: "button" | "list" | "number".
          // Variant B defaults to numbered text list when no per-step
          // preference is set.
          preferred: step.preferredChoiceKind ?? "number",
          options: step.choiceOptions,
        },
        idempotencyContent: buildIdempotencyContent(step.id, "choice", ids),
      });
    }

    // STATIC GUARANTEE: every code path above produces only `kind: "text"`
    // or `kind: "choice"` outbounds — `audio_slot` is never reachable and
    // `media` outbounds are never constructed. Property G4b verifies this
    // empirically across 100 random flows.
    return out;
  },
};

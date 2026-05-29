/**
 * Variant C — placeholder.
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.2.4.
 * Validates: Requirement 5.7.
 *
 * Variant C is intentionally not implemented in the v3 rewrite. The
 * runner detects `flow.variant === "C"` and short-circuits to
 * {@link humanoHandler} with `handoff_reason = "variant_c_not_supported"`
 * BEFORE this strategy is ever invoked (see `v3-runner.ts` Step 2 in
 * design §2.7). This module exists so {@link pickVariant} can return a
 * total mapping over the four variant literals — calling
 * `buildStepOutbound` directly is a programmer error and throws to make
 * the violation loud.
 */

import type { VariantStrategy } from "../types.ts";

export const variantC: VariantStrategy = {
  buildStepOutbound() {
    throw new Error(
      "variantC: not implemented yet — out of scope for v3 rewrite (the runner short-circuits before reaching this).",
    );
  },
};

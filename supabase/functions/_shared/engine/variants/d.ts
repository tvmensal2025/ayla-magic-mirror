/**
 * Variant D — "Botões interativos".
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.2.3.
 * Validates: Requirements 5.5, 5.6, 12.3, 12.5.
 *
 * Pure builder. Delegates base outbound construction to {@link variantA}
 * (so audio + media ordering are identical to variant A) and overlays
 * button preferences on every emitted `choice` outbound based on the
 * channel's {@link ChannelCapabilities}.
 *
 * Capability matrix (Requirement 5.5 / 5.6 / 12.3 / 12.5):
 *  - `maxButtons === 0 && supportsList === true`
 *      → `preferred: "list"` (Whapi list message)
 *  - `supportsButtons === true && maxButtons > 0`
 *      → `preferred: "button"`, options sliced to `min(3, maxButtons)`
 *        (Whapi caps interactive buttons at 3)
 *  - else (channel cannot do buttons or lists)
 *      → `preferred: "number"` (numbered text list)
 *
 * The runner never has to check capabilities itself — variant D is the
 * only variant that consumes them.
 */

import type { OutboundMessage, VariantStrategy } from "../types.ts";
import { variantA } from "./a.ts";

export const variantD: VariantStrategy = {
  buildStepOutbound(args) {
    const base = variantA.buildStepOutbound(args);
    const { capabilities } = args;

    return base.map((item): OutboundMessage => {
      if (item.kind !== "choice") return item;

      // Branch 1: channel has no interactive buttons but has list support.
      if (capabilities.maxButtons === 0 && capabilities.supportsList) {
        return {
          ...item,
          choice: { ...item.choice, preferred: "list" },
        };
      }

      // Branch 2: channel supports interactive buttons.
      if (capabilities.supportsButtons && capabilities.maxButtons > 0) {
        const cap = Math.min(3, capabilities.maxButtons);
        return {
          ...item,
          choice: {
            ...item.choice,
            preferred: "button",
            options: item.choice.options.slice(0, cap),
          },
        };
      }

      // Branch 3: fall back to numbered text list. `OutboundChoice.preferred`
      // is `"button" | "list" | "number"` — there is no `"text"` literal,
      // so `"number"` is the canonical numbered-list value the adapter
      // renders as plain text.
      return {
        ...item,
        choice: { ...item.choice, preferred: "number" },
      };
    });
  },
};

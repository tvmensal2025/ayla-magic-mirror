/**
 * Engine v3 hook adapters.
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.4.
 * Task: 27.
 *
 * Hooks bind side-effecting modules (OCR, OTP, portal, AI) to the
 * engine's declarative deferred-action protocol. The engine consumes
 * only the `EngineHooks` shape — it never imports the impl modules.
 * The dispatcher reads the same shape and binds each `describe()` tag
 * to a real impl when resolving DeferredActions.
 *
 * Validates: Requirements 1.6, 9.1, 9.2, 9.3, 13.1, 13.2, 13.3, 13.4, 13.5.
 */

import type { CaptureSpec, EngineHooks, InboundEvent } from "./types.ts";

/**
 * Default hooks factory. Returns an EngineHooks instance whose async
 * hooks expose only `describe()` (used by the engine to know what
 * deferred actions are valid). The dispatcher binds the describe tags
 * to real implementations elsewhere.
 *
 * `captures.extract` is the only synchronous executable hook. The
 * default impl is a stub returning `{}`; production callers wire it to
 * `_shared/captureExtractors.ts`.
 */
export function defaultHooks(): EngineHooks {
  return {
    ocr: {
      describe: () => ({ kind: "ocr", pipelines: ["ocr_conta", "ocr_documento"] }),
    },
    otp: {
      describe: () => ({ kind: "otp", intercepts: "before_engine" }),
    },
    portal: {
      describe: () => ({ kind: "portal", pipelines: ["cadastro_portal", "finalizar_cadastro"] }),
    },
    captures: {
      extract: (_args: { inbound: InboundEvent; specs: CaptureSpec[] }) => ({}),
    },
    aiAnswer: {
      describe: () => ({ kind: "ai_answer", module: "_shared/ai-faq-answerer.ts" }),
    },
    aiDecide: {
      describe: () => ({ kind: "ai_decide", module: "_shared/ai-decisions.ts" }),
    },
  };
}

/**
 * Wire a custom `captures.extract` impl into the default hooks. Used by
 * the dispatcher to bind `_shared/captureExtractors.ts` at runtime
 * without forcing the engine to import that module.
 */
export function withCapturesExtractor(
  base: EngineHooks,
  extract: (args: { inbound: InboundEvent; specs: CaptureSpec[] }) => Record<string, unknown>,
): EngineHooks {
  return {
    ...base,
    captures: { extract },
  };
}

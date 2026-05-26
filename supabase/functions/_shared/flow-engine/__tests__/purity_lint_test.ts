// Purity lint for `_shared/flow-engine/v3-runner.ts`.
//
// Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md`, §2.1 (engine pure
// signature) and §2.4 (hooks contract). The runner MUST be referentially
// transparent — same `EngineInput` always yields the same `EngineOutput`.
// To enforce that by construction, we statically forbid any of the
// following from appearing in the runner source:
//
//   • value-level imports from `@supabase/supabase-js` (DB client)
//   • `supabase.from(`             — implies a Supabase client lives in scope
//   • ` fetch(`                    — outbound HTTP
//   • `Date.now(` / `setTimeout(` / `setInterval(`  — system clock / timers
//   • `Math.random(` / `crypto.randomUUID(`         — non-determinism
//
// Time-like values come from `EngineConfig.now` and
// `EngineConfig.minuteBucket`; randomness flows through
// `EngineConfig.idempotencyKeyFn`; async work is *declared* as a
// `DeferredAction` for the dispatcher to perform. See design §2.1.4 and
// §2.4 for the hook + EngineConfig pattern that replaces direct I/O.
//
// Whitelist: `import type` statements are allowed (they erase at compile
// time and cannot perform I/O). The lint never inspects which modules are
// imported with `import type` — only that any *runtime* token from the
// blocklist above is absent.
//
// This test runs as part of the existing `deno-test` job in
// `.github/workflows/ci.yml` and gracefully no-ops when `v3-runner.ts`
// has not yet been authored (Task 13 lands the runner; this test can be
// committed first per Wave 1 ordering).
//
// Validates: Requirements 1.3, 1.4, 1.5, 1.6.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const RUNNER_PATH = new URL("../v3-runner.ts", import.meta.url).pathname;

/**
 * Forbidden runtime tokens. Each entry is a literal substring; the test
 * fails when the runner source contains any of them outside of comments
 * or `import type` lines (we strip those before scanning).
 */
const FORBIDDEN_TOKENS: ReadonlyArray<{ token: string; reason: string }> = [
  {
    token: 'from "@supabase/supabase-js"',
    reason:
      'engine must not hold a Supabase client; the dispatcher (`v3-dispatcher.ts`) owns DB I/O',
  },
  {
    token: "supabase.from(",
    reason:
      "engine must not query Supabase; the dispatcher reads/writes via `v3-loader.ts` / `v3-dispatcher.ts`",
  },
  {
    token: " fetch(",
    reason:
      "engine must not perform HTTP; declare async work as a `DeferredAction` (design §2.5)",
  },
  {
    token: "Date.now(",
    reason:
      "engine must not read the system clock; consume `EngineConfig.now` and `EngineConfig.minuteBucket` (design §2.1.4)",
  },
  {
    token: "Math.random(",
    reason:
      "engine must be deterministic; derive randomness via `EngineConfig.idempotencyKeyFn` (design §2.1.4)",
  },
  {
    token: "crypto.randomUUID(",
    reason:
      "engine must be deterministic; UUIDs are inputs (`flow.steps[].id`) or derived via `EngineConfig.idempotencyKeyFn`",
  },
  {
    token: "setTimeout(",
    reason:
      "engine must not schedule timers; use `waitFor`/`waitSeconds` declaratively (`BotFlowStep`)",
  },
  {
    token: "setInterval(",
    reason: "engine must not schedule timers; the dispatcher owns scheduling",
  },
];

const FAILURE_HINT =
  "See `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.1 (engine pure signature) " +
  "and §2.4 (hooks `describe()` + `EngineConfig` injection) for the supported pattern. " +
  "If you need DB / clock / randomness, expose it via `EngineHooks` or `EngineConfig` — " +
  "never reach for it directly inside the runner.";

/**
 * Strip every line that is part of an `import type` statement. We
 * recognise both single-line forms:
 *
 *   import type { Foo } from "./x.ts";
 *
 * and multi-line forms:
 *
 *   import type {
 *     Foo,
 *     Bar,
 *   } from "./x.ts";
 *
 * Multi-line `import type` blocks are stripped by tracking an "inside
 * import type" flag until we hit a line containing `from "..."` (the
 * canonical terminator) or `from '...'`.
 */
function stripImportTypeLines(source: string): string {
  const out: string[] = [];
  let inMultiLineImportType = false;

  for (const line of source.split("\n")) {
    const trimmed = line.trim();

    if (inMultiLineImportType) {
      // We're inside an `import type { ... }` block — drop this line.
      if (/^\s*}\s*from\s+["'][^"']+["']\s*;?\s*$/.test(trimmed)) {
        inMultiLineImportType = false;
      } else if (/from\s+["'][^"']+["']\s*;?\s*$/.test(trimmed)) {
        // Some formatters keep `} from "x"` on the same line.
        inMultiLineImportType = false;
      }
      continue;
    }

    // Single-line `import type { ... } from "..."`.
    if (/^\s*import\s+type\s+/.test(line)) {
      // If the line already terminates with `from "..."`, drop it whole.
      if (/from\s+["'][^"']+["']\s*;?\s*$/.test(line)) {
        continue;
      }
      // Multi-line opener — drop and start tracking.
      inMultiLineImportType = true;
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

/** Strip `// …` and `/* … *\/` comments so e.g. a comment mentioning
 *  `Date.now(` doesn't trip the lint. */
function stripComments(source: string): string {
  // Block comments — non-greedy.
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // Line comments — to end-of-line.
  return noBlock.replace(/\/\/[^\n]*/g, "");
}

async function readRunnerOrSkip(): Promise<string | null> {
  try {
    return await Deno.readTextFile(RUNNER_PATH);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return null;
    }
    throw err;
  }
}

Deno.test(
  "v3-runner.ts contains no forbidden runtime tokens (purity lint)",
  async () => {
    const source = await readRunnerOrSkip();
    if (source === null) {
      // Wave 1 ordering: this test ships before Task 13 (runner). Skip
      // gracefully so the CI job still passes; the lint runs for real
      // once the runner is committed.
      console.warn(
        `[purity_lint] ${RUNNER_PATH} not found; skipping until Task 13 lands the runner.`,
      );
      return;
    }

    const stripped = stripComments(stripImportTypeLines(source));

    const violations: string[] = [];
    for (const { token, reason } of FORBIDDEN_TOKENS) {
      if (stripped.includes(token)) {
        violations.push(`  • ${token}  →  ${reason}`);
      }
    }

    assertEquals(
      violations,
      [],
      [
        "v3-runner.ts contains forbidden runtime tokens:",
        ...violations,
        "",
        FAILURE_HINT,
      ].join("\n"),
    );
  },
);

// ─── Self-tests for the helpers ─────────────────────────────────────────
//
// The strippers above are subtle enough to deserve their own coverage —
// otherwise a regression in `stripImportTypeLines` could silently let a
// forbidden token through.

Deno.test("stripImportTypeLines: removes single-line import type", () => {
  const src = [
    'import type { Foo } from "./x.ts";',
    "const a = Date.now();",
  ].join("\n");
  const out = stripImportTypeLines(src);
  assertEquals(out.includes("import type"), false);
  assert(out.includes("Date.now("));
});

Deno.test("stripImportTypeLines: removes multi-line import type", () => {
  const src = [
    "import type {",
    "  Foo,",
    "  Bar,",
    '} from "./x.ts";',
    "const a = 1;",
  ].join("\n");
  const out = stripImportTypeLines(src);
  assertEquals(out.includes("Foo"), false);
  assertEquals(out.includes("Bar"), false);
  assert(out.includes("const a = 1;"));
});

Deno.test("stripImportTypeLines: leaves value imports intact", () => {
  const src = [
    'import { runEngine } from "./v3-runner.ts";',
    "runEngine(input);",
  ].join("\n");
  const out = stripImportTypeLines(src);
  assert(out.includes("import { runEngine }"));
});

Deno.test("stripComments: removes // and /* */ comments", () => {
  const src = [
    "// Date.now( appears in a comment",
    "const ok = 1; /* fetch( in block */",
    "const real = Date.now();",
  ].join("\n");
  const out = stripComments(src);
  assertEquals(out.includes("// Date.now("), false);
  assertEquals(out.includes("/* fetch("), false);
  assert(out.includes("Date.now()"));
});

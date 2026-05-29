// Purity lint for the pure surface of `_shared/engine/**`.
//
// Spec: `.kiro/specs/bot-engine-channel-unification/design.md` Property 7
// ("Pureza estrutural") + §Architecture plan-de-arquivos-físico, and
// `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.1 (engine pure
// signature) and §2.4 (hooks contract).
//
// The pure runner MUST be referentially transparent — same `EngineInput`
// always yields the same `EngineOutput`. To enforce that by construction,
// we statically forbid any of the following from appearing in the pure
// engine source files:
//
//   • value-level imports from `@supabase/supabase-js` (DB client)
//   • `from(...supabase...)`     — implies a Supabase client lives in scope
//   • ` fetch(`                  — outbound HTTP
//   • `Date.now(` / `setTimeout(` / `setInterval(`  — system clock / timers
//   • `Math.random(` / `crypto.randomUUID(`         — non-determinism
//   • `whapi` / `evolution` literals (case-insensitive, word-boundary) —
//     channel-name leakage; the engine speaks `ChannelCapabilities`
//
// Time-like values come from `EngineConfig.now` and
// `EngineConfig.minuteBucket`; randomness flows through
// `EngineConfig.idempotencyKeyFn`; async work is *declared* as a
// `DeferredAction` for the dispatcher to perform. See design §2.1.4 and
// §2.4 for the hook + EngineConfig pattern that replaces direct I/O.
//
// Coverage: Task 6 (bot-engine-channel-unification) widens the walker
// from a single file to the whole pure surface of `_shared/engine/**`.
// Files that are explicitly I/O glue per the design's "Plano de
// arquivos físico" table (loader, dispatcher, router, webhook-entry,
// webhook-hook) are excluded by the `IMPURE_GLUE` denylist below;
// `engine.ts` and `legacy-router-types.ts` are legacy artefacts kept
// only until the cleanup phase. Test files under `__tests__/` are
// excluded by definition (they need `crypto.randomUUID` etc. for
// fixture generation — see `arb.ts`).
//
// Coverage: Task 13 (bot-engine-channel-unification) layers an
// additional rule on top of the token blocklist — banning the literals
// `"whapi"` and `"evolution"` (case-insensitive, word-boundary) from
// the same pure surface (Requirement 2.8). The pure runner must speak
// `ChannelCapabilities`, never the channel name. Channel literals are
// allowed in `_shared/channels/**` (where they belong) and in
// `_shared/engine/__tests__/**` (fixtures may need to construct
// concrete adapters); both are already excluded by the walker.
//
// Whitelist: `import type` statements are allowed (they erase at compile
// time and cannot perform I/O). The lint never inspects which modules
// are imported with `import type` — only that any *runtime* token from
// the blocklist above is absent.
//
// This test runs as part of the existing `deno-test` job in
// `.github/workflows/ci.yml`.
//
// Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.8 (Property 7).

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const ENGINE_ROOT = new URL("..", import.meta.url).pathname;

/**
 * Files inside `_shared/engine/**` that are explicitly I/O glue per the
 * design's "Plano de arquivos físico" table. They legitimately call
 * `supabase.from(...)`, `Date.now`, `setTimeout`, etc. and are NOT part
 * of the pure runner surface this lint protects.
 *
 * Paths are relative to `_shared/engine/` and use `/` separators.
 */
const IMPURE_GLUE: ReadonlySet<string> = new Set([
  // Engine v3 I/O glue (design §1.2 component map).
  "loader.ts", // `v3-loader.ts` successor — reads bot_flows / customers.
  "router.ts", // `_shared/flow-engine/router.ts` — DB-backed kill-switch read.
  "webhook-entry.ts", // `runUnifiedEngineWebhookEntry` — per-turn orchestrator.
  "webhook-hook.ts", // `runEngineV3IfEnabled` — dark-mode parallel hook.
  "dispatcher.ts", // legacy dispatcher copy (dispatcher/ owns I/O).
  // Task 29: `decision.ts` adiciona `readKillSwitch` / `readProdMode` /
  // `resolveEngineDecisionWithCache` que lêem Supabase com cache em
  // memória (TTL 30s fresh + 5min stale). A função pura
  // `resolveEngineDecision` é validada por `__tests__/decision_test.ts`,
  // não pelo lint.
  "decision.ts",
  // Legacy artefacts kept only until cleanup phase (Phase 9).
  "engine.ts", // legacy `tick()` from whatsapp-flow-architecture-v3.
  "legacy-router-types.ts", // type-only collision-resolution placeholder.
]);

/**
 * Forbidden runtime tokens. Each entry is a literal substring; the test
 * fails when a pure file's source contains any of them outside of
 * comments or `import type` lines (we strip those before scanning).
 */
const FORBIDDEN_TOKENS: ReadonlyArray<{ token: string; reason: string }> = [
  {
    token: 'from "@supabase/supabase-js"',
    reason:
      "engine must not hold a Supabase client; the dispatcher (`dispatcher/index.ts`) owns DB I/O",
  },
  {
    token: "supabase.from(",
    reason:
      "engine must not query Supabase; the dispatcher reads/writes via `loader.ts` / `dispatcher/index.ts`",
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

/**
 * Forbidden runtime patterns expressed as regular expressions. Used for
 * rules that need word-boundary or case-insensitive matching that a
 * literal-substring blocklist (`FORBIDDEN_TOKENS`) cannot express.
 *
 * The same comment/`import type` strippers apply before matching, so a
 * comment mentioning Whapi or Evolution does not trip the lint.
 *
 * Task 13 (Requirement 2.8) bans the channel-name literals from the
 * pure surface: the engine must speak `ChannelCapabilities`, never the
 * provider name. Channel literals are legitimate in `_shared/channels/**`
 * (where each adapter declares its own kind) and in
 * `_shared/engine/__tests__/**` (fixture generators may construct
 * concrete adapters); both directories are already excluded from the
 * walker, so no allowlist is needed here.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  reason: string;
}> = [
  {
    pattern: /\b(whapi|evolution)\b/i,
    label: 'literal "whapi" / "evolution"',
    reason:
      "engine must not name channels; consume `ChannelCapabilities` (design §2, Requirement 2.8). " +
      "If you need provider-specific behaviour, declare a capability on `ChannelCapabilities` and " +
      "branch on it; channel literals belong to `_shared/channels/**`.",
  },
];

const FAILURE_HINT =
  "See `.kiro/specs/bot-engine-channel-unification/design.md` Property 7 " +
  "and `.kiro/specs/flow-engine-v3-rewrite/design.md` §2.1 (engine pure signature) / " +
  "§2.4 (hooks `describe()` + `EngineConfig` injection) for the supported pattern. " +
  "If the file is genuinely I/O glue, add it to `IMPURE_GLUE` in this test " +
  "(with a one-line justification). Otherwise expose the side effect via " +
  "`EngineHooks` or `EngineConfig` — never reach for it directly inside the engine.";

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

/**
 * Recursively walk `_shared/engine/**`, returning `.ts` files that are
 * (a) not under `__tests__/` (test scaffolding may legitimately use
 * `crypto.randomUUID` etc.) and (b) not in {@link IMPURE_GLUE}. Paths
 * returned are relative to `ENGINE_ROOT` with `/` separators so the
 * denylist lookup is platform-agnostic.
 */
async function listPureFiles(): Promise<string[]> {
  const found: string[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: AsyncIterable<Deno.DirEntry>;
    try {
      entries = Deno.readDir(absDir);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return;
      throw err;
    }
    for await (const entry of entries) {
      const absPath = `${absDir}${entry.name}`;
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        // Skip `__tests__/` — fixture generators may use forbidden tokens.
        if (entry.name === "__tests__") continue;
        await walk(`${absPath}/`, relPath);
        continue;
      }
      if (!entry.isFile) continue;
      if (!entry.name.endsWith(".ts")) continue;
      if (IMPURE_GLUE.has(relPath)) continue;
      // Co-located unit tests (e.g. `engine_test.ts`) — skip by suffix.
      if (entry.name.endsWith("_test.ts")) continue;
      found.push(relPath);
    }
  }

  await walk(ENGINE_ROOT, "");
  found.sort();
  return found;
}

Deno.test(
  "_shared/engine/** pure surface contains no forbidden runtime tokens (purity lint)",
  async () => {
    const pureFiles = await listPureFiles();
    assert(
      pureFiles.length > 0,
      `purity lint walked ${ENGINE_ROOT} and found zero files — the walker or path is broken.`,
    );

    const violations: string[] = [];
    for (const rel of pureFiles) {
      const source = await Deno.readTextFile(`${ENGINE_ROOT}${rel}`);
      const stripped = stripComments(stripImportTypeLines(source));
      for (const { token, reason } of FORBIDDEN_TOKENS) {
        if (stripped.includes(token)) {
          violations.push(`  • ${rel}: ${token}  →  ${reason}`);
        }
      }
      for (const { pattern, label, reason } of FORBIDDEN_PATTERNS) {
        const match = stripped.match(pattern);
        if (match) {
          violations.push(
            `  • ${rel}: ${label} (matched ${JSON.stringify(match[0])})  →  ${reason}`,
          );
        }
      }
    }

    assertEquals(
      violations,
      [],
      [
        `_shared/engine/** pure surface contains forbidden runtime tokens (${pureFiles.length} files scanned):`,
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
    'import { runEngine } from "./runner.ts";',
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

Deno.test("listPureFiles: excludes IMPURE_GLUE and __tests__/", async () => {
  const pureFiles = await listPureFiles();
  // Spot-checks: pure modules MUST be in the result.
  assert(
    pureFiles.includes("runner.ts"),
    "runner.ts should be walked by purity lint",
  );
  assert(
    pureFiles.includes("helpers.ts"),
    "helpers.ts should be walked by purity lint",
  );
  assert(
    pureFiles.includes("variants/a.ts"),
    "variants/a.ts should be walked by purity lint",
  );
  // Spot-checks: I/O glue and tests MUST NOT be in the result.
  assert(
    !pureFiles.includes("loader.ts"),
    "loader.ts is I/O glue and must be excluded",
  );
  assert(
    !pureFiles.includes("dispatcher.ts"),
    "dispatcher.ts is I/O glue and must be excluded",
  );
  assert(
    !pureFiles.includes("webhook-entry.ts"),
    "webhook-entry.ts is I/O glue and must be excluded",
  );
  assert(
    !pureFiles.includes("decision.ts"),
    "decision.ts is I/O glue (Task 29 cache) and must be excluded",
  );
  for (const rel of pureFiles) {
    assert(
      !rel.startsWith("__tests__/"),
      `__tests__/ files must be excluded (got ${rel})`,
    );
    assert(
      !rel.endsWith("_test.ts"),
      `_test.ts files must be excluded (got ${rel})`,
    );
  }
});
Deno.test(
  "FORBIDDEN_PATTERNS: channel-name regex matches whapi/evolution case-insensitively, with word boundaries",
  () => {
    const channelRule = FORBIDDEN_PATTERNS.find((r) =>
      r.label.includes("whapi")
    );
    assert(channelRule, "channel-name forbidden pattern must be registered");
    const re = channelRule!.pattern;

    // Positive cases — must match.
    assert('const c = "whapi";'.match(re), 'should match literal "whapi"');
    assert(
      'const c = "evolution";'.match(re),
      'should match literal "evolution"',
    );
    assert(
      'kind === "Whapi"'.match(re),
      "should match case-insensitively (Whapi)",
    );
    assert(
      'channel: "EVOLUTION"'.match(re),
      "should match case-insensitively (EVOLUTION)",
    );

    // Negative cases — word boundary must reject substrings inside
    // other identifiers so legitimate names (e.g. "preEvolution",
    // "whapix") never trigger. We don't expect such names today, but
    // the contract should be precise.
    assertEquals(
      "const x = preevolutionHook;".match(re),
      null,
      "must not match a substring inside another identifier",
    );
    assertEquals(
      "const x = whapix;".match(re),
      null,
      "must not match a substring inside another identifier",
    );
  },
);

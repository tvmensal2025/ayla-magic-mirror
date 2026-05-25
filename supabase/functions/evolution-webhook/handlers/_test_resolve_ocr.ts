// Unit tests for `resolveOcrFallback` (Evolution edition).
//
// Validates Requirements 2.5 and Property 2 (escalate determinism) of spec
// `flow-d-retry-rules-fix`. Helper is exported via `__test` re-export to
// avoid changing its visibility outside the module.
//
// Mock Supabase is in-memory: a tiny query-builder that records the chain
// `.from(table).select(...).eq(...).order(...).limit(...).maybeSingle()`
// and returns canned `{ data, error }`.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { __test } from "./bot-flow.ts";

const { resolveOcrFallback } = __test;

// ─────────────────────────────────────────────────────────────────────
// In-memory Supabase mock
// ─────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

interface MockOptions {
  /** Optional override: throw on first call to `.from(table)` for any of these. */
  errorTables?: string[];
}

function createMockSupabase(tables: Tables, opts: MockOptions = {}) {
  const errorTables = new Set(opts.errorTables ?? []);

  function makeQuery(rows: Row[]) {
    let filtered = [...rows];
    let limited: number | null = null;
    const builder: any = {
      select(_cols: string) {
        return builder;
      },
      eq(col: string, val: unknown) {
        filtered = filtered.filter((r) => r[col] === val);
        return builder;
      },
      order(_col: string, _opts?: unknown) {
        // tests don't depend on order; rows are inserted pre-sorted
        return builder;
      },
      limit(n: number) {
        limited = n;
        return builder;
      },
      async maybeSingle() {
        const view = limited != null ? filtered.slice(0, limited) : filtered;
        if (view.length === 0) return { data: null, error: null };
        return { data: view[0], error: null };
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (errorTables.has(table)) {
        throw new Error(`mock: forced error on table ${table}`);
      }
      return makeQuery(tables[table] ?? []);
    },
  };
}

const DEFAULT_TEXT = "default-retry-text";
const CONFIGURED_TEXT = "Por favor, envie uma foto mais nítida 📸";
const CONSULTANT_ID = "consultant-1";
const CUSTOMER_ID = "customer-1";

// ─────────────────────────────────────────────────────────────────────
// Test 1: variant A sem fallback retry → defaultText, no escalate
// ─────────────────────────────────────────────────────────────────────
Deno.test("resolveOcrFallback: variant A sem fallback retry → defaultText, no escalate", async () => {
  const supabase = createMockSupabase({
    bot_flows: [
      { id: "flow-a", consultant_id: CONSULTANT_ID, is_active: true, variant: "A" },
    ],
    bot_flow_steps: [
      // step exists but fallback is null/empty — handler must return defaults
      {
        flow_id: "flow-a",
        step_type: "capture_conta",
        is_active: true,
        fallback: null,
      },
    ],
  });

  const result = await resolveOcrFallback(
    supabase,
    CUSTOMER_ID,
    CONSULTANT_ID,
    "capture_conta",
    1,
    DEFAULT_TEXT,
    "A",
  );

  assertEquals(result.retryText, DEFAULT_TEXT);
  assertEquals(result.escalate, false);
});

// ─────────────────────────────────────────────────────────────────────
// Test 2: variant D sem fallback retry → defaultText, no escalate
// ─────────────────────────────────────────────────────────────────────
Deno.test("resolveOcrFallback: variant D sem fallback retry → defaultText, no escalate", async () => {
  const supabase = createMockSupabase({
    bot_flows: [
      { id: "flow-d", consultant_id: CONSULTANT_ID, is_active: true, variant: "D" },
    ],
    bot_flow_steps: [
      {
        flow_id: "flow-d",
        step_type: "capture_conta",
        is_active: true,
        // fallback exists but mode != retry → defaults
        fallback: { mode: "ai_answer" },
      },
    ],
  });

  const result = await resolveOcrFallback(
    supabase,
    CUSTOMER_ID,
    CONSULTANT_ID,
    "capture_conta",
    1,
    DEFAULT_TEXT,
    "D",
  );

  assertEquals(result.retryText, DEFAULT_TEXT);
  assertEquals(result.escalate, false);
});

// ─────────────────────────────────────────────────────────────────────
// Test 3: variant D, mode=retry, attempts < max → configured text, no escalate
// ─────────────────────────────────────────────────────────────────────
Deno.test("resolveOcrFallback: variant D mode=retry, attempts < max → configured text, no escalate", async () => {
  const supabase = createMockSupabase({
    bot_flows: [
      { id: "flow-d", consultant_id: CONSULTANT_ID, is_active: true, variant: "D" },
    ],
    bot_flow_steps: [
      {
        flow_id: "flow-d",
        step_type: "capture_conta",
        is_active: true,
        fallback: {
          mode: "retry",
          retry_text: CONFIGURED_TEXT,
          max_retries: 3,
          then: "humano",
        },
      },
    ],
  });

  const result = await resolveOcrFallback(
    supabase,
    CUSTOMER_ID,
    CONSULTANT_ID,
    "capture_conta",
    1, // attempts < max (1 < 3)
    DEFAULT_TEXT,
    "D",
  );

  assertEquals(result.retryText, CONFIGURED_TEXT);
  assertEquals(result.escalate, false);
});

// ─────────────────────────────────────────────────────────────────────
// Test 4: variant D, mode=retry, attempts >= max, then=humano → escalate
// ─────────────────────────────────────────────────────────────────────
Deno.test("resolveOcrFallback: variant D mode=retry, attempts >= max, then=humano → escalate=true", async () => {
  const supabase = createMockSupabase({
    bot_flows: [
      { id: "flow-d", consultant_id: CONSULTANT_ID, is_active: true, variant: "D" },
    ],
    bot_flow_steps: [
      {
        flow_id: "flow-d",
        step_type: "capture_documento",
        is_active: true,
        fallback: {
          mode: "retry",
          retry_text: CONFIGURED_TEXT,
          max_retries: 2,
          then: "humano",
        },
      },
    ],
  });

  const result = await resolveOcrFallback(
    supabase,
    CUSTOMER_ID,
    CONSULTANT_ID,
    "capture_documento",
    2, // attempts >= max (2 >= 2)
    DEFAULT_TEXT,
    "D",
  );

  assertEquals(result.retryText, CONFIGURED_TEXT);
  assertEquals(result.escalate, true);
});

// ─────────────────────────────────────────────────────────────────────
// Test 5: erro de query (banco indisponível) → fallback gracioso
// ─────────────────────────────────────────────────────────────────────
Deno.test("resolveOcrFallback: erro de query (banco indisponível) → fallback gracioso", async () => {
  const supabase = createMockSupabase(
    {
      bot_flows: [
        { id: "flow-d", consultant_id: CONSULTANT_ID, is_active: true, variant: "D" },
      ],
    },
    { errorTables: ["bot_flows"] },
  );

  // Silence the expected console.warn from the helper.
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await resolveOcrFallback(
      supabase,
      CUSTOMER_ID,
      CONSULTANT_ID,
      "capture_conta",
      1,
      DEFAULT_TEXT,
      "D",
    );

    assertEquals(result.retryText, DEFAULT_TEXT);
    assertEquals(result.escalate, false);
  } finally {
    console.warn = realWarn;
  }
});

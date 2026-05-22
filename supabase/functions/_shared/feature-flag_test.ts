import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "https://esm.sh/fast-check@3.23.2";
import {
  clearFeatureFlagCache,
  type FlowReliabilityV2Flag,
  getFlowReliabilityV2,
  isV2Active,
  isV2Dark,
  isV2Enabled,
} from "./feature-flag.ts";

// ─── Fake Supabase client ────────────────────────────────────────────────
// Minimal builder shaped like the real PostgREST client, scoped just to
// `from("consultants").select("flow_reliability_v2").eq("id", id).single()`.
// The stored value is mutable so tests can simulate remote UPDATEs.

interface FakeStore {
  rows: Map<string, { flow_reliability_v2: unknown } | null>;
  errorOnNext?: { code?: string; message: string } | null;
  selectCalls: number;
}

function makeFakeSupabase(initial: Array<[string, unknown]> = []): {
  client: any;
  store: FakeStore;
  setValue: (id: string, v: unknown) => void;
  remove: (id: string) => void;
  failNext: (err: { code?: string; message: string }) => void;
} {
  const store: FakeStore = {
    rows: new Map(),
    errorOnNext: null,
    selectCalls: 0,
  };
  for (const [id, v] of initial) {
    store.rows.set(id, { flow_reliability_v2: v });
  }

  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, value: string) {
              return {
                single: async () => {
                  store.selectCalls += 1;
                  if (table !== "consultants") {
                    return { data: null, error: { message: "wrong table" } };
                  }
                  if (store.errorOnNext) {
                    const err = store.errorOnNext;
                    store.errorOnNext = null;
                    return { data: null, error: err };
                  }
                  const row = store.rows.get(value);
                  if (!row) {
                    return { data: null, error: { code: "PGRST116", message: "no row" } };
                  }
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    client,
    store,
    setValue: (id, v) => {
      store.rows.set(id, { flow_reliability_v2: v });
    },
    remove: (id) => {
      store.rows.delete(id);
    },
    failNext: (err) => {
      store.errorOnNext = err;
    },
  };
}

// ─── Unit tests ─────────────────────────────────────────────────────────

Deno.test("returns the persisted value for each known flag", async () => {
  const flags: FlowReliabilityV2Flag[] = ["off", "dark", "canary", "on"];
  for (const f of flags) {
    clearFeatureFlagCache();
    const fake = makeFakeSupabase([[`c-${f}`, f]]);
    const got = await getFlowReliabilityV2(fake.client, `c-${f}`);
    assertEquals(got, f);
  }
});

Deno.test("defaults to 'off' when the consultant row is missing", async () => {
  clearFeatureFlagCache();
  const fake = makeFakeSupabase();
  const got = await getFlowReliabilityV2(fake.client, "missing-consultant");
  assertEquals(got, "off");
});

Deno.test("defaults to 'off' when the stored value is invalid", async () => {
  clearFeatureFlagCache();
  const fake = makeFakeSupabase([["c1", "totally-bogus"]]);
  const got = await getFlowReliabilityV2(fake.client, "c1");
  assertEquals(got, "off");
});

Deno.test("defaults to 'off' when the supabase call returns an error", async () => {
  clearFeatureFlagCache();
  const fake = makeFakeSupabase([["c1", "on"]]);
  fake.failNext({ message: "boom" });
  const got = await getFlowReliabilityV2(fake.client, "c1");
  assertEquals(got, "off");
});

Deno.test("returns 'off' for empty consultant id without hitting supabase", async () => {
  clearFeatureFlagCache();
  const fake = makeFakeSupabase([["c1", "on"]]);
  const got = await getFlowReliabilityV2(fake.client, "");
  assertEquals(got, "off");
  assertEquals(fake.store.selectCalls, 0);
});

Deno.test("caches the value for 30s: subsequent reads do not re-query supabase", async () => {
  clearFeatureFlagCache();
  const fake = makeFakeSupabase([["c1", "canary"]]);
  const a = await getFlowReliabilityV2(fake.client, "c1");
  const b = await getFlowReliabilityV2(fake.client, "c1");
  const c = await getFlowReliabilityV2(fake.client, "c1");
  assertEquals(a, "canary");
  assertEquals(b, "canary");
  assertEquals(c, "canary");
  assertEquals(fake.store.selectCalls, 1);
});

Deno.test("cache is per-consultant: two ids produce two queries", async () => {
  clearFeatureFlagCache();
  const fake = makeFakeSupabase([["c1", "on"], ["c2", "dark"]]);
  await getFlowReliabilityV2(fake.client, "c1");
  await getFlowReliabilityV2(fake.client, "c2");
  await getFlowReliabilityV2(fake.client, "c1");
  await getFlowReliabilityV2(fake.client, "c2");
  assertEquals(fake.store.selectCalls, 2);
});

Deno.test("cache invariant: remote UPDATE within 30s does not change the read value", async () => {
  clearFeatureFlagCache();
  const fake = makeFakeSupabase([["c1", "off"]]);
  const first = await getFlowReliabilityV2(fake.client, "c1");
  // Simulate a remote UPDATE.
  fake.setValue("c1", "on");
  const second = await getFlowReliabilityV2(fake.client, "c1");
  assertEquals(first, "off");
  assertEquals(second, "off");
  // After clearing the cache (TTL expiry equivalent), the new value is read.
  clearFeatureFlagCache();
  const third = await getFlowReliabilityV2(fake.client, "c1");
  assertEquals(third, "on");
});

Deno.test("isV2Active / isV2Dark / isV2Enabled flag classification", () => {
  assertEquals(isV2Active("off"), false);
  assertEquals(isV2Active("dark"), false);
  assertEquals(isV2Active("canary"), true);
  assertEquals(isV2Active("on"), true);

  assertEquals(isV2Dark("off"), false);
  assertEquals(isV2Dark("dark"), true);
  assertEquals(isV2Dark("canary"), false);
  assertEquals(isV2Dark("on"), false);

  assertEquals(isV2Enabled("off"), false);
  assertEquals(isV2Enabled("dark"), true);
  assertEquals(isV2Enabled("canary"), true);
  assertEquals(isV2Enabled("on"), true);
});

// ─── Property-based test ───────────────────────────────────────────────
// Property: For any sequence of GET / UPDATE operations performed within
// the 30s cache window, every getFlowReliabilityV2 read returns the value
// that was persisted at the time of the first GET, regardless of any
// intervening UPDATEs to the underlying row.
//
// **Validates: §8 do design (rollout)**
Deno.test("PBT: cache freezes flag for 30s across remote UPDATEs", async () => {
  const flagArb: fc.Arbitrary<FlowReliabilityV2Flag> = fc.constantFrom(
    "off",
    "dark",
    "canary",
    "on",
  );

  type Op =
    | { kind: "get" }
    | { kind: "update"; value: FlowReliabilityV2Flag };

  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ kind: fc.constant("get" as const) }),
    fc.record({
      kind: fc.constant("update" as const),
      value: flagArb,
    }),
  );

  await fc.assert(
    fc.asyncProperty(
      flagArb,
      fc.array(opArb, { minLength: 1, maxLength: 50 }),
      async (initial, ops) => {
        clearFeatureFlagCache();
        const fake = makeFakeSupabase([["consultant-x", initial]]);

        // First read establishes the frozen value.
        const baseline = await getFlowReliabilityV2(fake.client, "consultant-x");
        if (baseline !== initial) return false;

        for (const op of ops) {
          if (op.kind === "update") {
            fake.setValue("consultant-x", op.value);
          } else {
            const seen = await getFlowReliabilityV2(fake.client, "consultant-x");
            if (seen !== baseline) return false;
          }
        }
        // Only one supabase round-trip should have occurred regardless of
        // how many gets were performed within the cache window.
        if (fake.store.selectCalls !== 1) return false;
        return true;
      },
    ),
    { numRuns: 75 },
  );
});

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "https://esm.sh/fast-check@3.23.2";
import {
  acquireOutboundSlot,
  type AcquireOutboundSlotInput,
  computeIdempotencyKey,
  type IdempotencyKeyInput,
  recordOutboundResult,
} from "./idempotency.ts";

// ─── Fake Supabase client ────────────────────────────────────────────────
// Models the subset of PostgREST surface used by acquireOutboundSlot:
//   .from(table).upsert(row, { onConflict, ignoreDuplicates }).select(cols)
//   .from(table).select(cols).eq(col, val).maybeSingle()
//   .from(table).update(patch).eq(col, val)
// Storage is a simple Map keyed by idempotency_key. The "upsert with
// ignoreDuplicates" semantics: insert returns the row; conflict returns
// an empty array.

interface OutboundRow {
  idempotency_key: string;
  customer_id: string;
  consultant_id: string;
  payload_hash: string;
  result_status: string | null;
  evolution_message_id: string | null;
}

function makeFakeSupabase() {
  const rows = new Map<string, OutboundRow>();
  let upsertCalls = 0;
  let selectCalls = 0;
  let updateCalls = 0;
  let nextErrorOnUpsert: { code?: string; message: string } | null = null;
  let nextErrorOnSelect: { code?: string; message: string } | null = null;

  const client = {
    from(table: string) {
      if (table !== "outbound_message_log") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        upsert(
          row: Omit<OutboundRow, "result_status" | "evolution_message_id">,
          opts: { onConflict: string; ignoreDuplicates: boolean },
        ) {
          upsertCalls += 1;
          if (opts.onConflict !== "idempotency_key" || !opts.ignoreDuplicates) {
            throw new Error("unexpected upsert opts");
          }
          return {
            select(_cols: string) {
              return Promise.resolve(executeUpsert(row));
            },
          };
        },
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              if (col !== "idempotency_key") {
                throw new Error("unexpected eq col on select");
              }
              return {
                maybeSingle() {
                  selectCalls += 1;
                  if (nextErrorOnSelect) {
                    const err = nextErrorOnSelect;
                    nextErrorOnSelect = null;
                    return Promise.resolve({ data: null, error: err });
                  }
                  return Promise.resolve({
                    data: rows.get(val) ?? null,
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(patch: Partial<OutboundRow>) {
          return {
            eq(col: string, val: string) {
              updateCalls += 1;
              if (col !== "idempotency_key") {
                throw new Error("unexpected eq col on update");
              }
              const existing = rows.get(val);
              if (existing) rows.set(val, { ...existing, ...patch });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  function executeUpsert(
    row: Omit<OutboundRow, "result_status" | "evolution_message_id">,
  ) {
    if (nextErrorOnUpsert) {
      const err = nextErrorOnUpsert;
      nextErrorOnUpsert = null;
      return { data: null, error: err };
    }
    if (rows.has(row.idempotency_key)) {
      // ON CONFLICT DO NOTHING + .select() → []
      return { data: [], error: null };
    }
    const newRow: OutboundRow = {
      ...row,
      result_status: null,
      evolution_message_id: null,
    };
    rows.set(row.idempotency_key, newRow);
    return {
      data: [{
        result_status: newRow.result_status,
        evolution_message_id: newRow.evolution_message_id,
      }],
      error: null,
    };
  }

  return {
    client: client as any,
    rows,
    seedExisting(row: OutboundRow) {
      rows.set(row.idempotency_key, row);
    },
    failNextUpsert(err: { code?: string; message: string }) {
      nextErrorOnUpsert = err;
    },
    failNextSelect(err: { code?: string; message: string }) {
      nextErrorOnSelect = err;
    },
    metrics() {
      return { upsertCalls, selectCalls, updateCalls };
    },
  };
}

// ─── Unit tests: computeIdempotencyKey ────────────────────────────────────

Deno.test("computeIdempotencyKey is deterministic for the same input", async () => {
  const input: IdempotencyKeyInput = {
    customerId: "c-1",
    step: "welcome",
    content: "oii tudo bem?",
    minuteBucket: 29_555_111,
  };
  const a = await computeIdempotencyKey(input);
  const b = await computeIdempotencyKey(input);
  assertEquals(a, b);
});

Deno.test("computeIdempotencyKey returns base64url (no +, /, =)", async () => {
  const k = await computeIdempotencyKey({
    customerId: "c-1",
    step: "welcome",
    content: "x",
    minuteBucket: 0,
  });
  assertEquals(/^[A-Za-z0-9_\-]+$/.test(k), true);
});

Deno.test("computeIdempotencyKey differs when any field differs", async () => {
  const base: IdempotencyKeyInput = {
    customerId: "c-1",
    step: "welcome",
    content: "olá",
    minuteBucket: 100,
  };
  const k0 = await computeIdempotencyKey(base);
  const k1 = await computeIdempotencyKey({ ...base, customerId: "c-2" });
  const k2 = await computeIdempotencyKey({ ...base, step: "aguardando_conta" });
  const k3 = await computeIdempotencyKey({ ...base, content: "ola" });
  const k4 = await computeIdempotencyKey({ ...base, minuteBucket: 101 });
  assertNotEquals(k0, k1);
  assertNotEquals(k0, k2);
  assertNotEquals(k0, k3);
  assertNotEquals(k0, k4);
});

Deno.test("computeIdempotencyKey defaults minuteBucket to floor(Date.now()/60000)", async () => {
  const before = Math.floor(Date.now() / 60_000);
  const k = await computeIdempotencyKey({
    customerId: "c-1",
    step: "welcome",
    content: "x",
  });
  const after = Math.floor(Date.now() / 60_000);
  // Reproduce the key with each candidate bucket; one must match.
  const cands = [];
  for (let b = before; b <= after; b++) {
    cands.push(
      await computeIdempotencyKey({
        customerId: "c-1",
        step: "welcome",
        content: "x",
        minuteBucket: b,
      }),
    );
  }
  assertEquals(cands.includes(k), true);
});

// ─── Unit tests: acquireOutboundSlot ─────────────────────────────────────

Deno.test("acquireOutboundSlot inserts on first call", async () => {
  const fake = makeFakeSupabase();
  const input: AcquireOutboundSlotInput = {
    idempotencyKey: "key-1",
    customerId: "c-1",
    consultantId: "k-1",
    payloadHash: "p-1",
  };
  const r = await acquireOutboundSlot(fake.client, input);
  assertEquals(r.acquired, true);
  assertEquals(fake.rows.size, 1);
});

Deno.test("acquireOutboundSlot reports prior result on conflict", async () => {
  const fake = makeFakeSupabase();
  fake.seedExisting({
    idempotency_key: "key-1",
    customer_id: "c-1",
    consultant_id: "k-1",
    payload_hash: "p-1",
    result_status: "ok",
    evolution_message_id: "evo-123",
  });

  const r = await acquireOutboundSlot(fake.client, {
    idempotencyKey: "key-1",
    customerId: "c-1",
    consultantId: "k-1",
    payloadHash: "p-1",
  });
  assertEquals(r.acquired, false);
  assertEquals(r.previousResultStatus, "ok");
  assertEquals(r.previousMessageId, "evo-123");
});

Deno.test("acquireOutboundSlot is fail-open on upsert error", async () => {
  const fake = makeFakeSupabase();
  fake.failNextUpsert({ code: "57P01", message: "boom" });
  const r = await acquireOutboundSlot(fake.client, {
    idempotencyKey: "key-fail",
    customerId: "c-1",
    consultantId: "k-1",
    payloadHash: "p-1",
  });
  assertEquals(r.acquired, true);
});

Deno.test("acquireOutboundSlot returns acquired=true for empty key", async () => {
  const fake = makeFakeSupabase();
  const r = await acquireOutboundSlot(fake.client, {
    idempotencyKey: "",
    customerId: "c-1",
    consultantId: "k-1",
    payloadHash: "p-1",
  });
  assertEquals(r.acquired, true);
  assertEquals(fake.metrics().upsertCalls, 0);
});

Deno.test("recordOutboundResult patches the row", async () => {
  const fake = makeFakeSupabase();
  await acquireOutboundSlot(fake.client, {
    idempotencyKey: "key-r",
    customerId: "c-1",
    consultantId: "k-1",
    payloadHash: "p-1",
  });
  await recordOutboundResult(fake.client, "key-r", "sent", "evo-9");
  const row = fake.rows.get("key-r");
  assertEquals(row?.result_status, "sent");
  assertEquals(row?.evolution_message_id, "evo-9");
});

// ─── Property-based tests ────────────────────────────────────────────────

// Generators that constrain to realistic inputs without going wild on
// length (PBT shrinking is faster, behavior is identical).
const customerIdArb = fc.string({ minLength: 1, maxLength: 20 });
const stepArb = fc.constantFrom(
  "welcome",
  "aguardando_conta",
  "aguardando_doc_frente",
  "aguardando_doc_verso",
  "flow:apresentacao",
  "flow:objecao_preco",
);
const contentArb = fc.string({ minLength: 0, maxLength: 100 });
const bucketArb = fc.integer({ min: 0, max: 100_000_000 });

const inputArb: fc.Arbitrary<IdempotencyKeyInput> = fc.record({
  customerId: customerIdArb,
  step: stepArb,
  content: contentArb,
  minuteBucket: bucketArb,
});

/** **Validates: Requirements 2.7** — same input → same key (determinism). */
Deno.test("PBT: computeIdempotencyKey is deterministic", async () => {
  await fc.assert(
    fc.asyncProperty(inputArb, async (input) => {
      const a = await computeIdempotencyKey(input);
      const b = await computeIdempotencyKey(input);
      return a === b;
    }),
    { numRuns: 100 },
  );
});

/** **Validates: Requirements 2.7** — different inputs → different keys. */
Deno.test("PBT: keys differ when any field differs", async () => {
  // A pair of inputs that disagree in at least one field. We construct
  // (a, mutation) and apply mutation to flip one chosen field.
  const fieldArb = fc.constantFrom(
    "customerId" as const,
    "step" as const,
    "content" as const,
    "minuteBucket" as const,
  );

  await fc.assert(
    fc.asyncProperty(
      inputArb,
      fieldArb,
      customerIdArb,
      stepArb,
      contentArb,
      bucketArb,
      async (a, field, newCustomer, newStep, newContent, newBucket) => {
        const b: IdempotencyKeyInput = { ...a };
        switch (field) {
          case "customerId":
            if (newCustomer === a.customerId) return true; // not a real diff
            b.customerId = newCustomer;
            break;
          case "step":
            if (newStep === a.step) return true;
            b.step = newStep;
            break;
          case "content":
            if (newContent === a.content) return true;
            b.content = newContent;
            break;
          case "minuteBucket":
            if (newBucket === a.minuteBucket) return true;
            b.minuteBucket = newBucket;
            break;
        }
        const ka = await computeIdempotencyKey(a);
        const kb = await computeIdempotencyKey(b);
        return ka !== kb;
      },
    ),
    { numRuns: 100 },
  );
});

/**
 * **Validates: Requirements 2.7** — concurrent calls with the same key
 * yield exactly one acquired:true.
 *
 * We model the upsert+select dance with an in-memory Set so that even
 * "concurrent" awaits resolve against shared state. The fake atomically
 * decides insert vs conflict before yielding, mirroring Postgres
 * `ON CONFLICT DO NOTHING` semantics under serializable insert.
 */
Deno.test("PBT: N concurrent acquireOutboundSlot calls → exactly one acquired", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 32 }),
      fc.integer({ min: 2, max: 12 }),
      async (key, n) => {
        const fake = makeFakeSupabase();
        const promises = Array.from({ length: n }, () =>
          acquireOutboundSlot(fake.client, {
            idempotencyKey: key,
            customerId: "c-1",
            consultantId: "k-1",
            payloadHash: "p-1",
          }));
        const results = await Promise.all(promises);
        const acquiredCount = results.filter((r) => r.acquired).length;
        return acquiredCount === 1 && fake.rows.size === 1;
      },
    ),
    { numRuns: 30 },
  );
});

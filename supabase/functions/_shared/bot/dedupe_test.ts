// Tests for `_shared/bot/dedupe.ts` — bugfix
// `whatsapp-flow-reliability-fix`, Task 7. Covers:
//   - the first call for a (messageId, instanceName) pair returns false
//     ("not processed yet, proceed").
//   - the second call returns true ("already processed").
//   - cross-instance isolation: same messageId on a different instance is
//     treated as a brand-new message.
//   - PBT: N concurrent calls with the same pair → exactly one false.
//
// We mock the Postgres surface used by the helper:
//   .from("webhook_message_dedup").upsert(row, { onConflict, ignoreDuplicates }).select(cols)
// The fake honors the composite UNIQUE on (message_id, instance_name) and
// the `ignoreDuplicates` flag (returns [] on conflict, [row] on insert).

import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "https://esm.sh/fast-check@3.23.2";

import {
  checkAndMarkProcessed,
  checkAndMarkWebhookDedupe,
} from "./dedupe.ts";

// ─── Fake Supabase ────────────────────────────────────────────────────────

interface DedupRow {
  message_id: string;
  instance_name: string;
  processed_at: string;
}

function makeFakeSupabase() {
  // Composite key as `${message_id}|${instance_name}` so two instances with the
  // same message_id are independent rows, exactly like the migration's
  // composite UNIQUE on (message_id, instance_name).
  const rows = new Map<string, DedupRow>();
  let upsertCalls = 0;
  let nextErrorOnUpsert: { code?: string; message: string } | null = null;
  let nextThrow: Error | null = null;

  const client = {
    from(table: string) {
      if (table !== "webhook_message_dedup") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        upsert(
          row: DedupRow,
          opts: { onConflict: string; ignoreDuplicates: boolean },
        ) {
          if (
            opts.onConflict !== "message_id,instance_name" ||
            !opts.ignoreDuplicates
          ) {
            throw new Error(
              `unexpected upsert opts: ${JSON.stringify(opts)}`,
            );
          }
          return {
            select(_cols: string) {
              upsertCalls += 1;
              if (nextThrow) {
                const err = nextThrow;
                nextThrow = null;
                return Promise.reject(err);
              }
              if (nextErrorOnUpsert) {
                const err = nextErrorOnUpsert;
                nextErrorOnUpsert = null;
                return Promise.resolve({ data: null, error: err });
              }
              const key = `${row.message_id}|${row.instance_name}`;
              if (rows.has(key)) {
                // ON CONFLICT DO NOTHING + .select() → []
                return Promise.resolve({ data: [], error: null });
              }
              rows.set(key, row);
              return Promise.resolve({
                data: [{ message_id: row.message_id }],
                error: null,
              });
            },
          };
        },
      };
    },
  };

  return {
    client: client as any,
    rows,
    failNextUpsert(err: { code?: string; message: string }) {
      nextErrorOnUpsert = err;
    },
    throwNext(err: Error) {
      nextThrow = err;
    },
    metrics() {
      return { upsertCalls };
    },
  };
}

// ─── Unit tests ───────────────────────────────────────────────────────────

Deno.test("checkAndMarkProcessed: first call returns false (not yet processed)", async () => {
  const fake = makeFakeSupabase();
  const dup = await checkAndMarkProcessed(fake.client, "msg-1", "inst-A");
  assertEquals(dup, false);
  assertEquals(fake.rows.size, 1);
});

Deno.test("checkAndMarkProcessed: second call with same pair returns true (duplicate)", async () => {
  const fake = makeFakeSupabase();
  const first = await checkAndMarkProcessed(fake.client, "msg-1", "inst-A");
  const second = await checkAndMarkProcessed(fake.client, "msg-1", "inst-A");
  assertEquals(first, false);
  assertEquals(second, true);
  // Only one row stored — second insert was a no-op.
  assertEquals(fake.rows.size, 1);
});

Deno.test("checkAndMarkProcessed: same messageId on different instances → both pass (multi-tenant isolation)", async () => {
  const fake = makeFakeSupabase();
  const a = await checkAndMarkProcessed(fake.client, "msg-1", "inst-A");
  const b = await checkAndMarkProcessed(fake.client, "msg-1", "inst-B");
  assertEquals(a, false);
  assertEquals(b, false);
  assertEquals(fake.rows.size, 2);
});

Deno.test("checkAndMarkProcessed: empty messageId is fail-open", async () => {
  const fake = makeFakeSupabase();
  const r1 = await checkAndMarkProcessed(fake.client, "", "inst-A");
  const r2 = await checkAndMarkProcessed(fake.client, null, "inst-A");
  const r3 = await checkAndMarkProcessed(fake.client, undefined, "inst-A");
  assertEquals(r1, false);
  assertEquals(r2, false);
  assertEquals(r3, false);
  assertEquals(fake.metrics().upsertCalls, 0);
});

Deno.test("checkAndMarkProcessed: empty instanceName is fail-open (does not query DB)", async () => {
  const fake = makeFakeSupabase();
  const r = await checkAndMarkProcessed(fake.client, "msg-1", "");
  assertEquals(r, false);
  assertEquals(fake.metrics().upsertCalls, 0);
});

Deno.test("checkAndMarkProcessed: returns false on Postgres error (fail-open)", async () => {
  const fake = makeFakeSupabase();
  fake.failNextUpsert({ code: "57P01", message: "connection terminated" });
  const r = await checkAndMarkProcessed(fake.client, "msg-1", "inst-A");
  assertEquals(r, false);
});

Deno.test("checkAndMarkProcessed: returns false when client throws (fail-open)", async () => {
  const fake = makeFakeSupabase();
  fake.throwNext(new Error("network died"));
  const r = await checkAndMarkProcessed(fake.client, "msg-1", "inst-A");
  assertEquals(r, false);
});

Deno.test("checkAndMarkWebhookDedupe wrapper preserves DedupeResult shape", async () => {
  const fake = makeFakeSupabase();
  const first = await checkAndMarkWebhookDedupe(fake.client, "msg-9", "inst-X");
  const second = await checkAndMarkWebhookDedupe(fake.client, "msg-9", "inst-X");
  assertEquals(first, { duplicate: false, reason: null });
  assertEquals(second, { duplicate: true, reason: "hit" });
});

// ─── Property-based tests ─────────────────────────────────────────────────
//
// Concurrency model: the fake atomically resolves insert vs conflict in the
// .select() callback before yielding. JS promises are single-threaded, so
// awaiting many parallel calls against the shared Map mirrors the Postgres
// `ON CONFLICT DO NOTHING` semantics: at most one INSERT wins, the rest are
// no-ops. This is exactly the invariant we want to lock in for the helper.
//
// **Validates: Requirements 2.6, 2.34**
Deno.test("PBT: N concurrent calls with same (messageId, instanceName) → exactly one false", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 32 }),
      fc.string({ minLength: 1, maxLength: 32 }),
      fc.integer({ min: 2, max: 12 }),
      async (messageId, instanceName, n) => {
        const fake = makeFakeSupabase();
        const promises = Array.from(
          { length: n },
          () => checkAndMarkProcessed(fake.client, messageId, instanceName),
        );
        const results = await Promise.all(promises);
        // Exactly one returned false (the winner — "not processed yet"); the
        // rest returned true ("duplicate").
        const winners = results.filter((r) => r === false).length;
        const dups = results.filter((r) => r === true).length;
        return winners === 1 && dups === n - 1 && fake.rows.size === 1;
      },
    ),
    { numRuns: 30 },
  );
});

/**
 * **Validates: Requirements 2.34** — multi-tenant isolation. For arbitrary
 * pairs of messageIds and a set of distinct instances, every (message_id,
 * instance_name) combination is independent: the first call for each pair
 * succeeds, regardless of overlap on either dimension alone.
 */
Deno.test("PBT: distinct (messageId, instanceName) pairs are independent", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 16 }), {
        minLength: 1,
        maxLength: 5,
      }),
      fc.uniqueArray(fc.string({ minLength: 1, maxLength: 16 }), {
        minLength: 1,
        maxLength: 5,
      }),
      async (messageIds, instances) => {
        const fake = makeFakeSupabase();
        let totalPairs = 0;
        for (const mid of messageIds) {
          for (const inst of instances) {
            totalPairs += 1;
            const r = await checkAndMarkProcessed(fake.client, mid, inst);
            if (r !== false) return false; // first hit per pair must pass
          }
        }
        return fake.rows.size === totalPairs;
      },
    ),
    { numRuns: 25 },
  );
});

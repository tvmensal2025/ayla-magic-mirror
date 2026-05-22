// Tests for `_shared/customer-lock.ts` — bugfix
// `whatsapp-flow-reliability-fix`, task 4. Covers acquire/release happy
// path, mutual exclusion for the same customer, parallelism for distinct
// customers, immediate-timeout behavior with maxWaitMs=0, and TTL-based
// lock stealing. The PBT exercises arbitrary interleavings on a small set
// of customer ids and asserts no two `fn` invocations for the same
// customer ever overlap.
//
// Strategy: the real RPCs run in Postgres, so we mock them with an
// in-memory `Map<customerId, { token; until }>` that mirrors the
// migration's semantics exactly:
//   try_acquire_customer_lock — returns a fresh UUID when the row is
//   missing OR `until < now()`, else null.
//   release_customer_lock — deletes only when the token matches.
// Concurrent calls resolve against shared state; each call grabs the lock
// atomically (no real race because JS promises are single-threaded).

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "https://esm.sh/fast-check@3.23.2";

import { withCustomerLock } from "./customer-lock.ts";

// ─── Fake supabase client ────────────────────────────────────────────────

interface LockRow {
  token: string;
  until: number;
}

function makeFakeSupabase() {
  const locks = new Map<string, LockRow>();
  let acquireCalls = 0;
  let releaseCalls = 0;
  let nextRpcError: { code?: string; message: string } | null = null;

  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      if (nextRpcError) {
        const err = nextRpcError;
        nextRpcError = null;
        return Promise.resolve({ data: null, error: err });
      }

      if (name === "try_acquire_customer_lock") {
        acquireCalls += 1;
        const customerId = String(args.p_customer ?? "");
        const ttlMs = Number(args.p_ttl_ms ?? 0);
        if (!customerId) return Promise.resolve({ data: null, error: null });
        const now = Date.now();
        const existing = locks.get(customerId);
        if (existing && existing.until > now) {
          return Promise.resolve({ data: null, error: null });
        }
        const token = crypto.randomUUID();
        locks.set(customerId, { token, until: now + ttlMs });
        return Promise.resolve({ data: token, error: null });
      }

      if (name === "release_customer_lock") {
        releaseCalls += 1;
        const customerId = String(args.p_customer ?? "");
        const token = String(args.p_token ?? "");
        const existing = locks.get(customerId);
        if (existing && existing.token === token) {
          locks.delete(customerId);
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      }

      return Promise.resolve({
        data: null,
        error: { message: `unknown rpc ${name}` },
      });
    },
  };

  return {
    client: client as any,
    locks,
    metrics: () => ({ acquireCalls, releaseCalls }),
    failNextRpc: (err: { code?: string; message: string }) => {
      nextRpcError = err;
    },
    // Test-only: forcibly expire a lock without going through release.
    expire: (customerId: string) => {
      const r = locks.get(customerId);
      if (r) locks.set(customerId, { ...r, until: 0 });
    },
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Unit tests ──────────────────────────────────────────────────────────

Deno.test("withCustomerLock acquires, runs fn, releases", async () => {
  const fake = makeFakeSupabase();
  let ran = false;
  const r = await withCustomerLock(fake.client, "c-1", async () => {
    ran = true;
    return 42;
  });
  assertEquals(r, { acquired: true, result: 42 });
  assertEquals(ran, true);
  assertEquals(fake.locks.size, 0); // released
  const m = fake.metrics();
  assertEquals(m.acquireCalls, 1);
  assertEquals(m.releaseCalls, 1);
});

Deno.test("withCustomerLock returns timeout immediately when locked (maxWaitMs=0)", async () => {
  const fake = makeFakeSupabase();
  // Hold the lock manually.
  fake.locks.set("c-1", { token: "other", until: Date.now() + 60_000 });

  let ran = false;
  const r = await withCustomerLock(
    fake.client,
    "c-1",
    async () => {
      ran = true;
      return "should-not-run";
    },
  );
  assertEquals(r.acquired, false);
  assert(r.acquired === false && r.reason === "timeout");
  assertEquals(ran, false);
});

Deno.test("withCustomerLock waits up to maxWaitMs and acquires once previous releases", async () => {
  const fake = makeFakeSupabase();

  let firstStarted = 0;
  let firstEnded = 0;
  let secondStarted = 0;

  const first = withCustomerLock(fake.client, "c-1", async () => {
    firstStarted = Date.now();
    await sleep(120);
    firstEnded = Date.now();
    return "first";
  });

  // Yield so `first` actually grabs the lock before we start `second`.
  await sleep(10);

  const second = withCustomerLock(
    fake.client,
    "c-1",
    async () => {
      secondStarted = Date.now();
      return "second";
    },
    { maxWaitMs: 1_000, pollIntervalMs: 10 },
  );

  const [r1, r2] = await Promise.all([first, second]);
  assertEquals(r1.acquired, true);
  assertEquals(r2.acquired, true);
  // The second invocation only began after the first completed.
  assert(secondStarted >= firstEnded, `second=${secondStarted} first_end=${firstEnded}`);
  // And of course it started after the first started.
  assert(secondStarted > firstStarted);
});

Deno.test("withCustomerLock — different customers run in parallel", async () => {
  const fake = makeFakeSupabase();

  const order: string[] = [];
  const a = withCustomerLock(fake.client, "c-A", async () => {
    order.push("A:start");
    await sleep(50);
    order.push("A:end");
    return "A";
  });
  const b = withCustomerLock(fake.client, "c-B", async () => {
    order.push("B:start");
    await sleep(50);
    order.push("B:end");
    return "B";
  });

  const [ra, rb] = await Promise.all([a, b]);
  assertEquals(ra.acquired, true);
  assertEquals(rb.acquired, true);
  // Both started before either ended → parallel execution.
  const aStartIdx = order.indexOf("A:start");
  const bStartIdx = order.indexOf("B:start");
  const aEndIdx = order.indexOf("A:end");
  const bEndIdx = order.indexOf("B:end");
  assert(aStartIdx < bEndIdx);
  assert(bStartIdx < aEndIdx);
});

Deno.test("withCustomerLock can steal an expired lock", async () => {
  const fake = makeFakeSupabase();
  // Past-due holder.
  fake.locks.set("c-1", { token: "stale", until: Date.now() - 1 });

  const r = await withCustomerLock(fake.client, "c-1", async () => 7);
  assertEquals(r, { acquired: true, result: 7 });
});

Deno.test("withCustomerLock surfaces error when fn throws and releases the lock", async () => {
  const fake = makeFakeSupabase();
  const r = await withCustomerLock(fake.client, "c-1", async () => {
    throw new Error("kaboom");
  });
  assertEquals(r.acquired, false);
  assert(r.acquired === false && r.reason === "error");
  assertEquals(fake.locks.size, 0);
});

Deno.test("withCustomerLock returns error when acquire RPC fails", async () => {
  const fake = makeFakeSupabase();
  fake.failNextRpc({ code: "57P01", message: "connection terminated" });
  const r = await withCustomerLock(fake.client, "c-1", async () => "noop");
  assertEquals(r.acquired, false);
  assert(r.acquired === false && r.reason === "error");
});

// ─── Property-based test ─────────────────────────────────────────────────

/**
 * **Validates: Requirements 2.11, 2.37**
 *
 * For an arbitrary schedule of concurrent withCustomerLock invocations on
 * a small set of customer ids, no two `fn` bodies for the same customer
 * are ever active at the same time. Different customers may overlap
 * freely. The invariant is checked by an in-flight counter per customer
 * (asserts that the counter never exceeds 1 inside fn).
 */
Deno.test("PBT: concurrent ops on the same customer are serialized; distinct customers run in parallel", async () => {
  await fc.assert(
    fc.asyncProperty(
      // 6..18 ops over a pool of 1..3 customers, each with a tiny work duration.
      fc.array(
        fc.record({
          customerId: fc.constantFrom("u1", "u2", "u3"),
          workMs: fc.integer({ min: 0, max: 6 }),
          startDelayMs: fc.integer({ min: 0, max: 6 }),
        }),
        { minLength: 6, maxLength: 18 },
      ),
      async (ops) => {
        const fake = makeFakeSupabase();
        const inFlight = new Map<string, number>();
        let observedParallelDifferent = false;

        const allInFlightKeys = () =>
          Array.from(inFlight.entries())
            .filter(([, n]) => n > 0)
            .map(([k]) => k);

        const promises = ops.map((op) =>
          (async () => {
            await sleep(op.startDelayMs);
            const r = await withCustomerLock(
              fake.client,
              op.customerId,
              async () => {
                const cur = (inFlight.get(op.customerId) ?? 0) + 1;
                inFlight.set(op.customerId, cur);
                // Mutual-exclusion invariant for this customer.
                if (cur > 1) {
                  throw new Error(
                    `overlap on ${op.customerId} (count=${cur})`,
                  );
                }
                // Detect parallelism across distinct customers.
                if (allInFlightKeys().length > 1) {
                  observedParallelDifferent = true;
                }
                await sleep(op.workMs);
                inFlight.set(
                  op.customerId,
                  (inFlight.get(op.customerId) ?? 1) - 1,
                );
                return "ok";
              },
              { maxWaitMs: 2_000, pollIntervalMs: 2 },
            );
            return r;
          })()
        );

        const results = await Promise.all(promises);
        // Every op completed successfully (none timed out — maxWaitMs is
        // generous relative to total work).
        assertEquals(results.every((r) => r.acquired), true);
        // No leftover lock rows.
        assertEquals(fake.locks.size, 0);
        // (Optional but informative.) When the schedule actually had work
        // for ≥ 2 distinct customers in flight at once, we detect it.
        // We do not require it on every run since some schedules are
        // serial by chance.
        void observedParallelDifferent;
        return true;
      },
    ),
    { numRuns: 30 },
  );
});

/**
 * Unit tests for the **pure** `resolveEngineDecision` function.
 *
 * Spec: `.kiro/specs/bot-engine-channel-unification/design.md` §3.
 * Task: 5 (Fase 1 — adapter de compatibilidade).
 *
 * Esta task cobre apenas a função pura. O teste do
 * `resolveEngineDecisionWithCache` (com leitura do Supabase, TTL 30s,
 * fallback de 5 min) entra na Task 29 e mora no mesmo arquivo, sob
 * outras `Deno.test(...)`.
 *
 * Validates: Requirements 1.6, 8.1.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type EngineDecision, resolveEngineDecision } from "../decision.ts";

Deno.test(
  "resolveEngineDecision: prodMode=true forces engine_unified, " +
    "production_override=true when individualMode is 'legacy'",
  () => {
    const decision = resolveEngineDecision({
      prodMode: true,
      individualMode: "legacy",
    });
    const expected: EngineDecision = {
      kind: "engine_unified",
      production_override: true,
    };
    assertEquals(decision, expected);
  },
);

Deno.test(
  "resolveEngineDecision: prodMode=true forces engine_unified, " +
    "production_override=false when individualMode is 'on'",
  () => {
    const decision = resolveEngineDecision({
      prodMode: true,
      individualMode: "on",
    });
    const expected: EngineDecision = {
      kind: "engine_unified",
      production_override: false,
    };
    assertEquals(decision, expected);
  },
);

Deno.test(
  "resolveEngineDecision: prodMode=false + individualMode='dark' → shadow",
  () => {
    const decision = resolveEngineDecision({
      prodMode: false,
      individualMode: "dark",
    });
    const expected: EngineDecision = { kind: "shadow" };
    assertEquals(decision, expected);
  },
);

Deno.test(
  "resolveEngineDecision: prodMode=false + individualMode='on' → engine_unified",
  () => {
    const decision = resolveEngineDecision({
      prodMode: false,
      individualMode: "on",
    });
    const expected: EngineDecision = {
      kind: "engine_unified",
      production_override: false,
    };
    assertEquals(decision, expected);
  },
);

Deno.test(
  "resolveEngineDecision: prodMode=false + individualMode='canary' → engine_unified",
  () => {
    const decision = resolveEngineDecision({
      prodMode: false,
      individualMode: "canary",
    });
    const expected: EngineDecision = {
      kind: "engine_unified",
      production_override: false,
    };
    assertEquals(decision, expected);
  },
);

Deno.test(
  "resolveEngineDecision: prodMode=false + individualMode='legacy' → legacy",
  () => {
    const decision = resolveEngineDecision({
      prodMode: false,
      individualMode: "legacy",
    });
    const expected: EngineDecision = { kind: "legacy" };
    assertEquals(decision, expected);
  },
);

Deno.test(
  "resolveEngineDecision: prodMode=false + out-of-domain individualMode " +
    "→ legacy (handled elsewhere — Requisito 8.10)",
  () => {
    // Valores fora do domínio são tratados como legacy. O log
    // `engine_killswitch_invalid_value` + handoff alert são
    // responsabilidade do webhook entry, não desta função pura.
    const decision = resolveEngineDecision({
      prodMode: false,
      individualMode: "experimental",
    });
    const expected: EngineDecision = { kind: "legacy" };
    assertEquals(decision, expected);
  },
);


// ─── Cache layer tests (Task 29) ────────────────────────────────────────
//
// These tests cover `readKillSwitch`, `readProdMode`, and
// `resolveEngineDecisionWithCache` — the I/O glue added in Task 29.
//
// Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10.

import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clearDecisionCache,
  readKillSwitch,
  readProdMode,
  resolveEngineDecisionWithCache,
} from "../decision.ts";

// ─── Test double for SupabaseClient ─────────────────────────────────────
//
// Models the subset of PostgREST surface used by `decision.ts`:
//
//   .from("consultants")
//     .select("bot_engine_mode")
//     .eq("id", consultantId)
//     .maybeSingle()
//
//   .from("app_settings")
//     .select("bot_engine_production_mode")
//     .eq("id", "global")
//     .maybeSingle()
//
//   .from("engine_logs")
//     .insert(row)

interface FakeSupabaseOptions {
  /** `consultants.bot_engine_mode` por id. Use `null` para simular row ausente. */
  consultants?: Map<string, string | null>;
  /** `app_settings.bot_engine_production_mode` (singleton). */
  prodMode?: boolean | null;
  /** Quando true, `consultants` retorna erro de leitura. */
  consultantsError?: { message: string } | null;
  /** Quando true, `app_settings` retorna erro de leitura. */
  prodModeError?: { message: string } | null;
}

interface InsertedLog {
  table: string;
  row: Record<string, unknown>;
}

function makeFakeSupabase(opts: FakeSupabaseOptions) {
  const inserts: InsertedLog[] = [];
  const reads: { table: string; eq: { col: string; val: string } }[] = [];

  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              reads.push({ table, eq: { col, val } });
              return {
                maybeSingle: async () => {
                  await Promise.resolve();
                  if (table === "consultants") {
                    if (opts.consultantsError) {
                      return { data: null, error: opts.consultantsError };
                    }
                    const v = opts.consultants?.get(val);
                    if (v === undefined) {
                      // Row ausente.
                      return { data: null, error: null };
                    }
                    return {
                      data: { bot_engine_mode: v },
                      error: null,
                    };
                  }
                  if (table === "app_settings") {
                    if (opts.prodModeError) {
                      return { data: null, error: opts.prodModeError };
                    }
                    if (opts.prodMode === undefined || opts.prodMode === null) {
                      return { data: null, error: null };
                    }
                    return {
                      data: { bot_engine_production_mode: opts.prodMode },
                      error: null,
                    };
                  }
                  throw new Error(`unexpected select on table ${table}`);
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          if (table !== "engine_logs") {
            throw new Error(`unexpected insert on table ${table}`);
          }
          inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  // deno-lint-ignore no-explicit-any
  return { client: client as any, inserts, reads };
}

// ─── Cases (i)/(ii)/(iii) from the task acceptance criteria ────────────

Deno.test(
  "resolveEngineDecisionWithCache: prodMode=true → engine_unified " +
    "regardless of individualMode (Requisito 8.4)",
  async () => {
    clearDecisionCache();
    // Mesmo consultor, mesmo bot_engine_mode='legacy' → ainda assim
    // engine_unified com production_override=true.
    const { client } = makeFakeSupabase({
      prodMode: true,
      consultants: new Map([["c-1", "legacy"]]),
    });
    const decision = await resolveEngineDecisionWithCache(client, "c-1");
    assertEquals(decision, {
      kind: "engine_unified",
      production_override: true,
    });

    clearDecisionCache();
    // Outro modo individual (dark) — production_override=false porque
    // individualMode !== 'legacy'.
    const { client: client2 } = makeFakeSupabase({
      prodMode: true,
      consultants: new Map([["c-2", "dark"]]),
    });
    const d2 = await resolveEngineDecisionWithCache(client2, "c-2");
    assertEquals(d2, {
      kind: "engine_unified",
      production_override: false,
    });
  },
);

Deno.test(
  "resolveEngineDecisionWithCache: prodMode=false + individualMode='dark' " +
    "→ shadow (Requisitos 8.5, 8.6)",
  async () => {
    clearDecisionCache();
    const { client } = makeFakeSupabase({
      prodMode: false,
      consultants: new Map([["c-1", "dark"]]),
    });
    const decision = await resolveEngineDecisionWithCache(client, "c-1");
    assertEquals(decision, { kind: "shadow" });
  },
);

Deno.test(
  "resolveEngineDecisionWithCache: out-of-domain individualMode → legacy " +
    "+ engine_killswitch_invalid_value log + handoff alert callback " +
    "(Requisito 8.10)",
  async () => {
    clearDecisionCache();
    const { client, inserts } = makeFakeSupabase({
      prodMode: false,
      consultants: new Map([["c-1", "experimental"]]),
    });
    const handoffCalls: Array<{
      consultantId: string;
      reason: string;
      observedValue: string;
    }> = [];
    const decision = await resolveEngineDecisionWithCache(client, "c-1", {
      onInvalidMode: (input) => {
        handoffCalls.push(input);
      },
    });
    assertEquals(decision, { kind: "legacy" });

    // Log row foi inserido em engine_logs com kind correto.
    const logKinds = inserts.map((i) => i.row.kind);
    assert(
      logKinds.includes("engine_killswitch_invalid_value"),
      `expected engine_killswitch_invalid_value in logs, got ${
        JSON.stringify(logKinds)
      }`,
    );
    const log = inserts.find(
      (i) => i.row.kind === "engine_killswitch_invalid_value",
    );
    assert(log, "log row missing");
    const payload = log!.row.payload as Record<string, unknown>;
    assertEquals(payload.consultant_id, "c-1");
    assertEquals(payload.observed_value, "experimental");

    // Handoff alert callback recebeu a invocação correta.
    assertEquals(handoffCalls.length, 1);
    assertEquals(handoffCalls[0].consultantId, "c-1");
    assertEquals(handoffCalls[0].reason, "engine_killswitch_invalid_value");
    assertEquals(handoffCalls[0].observedValue, "experimental");
  },
);

// ─── Cache TTL behaviour ───────────────────────────────────────────────

Deno.test(
  "readKillSwitch: caches result within TTL — second call does not hit DB " +
    "(Requisito 8.3)",
  async () => {
    clearDecisionCache();
    const { client, reads } = makeFakeSupabase({
      consultants: new Map([["c-1", "canary"]]),
    });
    const a = await readKillSwitch(client, "c-1");
    const b = await readKillSwitch(client, "c-1");
    assertEquals(a, "canary");
    assertEquals(b, "canary");
    // Apenas UMA leitura no `consultants`; segunda chamada veio do cache.
    const consultantReads = reads.filter((r) => r.table === "consultants");
    assertEquals(consultantReads.length, 1);
  },
);

Deno.test(
  "readProdMode: caches singleton within TTL (Requisito 8.3)",
  async () => {
    clearDecisionCache();
    const { client, reads } = makeFakeSupabase({ prodMode: true });
    const a = await readProdMode(client);
    const b = await readProdMode(client);
    assertEquals(a, true);
    assertEquals(b, true);
    const settingsReads = reads.filter((r) => r.table === "app_settings");
    assertEquals(settingsReads.length, 1);
  },
);

// ─── Stale fallback on read error ──────────────────────────────────────

Deno.test(
  "readKillSwitch: on read error WITHOUT cache → legacy + " +
    "engine_killswitch_read_failed log (Requisito 8.9)",
  async () => {
    clearDecisionCache();
    const { client, inserts } = makeFakeSupabase({
      consultantsError: { message: "network down" },
    });
    const value = await readKillSwitch(client, "c-1");
    assertEquals(value, "legacy");
    const failedLog = inserts.find(
      (i) => i.row.kind === "engine_killswitch_read_failed",
    );
    assert(
      failedLog,
      "expected engine_killswitch_read_failed when no cache available",
    );
    const failedPayload = failedLog!.row.payload as Record<string, unknown>;
    assertEquals(failedPayload.source, "readKillSwitch");
    assertStringIncludes(String(failedPayload.error), "network down");
  },
);

Deno.test(
  "readKillSwitch: failed read does NOT poison the cache — next " +
    "successful read replaces it cleanly",
  async () => {
    clearDecisionCache();
    // Primeira leitura falha → não cacheia.
    const erroring = makeFakeSupabase({
      consultantsError: { message: "boom" },
    });
    const first = await readKillSwitch(erroring.client, "c-1");
    assertEquals(first, "legacy");

    // Próxima leitura: outro client, sem erro → deve consultar DB
    // (porque a falha não cacheou) e devolver o valor correto.
    const ok = makeFakeSupabase({
      consultants: new Map([["c-1", "on"]]),
    });
    const second = await readKillSwitch(ok.client, "c-1");
    assertEquals(second, "on");
    const okReads = ok.reads.filter((r) => r.table === "consultants");
    assertEquals(okReads.length, 1);
  },
);

Deno.test(
  "readProdMode: on read error without cache → false + " +
    "engine_killswitch_read_failed log (Requisito 8.9)",
  async () => {
    clearDecisionCache();
    const { client, inserts } = makeFakeSupabase({
      prodModeError: { message: "timeout" },
    });
    const value = await readProdMode(client);
    assertEquals(value, false);
    const failedLog = inserts.find(
      (i) => i.row.kind === "engine_killswitch_read_failed",
    );
    assert(failedLog, "expected engine_killswitch_read_failed log");
    const payload = failedLog!.row.payload as Record<string, unknown>;
    assertEquals(payload.source, "readProdMode");
  },
);

// ─── Default-safe paths ────────────────────────────────────────────────

Deno.test(
  "readKillSwitch: row absent → legacy (Requisito 8.5 default)",
  async () => {
    clearDecisionCache();
    const { client } = makeFakeSupabase({
      // c-missing não está no map → maybeSingle retorna { data: null }.
      consultants: new Map(),
    });
    const value = await readKillSwitch(client, "c-missing");
    assertEquals(value, "legacy");
  },
);

Deno.test(
  "readKillSwitch: empty consultantId → legacy without DB read",
  async () => {
    clearDecisionCache();
    const { client, reads } = makeFakeSupabase({
      consultants: new Map([["c-1", "on"]]),
    });
    const value = await readKillSwitch(client, "");
    assertEquals(value, "legacy");
    assertEquals(reads.length, 0);
  },
);

Deno.test(
  "readProdMode: row absent (singleton not seeded) → false",
  async () => {
    clearDecisionCache();
    const { client } = makeFakeSupabase({ prodMode: null });
    const value = await readProdMode(client);
    assertEquals(value, false);
  },
);

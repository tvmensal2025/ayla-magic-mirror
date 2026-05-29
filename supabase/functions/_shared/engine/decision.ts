/**
 * Engine decision (per-turn).
 *
 * Spec: `.kiro/specs/bot-engine-channel-unification/design.md` §3
 * (`resolveEngineDecision`).
 * Tasks: 5 (Fase 1 — função pura + compat shim), 29 (Fase 4 — cache +
 * `resolveEngineDecisionWithCache` lendo `consultants.bot_engine_mode`
 * e `app_settings.bot_engine_production_mode`).
 *
 * Este módulo expõe duas superfícies:
 *
 *   1. **Pura** (sem I/O, sem cache, sem `Date.now`): `resolveEngineDecision`,
 *      `IndividualMode`, `EngineDecision`. Validada por
 *      `__tests__/decision_test.ts` e por `__tests__/purity_lint_test.ts`
 *      via os tipos exportados.
 *
 *   2. **I/O glue** (Task 29): `readKillSwitch`, `readProdMode`,
 *      `resolveEngineDecisionWithCache`, `clearDecisionCache`. Lêem
 *      Supabase com cache TTL de 30s (fresh) + fallback de 5min
 *      (stale) em falha, conforme Requisitos 8.3, 8.4, 8.5, 8.6, 8.7,
 *      8.9, 8.10. Esta seção do arquivo é I/O — `decision.ts` está
 *      listado em `IMPURE_GLUE` no purity lint.
 *
 * Validates: Requirements 1.6, 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isEngineV3Enabled as legacyIsEngineV3Enabled } from "./router.ts";

/**
 * Modos por consultor (Kill_Switch — Requisito 8.1). Strings fora deste
 * domínio são tratadas como `legacy` em `resolveEngineDecision`; o
 * webhook entry é responsável por emitir o log + handoff alert
 * (Requisito 8.10).
 */
export type IndividualMode = "legacy" | "dark" | "canary" | "on";

const VALID_INDIVIDUAL_MODES: ReadonlySet<string> = new Set([
  "legacy",
  "dark",
  "canary",
  "on",
]);

/**
 * Decisão por turno. Match exato com o design §3 + Data Models:
 *
 * - `engine_unified` → motor unificado responde; `production_override`
 *   marca quando o modo individual é `legacy` mas o flag global de
 *   produção forçou a unificação.
 * - `shadow` → motor unificado roda em paralelo (dark); o canal legado
 *   continua respondendo ao lead.
 * - `legacy` → caminho legado responde; motor unificado não roda.
 */
export type EngineDecision =
  | { kind: "engine_unified"; production_override: boolean }
  | { kind: "shadow" }
  | { kind: "legacy" };

/**
 * Função pura. Mesmas saídas para mesmas entradas, sem leitura de
 * Supabase, sem `Date.now`, sem `fetch`. O cache TTL fica em
 * `resolveEngineDecisionWithCache` (Task 29).
 */
export function resolveEngineDecision(input: {
  prodMode: boolean;
  individualMode: IndividualMode | string;
}): EngineDecision {
  if (input.prodMode === true) {
    return {
      kind: "engine_unified",
      production_override: input.individualMode === "legacy",
    };
  }
  switch (input.individualMode) {
    case "on":
    case "canary":
      return { kind: "engine_unified", production_override: false };
    case "dark":
      return { kind: "shadow" };
    case "legacy":
      return { kind: "legacy" };
    default:
      // Valor fora do domínio (Requisito 8.10) — `readKillSwitch`
      // detecta esse caso ANTES desta função: emite log + handoff
      // alert e nunca chama esta função com valor inválido. Mantemos
      // o ramo seguro (`legacy`) para a função pura permanecer total.
      return { kind: "legacy" };
  }
}

// ─── I/O glue: leitura cacheada do Kill_Switch + Production_Mode ────────
//
// Política de cache (design §3 + Requisitos 8.3, 8.5, 8.7, 8.9):
//
//   • TTL "fresh" — 30s. Enquanto a entrada está fresh, retornamos sem
//     consultar Supabase. UI SuperAdmin não invalida explicitamente; a
//     propagação acontece pelo TTL natural (até 60s no pior caso, cf.
//     Requisito 8.8).
//   • TTL "stale" — 5min. Em falha de leitura (timeout, erro de rede),
//     se o último valor cacheado ainda está dentro do TTL estendido,
//     reusamos com log `engine_killswitch_read_failed_using_cache`
//     (Requisito 8.9). Quando não há cache válido, retornamos default
//     seguro (`legacy` / `false`) com log `engine_killswitch_read_failed`.
//   • Valor fora do domínio (Requisito 8.10) — retornamos `legacy`,
//     emitimos log `engine_killswitch_invalid_value` e disparamos
//     handoff alert via callback opcional. Cacheamos a coerção como
//     `legacy` com TTL fresh para evitar spam de logs/alerts entre
//     turnos enquanto o SuperAdmin não corrige; a deduplicação de
//     alerts continua sendo responsabilidade do dispatcher.

/** TTL em que o valor cacheado é servido sem nova leitura (Requisito 8.3). */
const TTL_FRESH_MS = 30_000;
/** TTL estendido para reuso de valor cacheado em falha de leitura (Requisito 8.9). */
const TTL_STALE_MS = 5 * 60_000;

interface CacheEntry<T> {
  value: T;
  /** `Date.now()` a partir do qual o entry deixa de ser fresh. */
  freshUntil: number;
  /** `Date.now()` a partir do qual nem mesmo o fallback estendido aceita o entry. */
  staleUntil: number;
}

/** Map em escopo de módulo (Requisito 8.3 — cache em memória de processo). */
const killSwitchCache = new Map<string, CacheEntry<IndividualMode>>();
/** Singleton de processo para `bot_engine_production_mode`. */
let prodModeCache: CacheEntry<boolean> | null = null;

/**
 * Test/admin helper. Limpa as duas caches; usado por
 * `__tests__/decision_test.ts` para isolar cenários.
 */
export function clearDecisionCache(): void {
  killSwitchCache.clear();
  prodModeCache = null;
}

/**
 * Callback opcional para inserir uma linha em `bot_handoff_alerts`
 * quando `consultants.bot_engine_mode` retorna um valor fora do
 * domínio (Requisito 8.10). Webhook entry/dispatcher fornece esta
 * implementação; mantemos como hook para `decision.ts` continuar
 * agnóstico do shape de `bot_handoff_alerts`.
 */
export type HandoffAlertCallback = (input: {
  consultantId: string;
  reason: string;
  observedValue: string;
}) => Promise<void> | void;

export interface ReadKillSwitchOptions {
  /**
   * Disparado uma vez por leitura inválida — não por turno (a coerção
   * fica cacheada com TTL fresh). O dispatcher é responsável por
   * deduplicar caso a mesma reason já tenha alert ativo.
   */
  onInvalidMode?: HandoffAlertCallback;
}

/**
 * Best-effort log writer. Mantemos como helper interno para evitar que
 * uma falha de leitura cause loops de erro: os erros são engolidos com
 * `console.warn` (mesma política de `webhook-entry.ts`).
 */
async function logEngineEvent(
  supabase: SupabaseClient,
  row: {
    kind: string;
    payload: Record<string, unknown>;
    customer_id?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("engine_logs").insert({
      at: new Date().toISOString(),
      kind: row.kind,
      customer_id: row.customer_id ?? null,
      flow_id: null,
      step_id: null,
      payload: row.payload,
    });
  } catch (err) {
    console.warn(
      "[engine/decision] failed to write engine_logs row",
      row.kind,
      (err as { message?: string })?.message ?? String(err),
    );
  }
}

/**
 * Lê `consultants.bot_engine_mode` para o consultor dado, aplicando a
 * política de cache descrita acima.
 *
 * Validates: Requirements 8.1, 8.3, 8.5, 8.6, 8.7, 8.9, 8.10.
 */
export async function readKillSwitch(
  supabase: SupabaseClient,
  consultantId: string,
  options: ReadKillSwitchOptions = {},
): Promise<IndividualMode> {
  if (!consultantId) {
    // Sem consultor identificado, não conseguimos resolver o switch:
    // o caminho seguro é legacy (Requisito 8.5 — default conservador).
    return "legacy";
  }

  const now = Date.now();
  const cached = killSwitchCache.get(consultantId);
  if (cached && cached.freshUntil > now) {
    return cached.value;
  }

  let data: { bot_engine_mode?: unknown } | null = null;
  let readError: { message?: string } | null = null;
  try {
    const result = await supabase
      .from("consultants")
      .select("bot_engine_mode")
      .eq("id", consultantId)
      .maybeSingle();
    data = (result?.data as { bot_engine_mode?: unknown } | null) ?? null;
    readError = (result?.error as { message?: string } | null) ?? null;
  } catch (err) {
    readError = { message: (err as { message?: string })?.message ?? String(err) };
  }

  if (readError || !data) {
    // Falha de leitura — Requisito 8.9. Reutiliza cache estendido
    // quando ainda dentro do TTL stale; senão default seguro.
    if (cached && cached.staleUntil > now) {
      void logEngineEvent(supabase, {
        kind: "engine_killswitch_read_failed_using_cache",
        payload: {
          consultant_id: consultantId,
          source: "readKillSwitch",
          error: readError?.message ?? "no_row",
          cached_value: cached.value,
        },
      });
      return cached.value;
    }
    void logEngineEvent(supabase, {
      kind: "engine_killswitch_read_failed",
      payload: {
        consultant_id: consultantId,
        source: "readKillSwitch",
        error: readError?.message ?? "no_row",
      },
    });
    // Não cacheamos o default — queremos retentar na próxima chamada.
    return "legacy";
  }

  const observed = data.bot_engine_mode;
  if (typeof observed !== "string" || !VALID_INDIVIDUAL_MODES.has(observed)) {
    // Requisito 8.10 — coerção para legacy + log + handoff alert.
    const observedValue = observed == null ? "<null>" : String(observed);
    void logEngineEvent(supabase, {
      kind: "engine_killswitch_invalid_value",
      payload: {
        consultant_id: consultantId,
        observed_value: observedValue,
      },
    });
    if (options.onInvalidMode) {
      try {
        await options.onInvalidMode({
          consultantId,
          reason: "engine_killswitch_invalid_value",
          observedValue,
        });
      } catch (err) {
        console.warn(
          "[engine/decision] handoff alert callback failed",
          (err as { message?: string })?.message ?? String(err),
        );
      }
    }
    // Cacheia coerção como legacy para evitar spam de logs entre turnos.
    killSwitchCache.set(consultantId, {
      value: "legacy",
      freshUntil: now + TTL_FRESH_MS,
      staleUntil: now + TTL_STALE_MS,
    });
    return "legacy";
  }

  const value = observed as IndividualMode;
  killSwitchCache.set(consultantId, {
    value,
    freshUntil: now + TTL_FRESH_MS,
    staleUntil: now + TTL_STALE_MS,
  });
  return value;
}

/**
 * Lê `app_settings.bot_engine_production_mode` (singleton em `id='global'`)
 * com a mesma política de cache de `readKillSwitch`.
 *
 * Validates: Requirements 8.2, 8.3, 8.4, 8.9.
 */
export async function readProdMode(supabase: SupabaseClient): Promise<boolean> {
  const now = Date.now();
  if (prodModeCache && prodModeCache.freshUntil > now) {
    return prodModeCache.value;
  }

  let data: { bot_engine_production_mode?: unknown } | null = null;
  let readError: { message?: string } | null = null;
  try {
    const result = await supabase
      .from("app_settings")
      .select("bot_engine_production_mode")
      .eq("id", "global")
      .maybeSingle();
    data =
      (result?.data as { bot_engine_production_mode?: unknown } | null) ?? null;
    readError = (result?.error as { message?: string } | null) ?? null;
  } catch (err) {
    readError = { message: (err as { message?: string })?.message ?? String(err) };
  }

  if (readError) {
    if (prodModeCache && prodModeCache.staleUntil > now) {
      void logEngineEvent(supabase, {
        kind: "engine_killswitch_read_failed_using_cache",
        payload: {
          source: "readProdMode",
          error: readError.message ?? "unknown",
          cached_value: prodModeCache.value,
        },
      });
      return prodModeCache.value;
    }
    void logEngineEvent(supabase, {
      kind: "engine_killswitch_read_failed",
      payload: {
        source: "readProdMode",
        error: readError.message ?? "unknown",
      },
    });
    // Default seguro = false (Modo_Produção desligado).
    return false;
  }

  // Linha ausente é tratada como `false` (default da migração).
  const value = data ? !!data.bot_engine_production_mode : false;
  prodModeCache = {
    value,
    freshUntil: now + TTL_FRESH_MS,
    staleUntil: now + TTL_STALE_MS,
  };
  return value;
}

/**
 * Combina `readProdMode` + `readKillSwitch` e delega à função pura
 * `resolveEngineDecision`. Esta é a única entrada que webhook entries
 * (Whapi/Evolution) devem usar para decidir entre legacy / shadow /
 * engine_unified — todos os outros call sites são `@deprecated`.
 *
 * Validates: Requirements 1.6, 8.3, 8.4, 8.5, 8.6, 8.7.
 */
export async function resolveEngineDecisionWithCache(
  supabase: SupabaseClient,
  consultantId: string,
  options: ReadKillSwitchOptions = {},
): Promise<EngineDecision> {
  const [prodMode, individualMode] = await Promise.all([
    readProdMode(supabase),
    readKillSwitch(supabase, consultantId, options),
  ]);
  return resolveEngineDecision({ prodMode, individualMode });
}

/**
 * Compat shim — Fase 1.
 *
 * Reexporta `isEngineV3Enabled` delegando para a implementação atual em
 * `router.ts`, que lê `consultants.use_engine_v3` + `flow_engine_v3`.
 * Preserva a semântica vigente da rota `dark` (que hoje só roda em
 * paralelo). A Task 30 substitui este corpo por
 * `resolveEngineDecisionWithCache(...)` lendo `bot_engine_mode` +
 * `bot_engine_production_mode`.
 *
 * @deprecated Use `resolveEngineDecisionWithCache`. Este wrapper existe
 * apenas para manter os call sites atuais funcionando durante o
 * renomeio sem mudança de comportamento da Fase 1.
 */
export function isEngineV3Enabled(
  supabase: SupabaseClient,
  consultantId: string,
): Promise<boolean> {
  return legacyIsEngineV3Enabled(supabase, consultantId);
}

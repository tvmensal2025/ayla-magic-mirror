/**
 * Engine v3 router.
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §1.2 (router
 * component) + §2.9 (rollout plan).
 * Task: 28.
 *
 * Unified flag read (C1): V3 assume o turno quando **qualquer um** for verdadeiro:
 *   - `consultants.use_engine_v3` (boolean legado)  = true
 *   - `consultants.flow_engine_v3` (enum)           = 'on'
 *
 * Assim o painel SuperAdmin "Rollout V3" que promove `flow_engine_v3 → 'on'`
 * passa a refletir no webhook sem precisar setar dois campos em sincronia.
 * Cache de 30s (via `getFlowEngineV3`) evita 1 round-trip extra por turno.
 *
 * Validates: Requirements 1.1, 1.2, 11.1, 11.2, 11.3, 11.4, 11.5.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFlowEngineV3 } from "../feature-flag.ts";

// B2: cache in-process do boolean legado `use_engine_v3` (30s).
// Evita 1 SELECT extra por turno de webhook quando o enum não está 'on'.
// TTL alinhado ao cache do enum em feature-flag.ts.
const USE_ENGINE_V3_CACHE_TTL_MS = 30_000;
interface BoolCacheEntry { value: boolean; expiresAt: number }
const useEngineV3Cache = new Map<string, BoolCacheEntry>();

/** Test/admin helper: limpa o cache local do boolean legado. */
export function clearUseEngineV3Cache(): void {
  useEngineV3Cache.clear();
}

/**
 * Combina `use_engine_v3` (bool) e `flow_engine_v3` (enum). Retorna
 * `false` em qualquer falha de leitura — legado é o default seguro.
 */
export async function isEngineV3Enabled(
  supabase: SupabaseClient,
  consultantId: string,
): Promise<boolean> {
  if (!consultantId) return false;
  // 1. Enum (cacheado 30s no helper). Quando 'on', V3 assume.
  try {
    const flag = await getFlowEngineV3(supabase, consultantId);
    if (flag === "on") return true;
  } catch (_) { /* fallthrough para boolean */ }
  // 2. Boolean legado — override manual / consultor migrado fora do enum.
  const now = Date.now();
  const cached = useEngineV3Cache.get(consultantId);
  if (cached && cached.expiresAt > now) return cached.value;
  let resolved = false;
  try {
    const { data, error } = await supabase
      .from("consultants")
      .select("use_engine_v3")
      .eq("id", consultantId)
      .maybeSingle();
    if (!error && data) {
      resolved = (data as { use_engine_v3?: boolean }).use_engine_v3 === true;
    }
  } catch (_) {
    resolved = false;
  }
  useEngineV3Cache.set(consultantId, {
    value: resolved,
    expiresAt: now + USE_ENGINE_V3_CACHE_TTL_MS,
  });
  return resolved;
}

/**
 * Sentinel set to `true` only after Phase 4 destructive cleanup deletes
 * the legacy code paths. Until then, the webhook entry must keep the
 * fallback branch alive when the flag is `false`. Flipped to `true` in
 * Task 39 (DESTRUCTIVE).
 */
export const LEGACY_BRANCH_REMOVED = false as const;

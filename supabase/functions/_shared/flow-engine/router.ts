/**
 * Engine v3 router.
 *
 * Spec: `.kiro/specs/flow-engine-v3-rewrite/design.md` §1.2 (router
 * component) + §2.9 (rollout plan).
 * Task: 28.
 *
 * Reads `consultants.use_engine_v3` per request and dispatches to either
 * the v3 runner or the legacy bot-flow handlers. After Phase 4 (30 days
 * stable), this router and the legacy branch are deleted, leaving only
 * v3 wired directly in the webhook entry.
 *
 * Validates: Requirements 1.1, 1.2, 11.1, 11.2, 11.3, 11.4, 11.5.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Reads `consultants.use_engine_v3` fresh on every call (no cache).
 * Returns `false` on any error so a flag-read failure NEVER routes
 * traffic into v3 — legacy is the safe default during rollout.
 */
export async function isEngineV3Enabled(
  supabase: SupabaseClient,
  consultantId: string,
): Promise<boolean> {
  if (!consultantId) return false;
  try {
    const { data, error } = await supabase
      .from("consultants")
      .select("use_engine_v3")
      .eq("id", consultantId)
      .maybeSingle();
    if (error || !data) return false;
    return (data as { use_engine_v3?: boolean }).use_engine_v3 === true;
  } catch (_) {
    return false;
  }
}

/**
 * Sentinel set to `true` only after Phase 4 destructive cleanup deletes
 * the legacy code paths. Until then, the webhook entry must keep the
 * fallback branch alive when the flag is `false`. Flipped to `true` in
 * Task 39 (DESTRUCTIVE).
 */
export const LEGACY_BRANCH_REMOVED = false as const;

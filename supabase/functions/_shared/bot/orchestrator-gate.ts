// Sprint 3 — Gate central do orchestrator.
//
// Antes de qualquer chamada para `ai-sales-agent` que vá DIRIGIR o fluxo
// (mode: "reply"), checamos se o consultor tem um `bot_flows.is_active=true`.
// Se tiver, o motor custom (`runConversationalFlow`) é a fonte única de
// verdade — qualquer atalho hardcoded (ex.: deterministic_first_audio)
// precisa ser pulado para respeitar `bot_flow_steps.position`.
//
// Modos utilitários (`answer_only`, `rescue`, `followup`, `summarize`) NÃO
// dirigem step e continuam passando livremente.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, { value: boolean; expiresAt: number }>();

/** Modos que dirigem o fluxo (avançam steps). Esses são bloqueados pelo gate. */
export const FLOW_DRIVING_MODES = new Set(["reply", "drive"]);

/** Modos utilitários — sempre permitidos, não dirigem step. */
export const UTILITY_MODES = new Set(["answer_only", "rescue", "followup", "summarize"]);

export async function hasActiveCustomFlow(
  supabase: SupabaseClient,
  consultantId: string | null | undefined,
): Promise<boolean> {
  if (!consultantId) return false;
  const cached = cache.get(consultantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const { data } = await supabase
      .from("bot_flows")
      .select("id")
      .eq("consultant_id", consultantId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const value = !!data?.id;
    cache.set(consultantId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (e) {
    console.warn("[orchestrator-gate] check failed (fail-open):", (e as any)?.message);
    return false;
  }
}

/**
 * Decisão de "deve pular o short-circuit do ai-sales-agent?".
 * Retorna `true` quando o consultor tem fluxo custom ativo E o modo dirige fluxo.
 */
export async function shouldSkipShortCircuit(
  supabase: SupabaseClient,
  consultantId: string | null | undefined,
  mode: string | null | undefined,
): Promise<boolean> {
  const m = String(mode || "reply").toLowerCase();
  if (UTILITY_MODES.has(m)) return false; // utilitários nunca pulam
  if (!FLOW_DRIVING_MODES.has(m)) return false; // modo desconhecido → não interferir
  return await hasActiveCustomFlow(supabase, consultantId);
}

/** Limpa cache (útil em testes ou quando o admin ativa/desativa um flow). */
export function clearOrchestratorGateCache(consultantId?: string): void {
  if (consultantId) cache.delete(consultantId);
  else cache.clear();
}

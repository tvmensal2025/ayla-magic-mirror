// Task 21 (whatsapp-flow-reliability-fix): resolve dinamicamente o step de
// captura de imagem de conta de luz dentro do flow do consultor. Permite que
// um consultor renomeie o step (ex: "capturar_conta_v2") ou tenha múltiplos
// flows, sem precisar de patch no código. Fallback: "aguardando_conta".
//
// O helper é deliberadamente best-effort + tolerante a erro. Em qualquer
// falha (RLS, flow inexistente, sem step image_capture) retorna o legado.

const FALLBACK = "aguardando_conta";

// Cache curto (60s) por consultor — flows mudam raro e queremos zero overhead
// no hot path do webhook.
const cache = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 60_000;

export async function resolveImageCaptureStep(
  supabase: any,
  consultantId: string | null | undefined,
): Promise<string> {
  if (!consultantId) return FALLBACK;

  const cached = cache.get(consultantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const { data: flow } = await supabase
      .from("bot_flows")
      .select("id")
      .eq("consultant_id", consultantId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!flow?.id) {
      cache.set(consultantId, { value: FALLBACK, expiresAt: Date.now() + TTL_MS });
      return FALLBACK;
    }

    const { data: step } = await supabase
      .from("bot_flow_steps")
      .select("step_key")
      .eq("flow_id", flow.id)
      .eq("step_type", "image_capture")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    const value = step?.step_key || FALLBACK;
    cache.set(consultantId, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch (_e) {
    return FALLBACK;
  }
}

/** Apenas para testes — limpa o cache. */
export function _clearImageCaptureCache() {
  cache.clear();
}

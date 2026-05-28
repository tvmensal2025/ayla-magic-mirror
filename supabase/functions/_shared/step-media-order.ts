// Shared helper: reads consultants.flow_step_media_order[stepKey] and returns
// a comparator that sorts media items by kind in the configured order.
// If no order is configured, returns null and callers keep their default order.

const DEFAULT_ORDER = ["audio", "image", "video", "text", "document"] as const;

export type MediaKind = string | null | undefined;

// deno-lint-ignore no-explicit-any
export async function getStepMediaOrder(
  supabase: any,
  consultantId: string,
  stepKey: string | null | undefined | Array<string | null | undefined>,
): Promise<string[] | null> {
  if (!consultantId) return null;
  const candidates = (Array.isArray(stepKey) ? stepKey : [stepKey])
    .map((k) => (k == null ? "" : String(k)))
    .filter((k) => k.length > 0);
  if (candidates.length === 0) return null;
  try {
    const { data } = await supabase
      .from("consultants")
      .select("flow_step_media_order")
      .eq("id", consultantId)
      .maybeSingle();
    const map = (data as any)?.flow_step_media_order;
    if (!map || typeof map !== "object") return null;
    for (const key of candidates) {
      const order = map[key];
      if (Array.isArray(order) && order.length > 0) {
        return order.map((k) => String(k).toLowerCase());
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Returns a stable comparator that orders by the given kind array.
// Items whose kind is not listed go to the end, preserving original order.
export function makeKindComparator<T>(getKind: (item: T) => MediaKind, order: string[] | null) {
  if (!order || order.length === 0) {
    return (_a: T, _b: T) => 0;
  }
  const rank = new Map<string, number>();
  order.forEach((k, i) => rank.set(k.toLowerCase(), i));
  return (a: T, b: T) => {
    const ka = String(getKind(a) || "").toLowerCase();
    const kb = String(getKind(b) || "").toLowerCase();
    const ra = rank.has(ka) ? rank.get(ka)! : 999;
    const rb = rank.has(kb) ? rank.get(kb)! : 999;
    return ra - rb;
  };
}

export { DEFAULT_ORDER };


// ────────────────────────────────────────────────────────────────────────
// Task 26 (whatsapp-flow-reliability-fix): cálculo determinístico do
// sleep entre items de uma sequência outbound.
//
// Antes desse helper, o código fazia `await sleep(800)` direto entre
// envios. Vídeos/áudios longos terminavam de "carregar" do lado do lead
// DEPOIS que o próximo item já tinha começado, causando sobreposição.
//
// Regra (design.md §6 da spec antiga, condição 2.22):
//   - Sleep mínimo entre items: 800ms.
//   - Quando o item ANTERIOR é áudio ou vídeo, somamos um post-roll
//     proporcional à duração: postAudioVideo = min(0.6 * duration_ms, 8000ms).
//   - Caller pode passar `configuredDelayMs` quando quer um piso maior.
//   - Resultado: max(800, configuredDelayMs, postAudioVideo).
//
// Função pura. Sem efeitos colaterais. Determinística.

export type MediaItemKind = "text" | "image" | "audio" | "video" | "document" | "buttons";

export interface SleepBetweenMediaInput {
  /** Tipo do item ANTERIOR (o que acabou de ser enviado). */
  previousKind: MediaItemKind;
  /** Duração em ms do item anterior (só usado se for audio/video). */
  previousDurationMs?: number;
  /** Sleep mínimo configurado pelo step (ex: `bot_flow_steps.delay_ms`). */
  configuredDelayMs?: number;
}

export const SLEEP_BETWEEN_MEDIA_FLOOR_MS = 800;
export const POST_AUDIO_VIDEO_RATIO = 0.6;
export const POST_AUDIO_VIDEO_CAP_MS = 8000;

/**
 * Calcula o sleep determinístico entre items de uma sequência outbound.
 *
 * Invariantes (validadas por PBT em `step-media-order_test.ts`):
 *   - resultado >= SLEEP_BETWEEN_MEDIA_FLOOR_MS (800ms).
 *   - resultado >= configuredDelayMs quando informado.
 *   - quando previousKind ∈ {audio, video} e duração > 0, resultado >=
 *     min(0.6 * duration, 8000ms).
 *   - resultado <= max(SLEEP_BETWEEN_MEDIA_FLOOR_MS, configuredDelayMs, POST_AUDIO_VIDEO_CAP_MS).
 */
export function sleepBetweenMedia(input: SleepBetweenMediaInput): number {
  const floor = SLEEP_BETWEEN_MEDIA_FLOOR_MS;
  const configured = Math.max(0, Math.floor(input.configuredDelayMs ?? 0));

  let postAv = 0;
  if (input.previousKind === "audio" || input.previousKind === "video") {
    const duration = Math.max(0, Math.floor(input.previousDurationMs ?? 0));
    postAv = Math.min(POST_AUDIO_VIDEO_CAP_MS, Math.floor(duration * POST_AUDIO_VIDEO_RATIO));
  }

  return Math.max(floor, configured, postAv);
}

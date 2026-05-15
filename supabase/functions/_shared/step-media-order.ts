// Shared helper: reads consultants.flow_step_media_order[stepKey] and returns
// a comparator that sorts media items by kind in the configured order.
// If no order is configured, returns null and callers keep their default order.

const DEFAULT_ORDER = ["audio", "image", "video", "text", "document"] as const;

export type MediaKind = string | null | undefined;

// deno-lint-ignore no-explicit-any
export async function getStepMediaOrder(supabase: any, consultantId: string, stepKey: string | null | undefined): Promise<string[] | null> {
  if (!consultantId || !stepKey) return null;
  try {
    const { data } = await supabase
      .from("consultants")
      .select("flow_step_media_order")
      .eq("id", consultantId)
      .maybeSingle();
    const map = (data as any)?.flow_step_media_order;
    if (!map || typeof map !== "object") return null;
    const order = map[stepKey];
    if (!Array.isArray(order) || order.length === 0) return null;
    return order.map((k) => String(k).toLowerCase());
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

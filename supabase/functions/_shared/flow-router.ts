// Flow router — detecta intenção forte de migrar para outro fluxo (PJ, Licenciada, ...).
// Lê regras de `public.flow_router_rules`. Cache em memória por 60s.
//
// Uso:
//   const switchCandidate = await detectFlowSwitch(supabase, consultantId, text, currentFlowKey);
//   if (switchCandidate) { ... } // proponha troca ao lead

export interface FlowRouterRule {
  id: string;
  consultant_id: string | null;
  trigger_keywords: string[];
  target_flow_key: string;
  target_flow_label: string;
  priority: number;
  is_active: boolean;
}

export interface FlowSwitchCandidate {
  rule_id: string;
  target_flow_key: string;
  target_flow_label: string;
  matched_keyword: string;
}

const CACHE_TTL_MS = 60_000;
let cacheAt = 0;
let cache: FlowRouterRule[] = [];

async function loadRules(supabase: any): Promise<FlowRouterRule[]> {
  const now = Date.now();
  if (cache.length && now - cacheAt < CACHE_TTL_MS) return cache;
  try {
    const { data } = await supabase
      .from("flow_router_rules")
      .select("id, consultant_id, trigger_keywords, target_flow_key, target_flow_label, priority, is_active")
      .eq("is_active", true)
      .order("priority", { ascending: false });
    cache = (data as FlowRouterRule[]) || [];
    cacheAt = now;
  } catch (e) {
    console.warn("[flow-router] load rules falhou:", (e as Error).message);
  }
  return cache;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function detectFlowSwitch(
  supabase: any,
  consultantId: string | null,
  text: string,
  currentFlowKey: string | null,
): Promise<FlowSwitchCandidate | null> {
  if (!text || text.length < 2) return null;
  const rules = await loadRules(supabase);
  if (!rules.length) return null;
  const t = normalize(text);

  const applicable = rules.filter(r => r.consultant_id === null || r.consultant_id === consultantId);

  for (const r of applicable) {
    for (const kw of r.trigger_keywords || []) {
      const k = normalize(kw);
      if (!k) continue;
      // Word-boundary match: evita "pj" disparar dentro de "pjotinha"
      const rx = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
      if (rx.test(t)) {
        if (currentFlowKey && currentFlowKey === r.target_flow_key) return null; // já está nesse fluxo
        return {
          rule_id: r.id,
          target_flow_key: r.target_flow_key,
          target_flow_label: r.target_flow_label,
          matched_keyword: kw,
        };
      }
    }
  }
  return null;
}

export function clearFlowRouterCache() {
  cache = [];
  cacheAt = 0;
}

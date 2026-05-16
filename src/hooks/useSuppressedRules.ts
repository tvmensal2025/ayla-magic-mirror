import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SuppressedRuleGroup {
  reason: string;
  count: number;
  last_at: string | null;
  top_rules: { rule_id: string; name: string; count: number }[];
}

/**
 * Agrupa registros de bot_flow_rule_fires por suppressed_reason
 * (regras que NÃO dispararam por algum motivo) nos últimos N dias.
 */
export function useSuppressedRules(days = 7) {
  return useQuery({
    queryKey: ["suppressed_rules", days],
    queryFn: async (): Promise<SuppressedRuleGroup[]> => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("bot_flow_rule_fires" as any)
        .select("rule_id, suppressed_reason, created_at")
        .not("suppressed_reason", "is", null)
        .gte("created_at", since)
        .limit(10_000);

      if (error) throw error;

      const ruleIds = Array.from(
        new Set(((data as any[]) || []).map((r) => r.rule_id).filter(Boolean)),
      );

      const nameById = new Map<string, string>();
      if (ruleIds.length > 0) {
        const { data: rules } = await supabase
          .from("bot_flow_rules" as any)
          .select("id, name")
          .in("id", ruleIds);
        for (const r of (rules as any[]) || []) {
          nameById.set(r.id, r.name || r.id.slice(0, 8));
        }
      }

      const byReason = new Map<
        string,
        { count: number; last_at: string | null; perRule: Map<string, number> }
      >();

      for (const row of (data as any[]) || []) {
        const reason = row.suppressed_reason as string;
        const entry = byReason.get(reason) || {
          count: 0,
          last_at: null,
          perRule: new Map<string, number>(),
        };
        entry.count += 1;
        if (!entry.last_at || row.created_at > entry.last_at) {
          entry.last_at = row.created_at;
        }
        if (row.rule_id) {
          entry.perRule.set(row.rule_id, (entry.perRule.get(row.rule_id) || 0) + 1);
        }
        byReason.set(reason, entry);
      }

      return Array.from(byReason.entries())
        .map(([reason, v]) => ({
          reason,
          count: v.count,
          last_at: v.last_at,
          top_rules: Array.from(v.perRule.entries())
            .map(([rule_id, count]) => ({
              rule_id,
              name: nameById.get(rule_id) || rule_id.slice(0, 8),
              count,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 60_000,
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FunnelStep {
  step: string;
  count: number;
  percentage: number;
}

/**
 * Retorna a distribuição de leads por etapa do bot nos últimos N dias,
 * agrupando por `to_step` na tabela bot_step_transitions.
 *
 * Útil para identificar onde os leads estão travando no funil.
 */
export function useBotFunnel(days = 7) {
  return useQuery({
    queryKey: ["bot_funnel", days],
    queryFn: async (): Promise<FunnelStep[]> => {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("bot_step_transitions" as any)
        .select("to_step")
        .gte("created_at", since)
        .limit(10_000);

      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of (data as any[]) || []) {
        const step = row.to_step as string;
        counts.set(step, (counts.get(step) || 0) + 1);
      }

      const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      return Array.from(counts.entries())
        .map(([step, count]) => ({
          step,
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 60_000,
  });
}

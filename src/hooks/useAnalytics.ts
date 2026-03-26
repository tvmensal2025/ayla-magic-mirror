import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DailyViews {
  date: string;
  client: number;
  licenciada: number;
}

export function useAnalytics(consultantId: string | null) {
  return useQuery({
    queryKey: ["analytics", consultantId],
    enabled: !!consultantId,
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("page_views")
        .select("page_type, created_at")
        .eq("consultant_id", consultantId!)
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (error) throw error;

      const totalClient = data.filter((v) => v.page_type === "client").length;
      const totalLicenciada = data.filter((v) => v.page_type === "licenciada").length;

      // Group by day
      const dayMap = new Map<string, { client: number; licenciada: number }>();
      
      // Fill all 30 days
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        dayMap.set(key, { client: 0, licenciada: 0 });
      }

      for (const row of data) {
        const key = row.created_at.split("T")[0];
        const entry = dayMap.get(key);
        if (entry) {
          if (row.page_type === "client") entry.client++;
          else entry.licenciada++;
        }
      }

      const daily: DailyViews[] = Array.from(dayMap.entries()).map(([date, counts]) => ({
        date,
        ...counts,
      }));

      return { totalClient, totalLicenciada, total: totalClient + totalLicenciada, daily };
    },
  });
}

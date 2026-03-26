import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DailyViews {
  date: string;
  client: number;
  licenciada: number;
}

export interface HourlyData {
  hour: number;
  views: number;
}

export interface DeviceData {
  device: string;
  count: number;
}

export interface UtmData {
  source: string;
  count: number;
}

export function useAnalytics(consultantId: string | null) {
  return useQuery({
    queryKey: ["analytics", consultantId],
    enabled: !!consultantId,
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString();

      // Fetch views and events in parallel
      const [viewsRes, eventsRes] = await Promise.all([
        supabase
          .from("page_views")
          .select("page_type, created_at, device_type, utm_source")
          .eq("consultant_id", consultantId!)
          .gte("created_at", since),
        supabase
          .from("page_events")
          .select("event_type, event_target, page_type, created_at, device_type, utm_source")
          .eq("consultant_id", consultantId!)
          .gte("created_at", since),
      ]);

      if (viewsRes.error) throw viewsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      const views = viewsRes.data;
      const events = eventsRes.data;

      const totalClient = views.filter((v) => v.page_type === "client").length;
      const totalLicenciada = views.filter((v) => v.page_type === "licenciada").length;

      // Clicks
      const totalClicks = events.filter((e) => e.event_type === "click").length;
      const clicksByTarget: Record<string, number> = {};
      for (const e of events) {
        if (e.event_type === "click" && e.event_target) {
          clicksByTarget[e.event_target] = (clicksByTarget[e.event_target] || 0) + 1;
        }
      }

      // Daily views
      const dayMap = new Map<string, { client: number; licenciada: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayMap.set(d.toISOString().split("T")[0], { client: 0, licenciada: 0 });
      }
      for (const row of views) {
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

      // Hourly distribution
      const hourMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) hourMap.set(h, 0);
      for (const row of views) {
        const h = new Date(row.created_at).getHours();
        hourMap.set(h, (hourMap.get(h) || 0) + 1);
      }
      const hourly: HourlyData[] = Array.from(hourMap.entries()).map(([hour, views]) => ({
        hour,
        views,
      }));

      // Device distribution
      const deviceMap = new Map<string, number>();
      for (const row of views) {
        const d = row.device_type || "desconhecido";
        deviceMap.set(d, (deviceMap.get(d) || 0) + 1);
      }
      const devices: DeviceData[] = Array.from(deviceMap.entries())
        .map(([device, count]) => ({ device, count }))
        .sort((a, b) => b.count - a.count);

      // UTM sources
      const utmMap = new Map<string, number>();
      for (const row of views) {
        const s = row.utm_source || "direto";
        utmMap.set(s, (utmMap.get(s) || 0) + 1);
      }
      const utmSources: UtmData[] = Array.from(utmMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      return {
        totalClient,
        totalLicenciada,
        total: totalClient + totalLicenciada,
        totalClicks,
        clicksByTarget,
        daily,
        hourly,
        devices,
        utmSources,
      };
    },
  });
}

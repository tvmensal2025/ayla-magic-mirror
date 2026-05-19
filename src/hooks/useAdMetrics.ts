import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdMetricsDailyPoint {
  date: string;
  spend_cents: number;
  leads: number;
  cpl_cents: number | null;
  impressions: number;
  clicks: number;
}

export interface AdMetrics {
  spendCents: number;
  leads: number;
  cplCents: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  daily: AdMetricsDailyPoint[];
  hasConnection: boolean;
}

export function useAdMetrics(consultantId: string | undefined | null, periodDays: number) {
  return useQuery({
    queryKey: ["ad-metrics-wa", consultantId, periodDays],
    enabled: !!consultantId,
    queryFn: async (): Promise<AdMetrics> => {
      const since = new Date();
      since.setDate(since.getDate() - periodDays);
      since.setHours(0, 0, 0, 0);
      const sinceISO = since.toISOString();
      const sinceDate = sinceISO.slice(0, 10);

      const [spendRes, leadsRes, fbRes] = await Promise.all([
        supabase
          .from("ad_spend_daily")
          .select("date, spend_cents, leads, impressions, clicks")
          .eq("consultant_id", consultantId!)
          .gte("date", sinceDate)
          .order("date", { ascending: true }),
        supabase
          .from("customers")
          .select("created_at")
          .eq("consultant_id", consultantId!)
          .gte("created_at", sinceISO)
          .limit(10000),
        supabase
          .from("facebook_connections")
          .select("id")
          .eq("consultant_id", consultantId!)
          .maybeSingle(),
      ]);

      const spendRows = spendRes.data ?? [];
      const customerRows = leadsRes.data ?? [];

      // Aggregate leads by day (date in YYYY-MM-DD)
      const leadsByDay = new Map<string, number>();
      for (const c of customerRows as any[]) {
        const d = String(c.created_at).slice(0, 10);
        leadsByDay.set(d, (leadsByDay.get(d) ?? 0) + 1);
      }

      // Build day range (since → today)
      const days: string[] = [];
      const cursor = new Date(since);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      while (cursor <= today) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }

      const spendByDay = new Map<string, any>();
      for (const r of spendRows as any[]) spendByDay.set(String(r.date).slice(0, 10), r);

      const daily: AdMetricsDailyPoint[] = days.map((d) => {
        const s = spendByDay.get(d);
        const spend_cents = Number(s?.spend_cents ?? 0);
        const leads = leadsByDay.get(d) ?? 0;
        return {
          date: d,
          spend_cents,
          leads,
          cpl_cents: leads > 0 ? Math.round(spend_cents / leads) : null,
          impressions: Number(s?.impressions ?? 0),
          clicks: Number(s?.clicks ?? 0),
        };
      });

      const spendCents = daily.reduce((s, r) => s + r.spend_cents, 0);
      const leads = customerRows.length;
      const impressions = daily.reduce((s, r) => s + r.impressions, 0);
      const clicks = daily.reduce((s, r) => s + r.clicks, 0);

      return {
        spendCents,
        leads,
        cplCents: leads > 0 ? Math.round(spendCents / leads) : null,
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : null,
        daily,
        hasConnection: !!fbRes.data,
      };
    },
    staleTime: 60_000,
  });
}

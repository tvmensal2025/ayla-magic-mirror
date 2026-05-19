import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdMetrics {
  spendCents: number;
  leads: number;
  cplCents: number | null;
  lpVisits: number;
  costPerVisitCents: number | null;
  lpToLeadRate: number | null;
  impressions: number;
  clicks: number;
  daily: { date: string; spend_cents: number; leads: number }[];
  hasConnection: boolean;
}

export function useAdMetrics(consultantId: string | undefined | null, periodDays: number) {
  return useQuery({
    queryKey: ["ad-metrics", consultantId, periodDays],
    enabled: !!consultantId,
    queryFn: async (): Promise<AdMetrics> => {
      const since = new Date();
      since.setDate(since.getDate() - periodDays);
      const sinceISO = since.toISOString();
      const sinceDate = sinceISO.slice(0, 10);

      const [spendRes, leadsRes, visitsRes, fbRes] = await Promise.all([
        supabase
          .from("ad_spend_daily")
          .select("date, spend_cents, leads, impressions, clicks")
          .eq("consultant_id", consultantId!)
          .gte("date", sinceDate)
          .order("date", { ascending: true }),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("consultant_id", consultantId!)
          .eq("customer_origin", "whatsapp")
          .gte("created_at", sinceISO),
        supabase
          .from("page_views")
          .select("id", { count: "exact", head: true })
          .eq("consultant_id", consultantId!)
          .gte("created_at", sinceISO),
        supabase
          .from("facebook_connections")
          .select("id")
          .eq("consultant_id", consultantId!)
          .maybeSingle(),
      ]);

      const rows = spendRes.data ?? [];
      const spendCents = rows.reduce((s, r: any) => s + Number(r.spend_cents || 0), 0);
      const fbLeads = rows.reduce((s, r: any) => s + Number(r.leads || 0), 0);
      const impressions = rows.reduce((s, r: any) => s + Number(r.impressions || 0), 0);
      const clicks = rows.reduce((s, r: any) => s + Number(r.clicks || 0), 0);
      const leads = leadsRes.count ?? 0;
      const lpVisits = visitsRes.count ?? 0;
      const effectiveLeads = leads || fbLeads;

      return {
        spendCents,
        leads: effectiveLeads,
        cplCents: effectiveLeads > 0 ? Math.round(spendCents / effectiveLeads) : null,
        lpVisits,
        costPerVisitCents: lpVisits > 0 ? Math.round(spendCents / lpVisits) : null,
        lpToLeadRate: lpVisits > 0 ? effectiveLeads / lpVisits : null,
        impressions,
        clicks,
        daily: rows as any,
        hasConnection: !!fbRes.data,
      };
    },
    staleTime: 60_000,
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeadsByConsultantRow {
  consultantId: string;
  name: string;
  leads: number;
  spendCents: number;
  cplCents: number | null;
}

export function useLeadsByConsultant(
  consultantIds: string[],
  consultantNames: Record<string, string>,
  periodDays: number,
) {
  return useQuery({
    queryKey: ["leads-by-consultant", consultantIds.sort().join(","), periodDays],
    enabled: consultantIds.length > 1,
    queryFn: async (): Promise<LeadsByConsultantRow[]> => {
      const since = new Date();
      since.setDate(since.getDate() - periodDays);
      since.setHours(0, 0, 0, 0);
      const sinceISO = since.toISOString();
      const sinceDate = sinceISO.slice(0, 10);

      const [custRes, spendRes] = await Promise.all([
        supabase
          .from("customers")
          .select("consultant_id")
          .in("consultant_id", consultantIds)
          .gte("created_at", sinceISO)
          .limit(20000),
        supabase
          .from("ad_spend_daily")
          .select("consultant_id, spend_cents")
          .in("consultant_id", consultantIds)
          .gte("date", sinceDate),
      ]);

      const leadCount = new Map<string, number>();
      for (const r of custRes.data ?? []) {
        const id = (r as any).consultant_id as string;
        leadCount.set(id, (leadCount.get(id) ?? 0) + 1);
      }
      const spendSum = new Map<string, number>();
      for (const r of spendRes.data ?? []) {
        const id = (r as any).consultant_id as string;
        spendSum.set(id, (spendSum.get(id) ?? 0) + Number((r as any).spend_cents ?? 0));
      }

      return consultantIds
        .map((id) => {
          const leads = leadCount.get(id) ?? 0;
          const spendCents = spendSum.get(id) ?? 0;
          return {
            consultantId: id,
            name: consultantNames[id] ?? id.slice(0, 6),
            leads,
            spendCents,
            cplCents: leads > 0 ? Math.round(spendCents / leads) : null,
          };
        })
        .sort((a, b) => b.leads - a.leads);
    },
    staleTime: 60_000,
  });
}

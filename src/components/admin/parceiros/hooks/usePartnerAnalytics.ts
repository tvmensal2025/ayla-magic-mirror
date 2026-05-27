import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerAnalytics {
  partner_id: string;
  partner_nome: string;
  keywords: string[];
  leads_total: number;
  leads_30d: number;
  leads_prev_30d: number;
  aprovados: number;
  reprovados: number;
  conta_recebida: number;
  qr_count: number;
  keyword_count: number;
  daily_series: { date: string; count: number }[];
  funnel: { lead: number; conta: number; aprovado: number };
  last_lead_at: string | null;
}

export function usePartnerAnalytics() {
  return useQuery({
    queryKey: ["referral-partner-analytics"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)(
        "get_referral_partner_analytics",
      );
      if (error) throw error;
      return ((data ?? []) as unknown as PartnerAnalytics[]).map((p) => ({
        ...p,
        leads_total: Number(p.leads_total) || 0,
        leads_30d: Number(p.leads_30d) || 0,
        leads_prev_30d: Number(p.leads_prev_30d) || 0,
        aprovados: Number(p.aprovados) || 0,
        reprovados: Number(p.reprovados) || 0,
        conta_recebida: Number(p.conta_recebida) || 0,
        qr_count: Number(p.qr_count) || 0,
        keyword_count: Number(p.keyword_count) || 0,
        daily_series: Array.isArray(p.daily_series) ? p.daily_series : [],
        funnel: p.funnel || { lead: 0, conta: 0, aprovado: 0 },
      }));
    },
    refetchInterval: 60_000,
  });
}

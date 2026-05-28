import { useMemo } from "react";
import type { PartnerAnalytics } from "./usePartnerAnalytics";

export interface LicenseeStats {
  leads30d: number;
  leadsTotal: number;
  aprovados: number;
  conversion: number;
  activePartners: number;
  trend: number;
}

export function useLicenseeStats(
  analytics: PartnerAnalytics[],
  partnerCount: number,
): LicenseeStats {
  return useMemo(() => {
    let leads30d = 0;
    let leadsTotal = 0;
    let aprovados = 0;
    let prev30 = 0;
    for (const a of analytics) {
      leads30d += a.leads_30d ?? 0;
      leadsTotal += a.leads_total ?? 0;
      aprovados += a.aprovados ?? 0;
      prev30 += a.leads_prev_30d ?? 0;
    }
    const conversion =
      leadsTotal > 0 ? Math.round((aprovados / leadsTotal) * 100) : 0;
    const trend =
      prev30 === 0
        ? leads30d > 0
          ? 100
          : 0
        : Math.round(((leads30d - prev30) / prev30) * 100);
    return {
      leads30d,
      leadsTotal,
      aprovados,
      conversion,
      activePartners: partnerCount,
      trend,
    };
  }, [analytics, partnerCount]);
}

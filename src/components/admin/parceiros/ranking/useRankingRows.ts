import { useMemo } from "react";
import type { ReferralPartner } from "../hooks/useReferralPartners";
import type { PartnerAnalytics } from "../hooks/usePartnerAnalytics";

export interface RankingBadgeFlags {
  champion: boolean;
  hot: boolean;
  rookie: boolean;
  highConv: boolean;
  streak: boolean;
}

export interface RankingRow {
  partner: ReferralPartner;
  position: number;
  total: number;
  last30: number;
  prev30: number;
  aprov: number;
  conv: number;
  trend: number;
  streak: number;
  progressVsLeader: number; // 0..100
  badges: RankingBadgeFlags;
}

function computeStreak(series: { date: string; count: number }[] = []): number {
  // series is chronological ascending; count trailing consecutive days with count>0
  let streak = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if ((series[i]?.count ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

function isRecent(iso: string, days: number): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && Date.now() - t <= days * 86_400_000;
}

export interface UseRankingRowsArgs {
  partners: ReferralPartner[];
  analytics: PartnerAnalytics[];
  query?: string;
}

export function useRankingRows({
  partners,
  analytics,
  query = "",
}: UseRankingRowsArgs): RankingRow[] {
  return useMemo(() => {
    const aMap = new Map(analytics.map((a) => [a.partner_id, a]));

    const enriched = partners.map((p) => {
      const a = aMap.get(p.id);
      const total = a?.leads_total ?? 0;
      const last30 = a?.leads_30d ?? 0;
      const prev30 = a?.leads_prev_30d ?? 0;
      const aprov = a?.aprovados ?? 0;
      const conv = total > 0 ? Math.round((aprov / total) * 100) : 0;
      const trend =
        prev30 === 0
          ? last30 > 0
            ? 100
            : 0
          : Math.round(((last30 - prev30) / prev30) * 100);
      const streak = computeStreak(a?.daily_series);
      return { partner: p, total, last30, prev30, aprov, conv, trend, streak };
    });

    // Sort by last30 then total (the ranking is monthly competition first)
    const sorted = [...enriched].sort(
      (a, b) => b.last30 - a.last30 || b.total - a.total,
    );

    const leaderLast30 = sorted[0]?.last30 ?? 0;
    const championId = sorted[0]?.partner.id;

    const rows: RankingRow[] = sorted.map((r, idx) => ({
      ...r,
      position: idx + 1,
      progressVsLeader:
        leaderLast30 > 0
          ? Math.max(4, Math.round((r.last30 / leaderLast30) * 100))
          : 0,
      badges: {
        champion: r.partner.id === championId && r.last30 > 0,
        hot: r.trend >= 30 && r.last30 > 0,
        rookie:
          isRecent(r.partner.created_at, 30) && r.total >= 1,
        highConv: r.conv >= 40 && r.total >= 5,
        streak: r.streak >= 3,
      },
    }));

    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.partner.nome.toLowerCase().includes(q) ||
        (r.partner.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    );
  }, [partners, analytics, query]);
}

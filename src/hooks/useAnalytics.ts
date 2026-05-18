import { useQuery, keepPreviousData } from "@tanstack/react-query";
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

export interface CustomerStatusData {
  status: string;
  count: number;
  label: string;
}

export interface TopLicenciado {
  name: string;
  deals: number;
}

export interface WeeklyNewCustomers {
  week: string;
  count: number;
}

const CLICK_LABELS: Record<string, string> = {
  whatsapp: "💬 WhatsApp",
  whatsapp_intermediate: "💬 WhatsApp (CTA)",
  cadastro_cta: "📋 Botão de Cadastro",
  cadastro: "📋 Cadastro",
  cadastro_hero: "🏠 Cadastro (Hero)",
  cadastro_final: "📋 Cadastro (Final)",
  licenciada_cta: "💼 Licenciada (CTA)",
  licenciada: "💼 Licenciada",
  telefone: "📞 Telefone",
  instagram: "📸 Instagram",
  facebook: "📘 Facebook",
};

export function friendlyClickLabel(target: string): string {
  return CLICK_LABELS[target] || target.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useAnalytics(consultantId: string | null, periodDays: number = 30) {
  return useQuery({
    queryKey: ["analytics", consultantId, periodDays],
    enabled: !!consultantId,
    refetchOnMount: true,
    // Keep data fresh in memory for 5 minutes — sync happens on demand,
    // no need to refetch every 30s and risk wiping numbers on a transient error.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    // Show previous data while a new fetch is in flight (no zero/empty flash).
    placeholderData: keepPreviousData,
    // Survive transient network blips before falling back to error state.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    queryFn: async () => {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - periodDays);
      const since = sinceDate.toISOString();

      const [viewsRes, eventsRes, dealsRes] = await Promise.all([
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
        supabase
          .from("crm_deals")
          .select("customer_id")
          .eq("consultant_id", consultantId!),
      ]);

      if (viewsRes.error) throw viewsRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (dealsRes.error) throw dealsRes.error;

      const views = viewsRes.data;
      const events = eventsRes.data;

      // Fetch ALL customers with pagination
      const allCustomers: any[] = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, status, media_consumo, electricity_bill_value, created_at, registered_by_name, registered_by_igreen_id")
          .eq("consultant_id", consultantId!)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data) allCustomers.push(...data);
        if (!data || data.length < pageSize) break;
        page++;
      }

      const totalClient = views.filter((v) => v.page_type === "client").length;
      const totalLicenciada = views.filter((v) => v.page_type === "licenciada").length;

      const totalClicks = events.filter((e) => e.event_type === "click").length;
      const clicksByTarget: Record<string, number> = {};
      const clicksByPage: Record<string, Record<string, number>> = { client: {}, licenciada: {} };
      for (const e of events) {
        if (e.event_type === "click" && e.event_target) {
          clicksByTarget[e.event_target] = (clicksByTarget[e.event_target] || 0) + 1;
          const pg = e.page_type === "licenciada" ? "licenciada" : "client";
          if (!clicksByPage[pg][e.event_target]) clicksByPage[pg][e.event_target] = 0;
          clicksByPage[pg][e.event_target]++;
        }
      }

      const dayMap = new Map<string, { client: number; licenciada: number }>();
      for (let i = periodDays - 1; i >= 0; i--) {
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
      const daily: DailyViews[] = Array.from(dayMap.entries()).map(([date, counts]) => ({ date, ...counts }));

      const hourMap = new Map<number, number>();
      for (let h = 0; h < 24; h++) hourMap.set(h, 0);
      for (const row of views) {
        const h = new Date(row.created_at).getHours();
        hourMap.set(h, (hourMap.get(h) || 0) + 1);
      }
      const hourly: HourlyData[] = Array.from(hourMap.entries()).map(([hour, views]) => ({ hour, views }));

      const deviceMap = new Map<string, number>();
      for (const row of views) {
        const d = row.device_type || "desconhecido";
        deviceMap.set(d, (deviceMap.get(d) || 0) + 1);
      }
      const devices: DeviceData[] = Array.from(deviceMap.entries()).map(([device, count]) => ({ device, count })).sort((a, b) => b.count - a.count);

      const utmMap = new Map<string, number>();
      for (const row of views) {
        const s = row.utm_source || "direto";
        utmMap.set(s, (utmMap.get(s) || 0) + 1);
      }
      const utmSources: UtmData[] = Array.from(utmMap.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

      const totalCustomers = allCustomers.length;
      const statusMap = new Map<string, number>();
      for (const c of allCustomers) {
        const s = c.status || "pending";
        statusMap.set(s, (statusMap.get(s) || 0) + 1);
      }
      const statusLabels: Record<string, string> = {
        approved: "Aprovados", pending: "Pendentes", rejected: "Rejeitados", lead: "Leads",
        data_complete: "Dados Completos", registered_igreen: "Cadastrado iGreen", contract_sent: "Contrato Enviado",
      };
      const customersByStatus: CustomerStatusData[] = Array.from(statusMap.entries())
        .map(([status, count]) => ({ status, count, label: statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1) }))
        .sort((a, b) => b.count - a.count);

      const totalKw = allCustomers.reduce((sum, c) => sum + (Number(c.media_consumo) || 0), 0);
      const customersWithConsumption = allCustomers.filter((c) => Number(c.media_consumo) > 0);
      const avgKw = customersWithConsumption.length > 0 ? totalKw / customersWithConsumption.length : 0;

      const licMap = new Map<string, number>();
      for (const c of allCustomers) {
        const lic = c.registered_by_name;
        if (lic) licMap.set(lic, (licMap.get(lic) || 0) + 1);
      }
      const topLicenciados: TopLicenciado[] = Array.from(licMap.entries())
        .map(([name, deals]) => {
          const parts = name.trim().split(/\s+/);
          const shortName = parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : name;
          return { name: shortName, deals };
        })
        .sort((a, b) => b.deals - a.deals)
        .slice(0, 10);

      const weeks = Math.ceil(periodDays / 7);
      const weekMap = new Map<string, number>();
      for (let i = weeks - 1; i >= 0; i--) {
        const start = new Date(); start.setDate(start.getDate() - (i + 1) * 7);
        const end = new Date(); end.setDate(end.getDate() - i * 7);
        const label = `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
        weekMap.set(label, 0);
      }
      for (const c of allCustomers) {
        const created = new Date(c.created_at);
        if (created >= sinceDate) {
          const daysAgo = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
          const weekIdx = Math.min(weeks - 1, Math.floor(daysAgo / 7));
          const keys = Array.from(weekMap.keys());
          const key = keys[keys.length - 1 - weekIdx];
          if (key) weekMap.set(key, (weekMap.get(key) || 0) + 1);
        }
      }
      const weeklyNewCustomers: WeeklyNewCustomers[] = Array.from(weekMap.entries()).map(([week, count]) => ({ week, count }));

      const total = totalClient + totalLicenciada;
      const conversionRate = total > 0 ? (totalClicks / total) * 100 : 0;

      // === FUNNEL ===
      const ctaClicks = events.filter((e) =>
        e.event_type === "click" &&
        (e.event_target?.includes("whatsapp") || e.event_target?.includes("cadastro"))
      ).length;
      const periodCustomers = allCustomers.filter((c) => new Date(c.created_at) >= sinceDate);
      const leadsCount = periodCustomers.length;
      const approvedCount = periodCustomers.filter((c) =>
        c.status === "approved" || c.status === "active"
      ).length;
      const funnel = [
        { stage: "Visitas", count: total, pct: 100 },
        { stage: "Cliques CTA", count: ctaClicks, pct: total ? (ctaClicks / total) * 100 : 0 },
        { stage: "Leads", count: leadsCount, pct: total ? (leadsCount / total) * 100 : 0 },
        { stage: "Aprovados", count: approvedCount, pct: total ? (approvedCount / total) * 100 : 0 },
      ];

      // === WEEKDAY ===
      const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const weekdayMap = new Map<number, { views: number; clicks: number }>();
      for (let i = 0; i < 7; i++) weekdayMap.set(i, { views: 0, clicks: 0 });
      for (const v of views) {
        const d = new Date(v.created_at).getDay();
        weekdayMap.get(d)!.views++;
      }
      for (const e of events) {
        if (e.event_type === "click") {
          const d = new Date(e.created_at).getDay();
          weekdayMap.get(d)!.clicks++;
        }
      }
      const weekday = Array.from(weekdayMap.entries()).map(([d, v]) => ({
        day: weekdayNames[d], views: v.views, clicks: v.clicks,
      }));

      // === WEEK COMPARISON (current 7 days vs previous 7) ===
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const curStart = now - 7 * day;
      const prevStart = now - 14 * day;
      const curViews = views.filter((v) => new Date(v.created_at).getTime() >= curStart).length;
      const prevViews = views.filter((v) => {
        const t = new Date(v.created_at).getTime();
        return t >= prevStart && t < curStart;
      }).length;
      const curClicks = events.filter((e) => e.event_type === "click" && new Date(e.created_at).getTime() >= curStart).length;
      const prevClicks = events.filter((e) => e.event_type === "click" && new Date(e.created_at).getTime() >= prevStart && new Date(e.created_at).getTime() < curStart).length;
      const curLeads = allCustomers.filter((c) => new Date(c.created_at).getTime() >= curStart).length;
      const prevLeads = allCustomers.filter((c) => {
        const t = new Date(c.created_at).getTime();
        return t >= prevStart && t < curStart;
      }).length;
      const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
      const weekComparison = {
        views: { current: curViews, previous: prevViews, change: pctChange(curViews, prevViews) },
        clicks: { current: curClicks, previous: prevClicks, change: pctChange(curClicks, prevClicks) },
        leads: { current: curLeads, previous: prevLeads, change: pctChange(curLeads, prevLeads) },
      };

      // === TOP CAMPAIGNS (utm_source breakdown with conversions) ===
      const campaignMap = new Map<string, { views: number; clicks: number; leads: number }>();
      for (const v of views) {
        const key = v.utm_source || "direto";
        if (!campaignMap.has(key)) campaignMap.set(key, { views: 0, clicks: 0, leads: 0 });
        campaignMap.get(key)!.views++;
      }
      for (const e of events) {
        if (e.event_type === "click") {
          const key = e.utm_source || "direto";
          if (!campaignMap.has(key)) campaignMap.set(key, { views: 0, clicks: 0, leads: 0 });
          campaignMap.get(key)!.clicks++;
        }
      }
      const topCampaigns = Array.from(campaignMap.entries())
        .map(([source, v]) => ({
          source,
          ...v,
          conversionRate: v.views > 0 ? (v.clicks / v.views) * 100 : 0,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 8);

      // === PER-CTA TIME SERIES (sparklines + week comparison) ===
      // For each click target, build a 7-day series + current/previous week totals.
      const allTargets = Array.from(new Set(
        events.filter((e) => e.event_type === "click" && e.event_target).map((e) => e.event_target as string)
      ));
      const clicksByTargetDetailed: Record<string, {
        total: number;
        spark: number[];
        current: number;
        previous: number;
        change: number;
      }> = {};
      for (const t of allTargets) {
        const targetEvents = events.filter((e) => e.event_type === "click" && e.event_target === t);
        // 7-day sparkline (oldest -> newest)
        const spark: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - i);
          const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
          spark.push(targetEvents.filter((e) => {
            const ts = new Date(e.created_at).getTime();
            return ts >= dayStart.getTime() && ts < dayEnd.getTime();
          }).length);
        }
        const cur = targetEvents.filter((e) => new Date(e.created_at).getTime() >= curStart).length;
        const prv = targetEvents.filter((e) => {
          const ts = new Date(e.created_at).getTime();
          return ts >= prevStart && ts < curStart;
        }).length;
        clicksByTargetDetailed[t] = {
          total: targetEvents.length,
          spark,
          current: cur,
          previous: prv,
          change: pctChange(cur, prv),
        };
      }

      // Daily views sparkline (last 7 days) for hero KPI
      const buildDailySpark = (rows: Array<{ created_at: string }>) => {
        const out: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - i);
          const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
          out.push(rows.filter((r) => {
            const ts = new Date(r.created_at).getTime();
            return ts >= dayStart.getTime() && ts < dayEnd.getTime();
          }).length);
        }
        return out;
      };
      const sparkViews = buildDailySpark(views);
      const sparkClicks = buildDailySpark(events.filter((e) => e.event_type === "click"));
      const sparkLeads = buildDailySpark(allCustomers as Array<{ created_at: string }>);
      const approvedRows = allCustomers.filter((c: any) => c.status === "approved" || c.status === "active");
      const sparkApproved = buildDailySpark(approvedRows as Array<{ created_at: string }>);
      const curApproved = approvedRows.filter((c: any) => new Date(c.created_at).getTime() >= curStart).length;
      const prevApproved = approvedRows.filter((c: any) => {
        const t = new Date(c.created_at).getTime();
        return t >= prevStart && t < curStart;
      }).length;
      const heroKpis = {
        views: { ...weekComparison.views, spark: sparkViews },
        clicks: { ...weekComparison.clicks, spark: sparkClicks },
        leads: { ...weekComparison.leads, spark: sparkLeads },
        approved: { current: curApproved, previous: prevApproved, change: pctChange(curApproved, prevApproved), spark: sparkApproved },
      };

      return {
        totalClient, totalLicenciada, total, totalClicks, clicksByTarget, clicksByPage,
        daily, hourly, devices, utmSources, totalCustomers, customersByStatus,
        totalKw, avgKw, topLicenciados, weeklyNewCustomers, conversionRate, allCustomers,
        funnel, weekday, weekComparison, topCampaigns,
        clicksByTargetDetailed, heroKpis,
      };

    },
  });
}

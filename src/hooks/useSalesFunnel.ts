import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SalesPhase =
  | "abertura"
  | "descoberta"
  | "pitch"
  | "objecao"
  | "fechamento"
  | "ganhou"
  | "perdido";

export const SALES_PHASES: { key: SalesPhase; label: string; color: string; icon: string }[] = [
  { key: "abertura",   label: "Abertura",   color: "bg-blue-500/20 text-blue-300 border-blue-500/40",    icon: "👋" },
  { key: "descoberta", label: "Descoberta", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",    icon: "🔍" },
  { key: "pitch",      label: "Pitch",      color: "bg-amber-500/20 text-amber-300 border-amber-500/40", icon: "💡" },
  { key: "objecao",    label: "Objeção",    color: "bg-orange-500/20 text-orange-300 border-orange-500/40", icon: "🤔" },
  { key: "fechamento", label: "Fechamento", color: "bg-purple-500/20 text-purple-300 border-purple-500/40", icon: "🤝" },
  { key: "ganhou",     label: "Ganhou",     color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", icon: "🎉" },
  { key: "perdido",    label: "Perdido",    color: "bg-rose-500/20 text-rose-300 border-rose-500/40",    icon: "❌" },
];

export interface FunnelLead {
  id: string;
  name: string | null;
  phone_whatsapp: string;
  sales_phase: SalesPhase | null;
  qualification_score: number | null;
  electricity_bill_value: number | null;
  distribuidora: string | null;
  address_city: string | null;
  pain_point: string | null;
  lead_source: any;
  status: string;
  bot_paused: boolean;
  last_bot_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useSalesFunnel(consultantId: string) {
  const [leads, setLeads] = useState<FunnelLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    if (!consultantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, name, phone_whatsapp, sales_phase, qualification_score, electricity_bill_value, distribuidora, address_city, pain_point, lead_source, status, bot_paused, last_bot_reply_at, created_at, updated_at",
      )
      .eq("consultant_id", consultantId)
      .in("status", ["pending", "approved"])
      .order("updated_at", { ascending: false })
      .limit(500);
    if (!error && data) setLeads(data as FunnelLead[]);
    setLoading(false);
  }, [consultantId]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Realtime: refresh on any change to customers for this consultant
  useEffect(() => {
    if (!consultantId) return;
    const ch = supabase
      .channel(`funnel-${consultantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: `consultant_id=eq.${consultantId}` },
        () => fetchLeads(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [consultantId, fetchLeads]);

  const movePhase = useCallback(async (leadId: string, newPhase: SalesPhase) => {
    const { error } = await supabase
      .from("customers")
      .update({ sales_phase: newPhase, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (!error) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, sales_phase: newPhase } : l)));
    }
    return !error;
  }, []);

  return { leads, loading, fetchLeads, movePhase };
}

// Score → emoji + label
export function leadHeat(score: number | null | undefined): { emoji: string; label: string; color: string } {
  const s = score ?? 0;
  if (s >= 80) return { emoji: "🔥", label: "Quente", color: "text-rose-400" };
  if (s >= 40) return { emoji: "🟡", label: "Morno", color: "text-amber-400" };
  return { emoji: "🔵", label: "Frio", color: "text-sky-400" };
}

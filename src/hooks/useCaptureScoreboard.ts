import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ScoreboardRow {
  registrations: number;
  date: string;
}

export function useCaptureScoreboard(consultantId: string | null) {
  const [today, setToday] = useState(0);
  const [week, setWeek] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!consultantId) return;
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data } = await supabase
      .from("capture_scoreboard")
      .select("date, registrations")
      .eq("consultant_id", consultantId)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false });

    const rows = (data || []) as ScoreboardRow[];
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const t = rows.find((r) => r.date === todayStr)?.registrations || 0;

    // week = last 7 days
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const w = rows.filter((r) => r.date >= weekStr).reduce((s, r) => s + r.registrations, 0);

    // streak: consecutive days with registrations >= 1 ending today/yesterday
    let s = 0;
    const dateSet = new Set(rows.filter((r) => r.registrations > 0).map((r) => r.date));
    const cur = new Date();
    // start from today, allow grace if today=0 but yesterday>0
    if (!dateSet.has(todayStr)) cur.setDate(cur.getDate() - 1);
    while (true) {
      const k = cur.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      if (dateSet.has(k)) { s++; cur.setDate(cur.getDate() - 1); }
      else break;
    }

    setToday(t); setWeek(w); setStreak(s);
    setLoading(false);
  }, [consultantId]);

  useEffect(() => { void load(); }, [load]);

  const bump = useCallback(async () => {
    if (!consultantId) return;
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const { data: existing } = await supabase
      .from("capture_scoreboard")
      .select("id, registrations")
      .eq("consultant_id", consultantId)
      .eq("date", todayStr)
      .maybeSingle();
    if (existing) {
      await supabase.from("capture_scoreboard")
        .update({ registrations: (existing.registrations || 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("capture_scoreboard").insert({
        consultant_id: consultantId, date: todayStr, registrations: 1,
      });
    }
    void load();
  }, [consultantId, load]);

  return { today, week, streak, loading, bump, reload: load };
}

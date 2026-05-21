import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RankInfo { key: string; label: string; emoji: string; minLevel: number; color: string; }
const RANKS: RankInfo[] = [
  { key: "aprendiz", label: "Aprendiz", emoji: "🌱", minLevel: 1, color: "text-emerald-400" },
  { key: "captador", label: "Captador", emoji: "🎯", minLevel: 5, color: "text-cyan-400" },
  { key: "cacador", label: "Caçador", emoji: "🏹", minLevel: 10, color: "text-violet-400" },
  { key: "mestre", label: "Mestre", emoji: "👑", minLevel: 20, color: "text-amber-400" },
  { key: "lenda", label: "Lenda", emoji: "🐉", minLevel: 35, color: "text-rose-400" },
];

const XP_PER_LEAD = 10;

// XP needed to GO FROM level L to L+1
function xpForNextLevel(level: number) {
  return Math.round(100 * Math.pow(level, 1.4));
}
// total xp accumulated to REACH level L (sum of all prior)
function cumulativeXp(level: number) {
  let s = 0;
  for (let i = 1; i < level; i++) s += xpForNextLevel(i);
  return s;
}
function levelFromXp(xp: number) {
  let level = 1;
  let acc = 0;
  while (acc + xpForNextLevel(level) <= xp && level < 200) {
    acc += xpForNextLevel(level);
    level++;
  }
  return level;
}
function rankFor(level: number) {
  let r = RANKS[0];
  for (const candidate of RANKS) if (level >= candidate.minLevel) r = candidate;
  return r;
}

export interface GameProgress {
  totalXp: number;
  level: number;
  rank: RankInfo;
  xpInLevel: number;
  xpToNext: number;
  progressPct: number;
  todayCount: number;
  weekCount: number;
  streak: number;
  loading: boolean;
  reload: () => Promise<void>;
  // Returns the new level if level-up happened, else null
  registerCapture: () => { gainedXp: number; leveledUp: boolean; newLevel: number };
  registerMessage: (kind: "text" | "audio" | "media") => { gainedXp: number; leveledUp: boolean; newLevel: number };
}

export function useGameProgress(consultantId: string | null): GameProgress {
  const [totalXp, setTotalXp] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(false);
  const xpRef = useRef(0);

  const load = useCallback(async () => {
    if (!consultantId) return;
    setLoading(true);
    const since = new Date(); since.setDate(since.getDate() - 90);
    const { data } = await supabase
      .from("capture_scoreboard")
      .select("date, registrations")
      .eq("consultant_id", consultantId)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false });
    const rows = ((data as Array<{ date: string; registrations: number }>) || []);
    const total = rows.reduce((s, r) => s + (r.registrations || 0), 0);
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const t = rows.find((r) => r.date === todayStr)?.registrations || 0;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const w = rows.filter((r) => r.date >= weekStr).reduce((s, r) => s + (r.registrations || 0), 0);

    const dateSet = new Set(rows.filter((r) => r.registrations > 0).map((r) => r.date));
    let st = 0;
    const cur = new Date();
    if (!dateSet.has(todayStr)) cur.setDate(cur.getDate() - 1);
    while (true) {
      const k = cur.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      if (dateSet.has(k)) { st++; cur.setDate(cur.getDate() - 1); } else break;
    }

    const xp = total * XP_PER_LEAD;
    xpRef.current = xp;
    setTotalXp(xp);
    setTodayCount(t);
    setWeekCount(w);
    setStreak(st);
    setLoading(false);
  }, [consultantId]);

  useEffect(() => { void load(); }, [load]);

  const level = levelFromXp(totalXp);
  const xpInLevel = totalXp - cumulativeXp(level);
  const xpToNext = xpForNextLevel(level);
  const progressPct = Math.min(100, Math.round((xpInLevel / xpToNext) * 100));
  const rank = rankFor(level);

  const registerCapture = useCallback(() => {
    // combo bonus: extra XP for sequential captures within the same day
    const prev = xpRef.current;
    const todayPlusOne = todayCount + 1;
    const comboBonus = todayPlusOne >= 4 ? 15 : todayPlusOne === 3 ? 10 : todayPlusOne === 2 ? 5 : 0;
    const gained = XP_PER_LEAD + comboBonus;
    const newXp = prev + gained;
    xpRef.current = newXp;
    setTotalXp(newXp);
    setTodayCount((c) => c + 1);
    setWeekCount((c) => c + 1);
    const prevLevel = levelFromXp(prev);
    const newLevel = levelFromXp(newXp);
    return { gainedXp: gained, leveledUp: newLevel > prevLevel, newLevel };
  }, [todayCount]);

  const registerMessage = useCallback((kind: "text" | "audio" | "media") => {
    const prev = xpRef.current;
    const gained = kind === "audio" ? 10 : kind === "media" ? 8 : 5;
    const newXp = prev + gained;
    xpRef.current = newXp;
    setTotalXp(newXp);
    const prevLevel = levelFromXp(prev);
    const newLevel = levelFromXp(newXp);
    return { gainedXp: gained, leveledUp: newLevel > prevLevel, newLevel };
  }, []);

  return {
    totalXp, level, rank, xpInLevel, xpToNext, progressPct,
    todayCount, weekCount, streak, loading, reload: load, registerCapture, registerMessage,
  };
}

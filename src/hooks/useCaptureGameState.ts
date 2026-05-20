import { useEffect, useMemo, useRef, useState } from "react";

export interface LevelTier {
  index: number;
  name: string;
  emoji: string;
  color: string;     // tailwind text color class
  ring: string;      // ring/border color class
  min: number;       // min filled count
  max: number;       // exclusive
}

export const LEVEL_TIERS: LevelTier[] = [
  { index: 0, name: "Iniciante",  emoji: "🌱", color: "text-slate-400",  ring: "ring-slate-400/40",  min: 0,  max: 2 },
  { index: 1, name: "Bronze",     emoji: "🥉", color: "text-orange-400", ring: "ring-orange-400/40", min: 2,  max: 4 },
  { index: 2, name: "Prata",      emoji: "🥈", color: "text-zinc-300",   ring: "ring-zinc-300/40",   min: 4,  max: 6 },
  { index: 3, name: "Ouro",       emoji: "🥇", color: "text-amber-400",  ring: "ring-amber-400/50",  min: 6,  max: 8 },
  { index: 4, name: "Platina",    emoji: "💎", color: "text-cyan-300",   ring: "ring-cyan-300/50",   min: 8,  max: 10 },
  { index: 5, name: "PRONTO",     emoji: "⚡", color: "text-emerald-400",ring: "ring-emerald-400/60",min: 10, max: 99 },
];

export function tierFor(filled: number): LevelTier {
  return LEVEL_TIERS.find((t) => filled >= t.min && filled < t.max) || LEVEL_TIERS[LEVEL_TIERS.length - 1];
}

export interface XpEvent {
  id: string;
  amount: number;
  source: "field" | "ai" | "step" | "combo" | "level" | "submit";
  label?: string;
}

interface Options {
  filledCount: number;
  totalFields: number;
  sentStepsCount: number;
}

export function useCaptureGameState({ filledCount, totalFields, sentStepsCount }: Options) {
  const [xp, setXp] = useState(0);
  const [combo, setCombo] = useState(0); // multiplier - 1 (0 = no combo)
  const [events, setEvents] = useState<XpEvent[]>([]);
  const lastActionAt = useRef<number>(0);
  const comboTimer = useRef<number | null>(null);

  const prevFilled = useRef(filledCount);
  const prevSteps = useRef(sentStepsCount);

  const tier = useMemo(() => tierFor(filledCount), [filledCount]);
  const prevTierRef = useRef(tier.index);

  const pushEvent = (e: Omit<XpEvent, "id">) => {
    const ev: XpEvent = { ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    setEvents((s) => [...s.slice(-8), ev]);
    setXp((x) => x + e.amount);
    setTimeout(() => setEvents((s) => s.filter((x) => x.id !== ev.id)), 1500);
  };

  const bumpCombo = () => {
    const now = Date.now();
    const fast = now - lastActionAt.current < 20_000 && lastActionAt.current > 0;
    lastActionAt.current = now;
    if (fast) setCombo((c) => Math.min(c + 1, 5));
    if (comboTimer.current) window.clearTimeout(comboTimer.current);
    comboTimer.current = window.setTimeout(() => setCombo(0), 30_000);
  };

  // detect field fill
  useEffect(() => {
    if (filledCount > prevFilled.current) {
      const delta = filledCount - prevFilled.current;
      const base = 10 * delta;
      const mult = 1 + combo * 0.5;
      const total = Math.round(base * mult);
      pushEvent({ amount: total, source: "field", label: combo > 0 ? `+${total} XP · combo x${combo + 1}` : `+${total} XP` });
      bumpCombo();
    }
    prevFilled.current = filledCount;
  }, [filledCount]); // eslint-disable-line

  // detect step sent
  useEffect(() => {
    if (sentStepsCount > prevSteps.current) {
      pushEvent({ amount: 5, source: "step", label: "+5 XP passo" });
    }
    prevSteps.current = sentStepsCount;
  }, [sentStepsCount]); // eslint-disable-line

  // detect level up
  useEffect(() => {
    if (tier.index > prevTierRef.current) {
      pushEvent({ amount: 25, source: "level", label: `LEVEL UP · ${tier.name}` });
    }
    prevTierRef.current = tier.index;
  }, [tier.index, tier.name]);

  // suggest next missing field as "mission"
  const nextMissionLabel = useMemo(() => {
    const ratio = filledCount / totalFields;
    if (ratio >= 1) return "Aperta CADASTRAR";
    if (ratio < 0.3) return "Capture o nome e CPF";
    if (ratio < 0.6) return "Endereço + valor da conta";
    if (ratio < 0.9) return "Falta pouco — documento!";
    return "Última lapidada e bora";
  }, [filledCount, totalFields]);

  return { xp, combo, events, tier, nextMissionLabel, pushEvent };
}

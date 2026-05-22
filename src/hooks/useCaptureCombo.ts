// Combo timer hook for the capture game.
//
// Sequência de regras:
//   - Quando o consultor captura 1 lead, abre uma janela de 5 min.
//   - Se capturar outro nessa janela, vira combo x2 (XP +5).
//   - Se capturar outro DENTRO do combo, vira x3 (XP +10).
//   - Se a janela expira sem captura, combo zera.
//
// O hook expõe:
//   - level (1, 2, 3+)
//   - secondsLeft (countdown da janela)
//   - bonusXp (extra XP pra mostrar quando combo ativo)
//   - onCapture() (chamar ao capturar; retorna o novo combo level + bonus)
//   - reset()

import { useCallback, useEffect, useRef, useState } from "react";

const COMBO_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const STORAGE_KEY = "capture-combo-state-v1";

interface ComboState {
  level: number;
  expiresAt: number; // timestamp ms
}

function loadState(): ComboState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { level: 0, expiresAt: 0 };
    const parsed = JSON.parse(raw) as ComboState;
    if (parsed.expiresAt < Date.now()) return { level: 0, expiresAt: 0 };
    return parsed;
  } catch { return { level: 0, expiresAt: 0 }; }
}

function saveState(s: ComboState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* no-op */ }
}

function bonusFor(level: number): number {
  if (level <= 1) return 0;
  if (level === 2) return 5;
  if (level === 3) return 10;
  return 15; // x4+
}

export function useCaptureCombo() {
  const [state, setState] = useState<ComboState>(() => loadState());
  const [now, setNow] = useState<number>(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick a cada 1s pra atualizar o countdown visual quando combo está ativo.
  useEffect(() => {
    if (state.level <= 0) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    };
  }, [state.level]);

  // Auto-reset quando expira.
  useEffect(() => {
    if (state.level > 0 && now >= state.expiresAt) {
      const fresh = { level: 0, expiresAt: 0 };
      setState(fresh);
      saveState(fresh);
    }
  }, [now, state]);

  const onCapture = useCallback((): { level: number; bonusXp: number } => {
    const stillActive = state.expiresAt > Date.now();
    const newLevel = stillActive ? state.level + 1 : 1;
    const fresh = { level: newLevel, expiresAt: Date.now() + COMBO_WINDOW_MS };
    setState(fresh);
    saveState(fresh);
    return { level: newLevel, bonusXp: bonusFor(newLevel) };
  }, [state]);

  const reset = useCallback(() => {
    const fresh = { level: 0, expiresAt: 0 };
    setState(fresh);
    saveState(fresh);
  }, []);

  const secondsLeft = state.level > 0 ? Math.max(0, Math.floor((state.expiresAt - now) / 1000)) : 0;
  const progressPct = state.level > 0 ? Math.max(0, Math.min(100, (secondsLeft / (COMBO_WINDOW_MS / 1000)) * 100)) : 0;

  return {
    level: state.level,
    secondsLeft,
    progressPct,
    bonusXp: bonusFor(state.level),
    isActive: state.level > 0 && secondsLeft > 0,
    onCapture,
    reset,
  };
}

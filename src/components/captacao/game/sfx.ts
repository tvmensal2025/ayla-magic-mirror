// Tiny WebAudio SFX — no asset files needed.
let ctx: AudioContext | null = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, durationMs: number, type: OscillatorType = "sine", gain = 0.08, delayMs = 0) {
  const c = getCtx(); if (!c) return;
  const start = c.currentTime + delayMs / 1000;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.05);
}

export const sfx = {
  coin(enabled: boolean) {
    if (!enabled) return;
    tone(880, 80, "square", 0.06);
    tone(1320, 120, "square", 0.06, 70);
  },
  ding(enabled: boolean) {
    if (!enabled) return;
    tone(1568, 180, "triangle", 0.07);
  },
  levelUp(enabled: boolean) {
    if (!enabled) return;
    tone(523, 120, "triangle", 0.08, 0);
    tone(659, 120, "triangle", 0.08, 110);
    tone(784, 120, "triangle", 0.08, 220);
    tone(1047, 260, "triangle", 0.09, 330);
  },
};

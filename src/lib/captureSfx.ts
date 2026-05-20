// Web Audio simples — sons opcionais para o Modo Captação
// Toggle global persistido em localStorage. Default = OFF.

const KEY = "capture-sfx-enabled";

let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { return null; }
  }
  return _ctx;
}

export function isSfxEnabled(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setSfxEnabled(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* no-op */ }
}

function tone(freq: number, dur = 0.08, type: OscillatorType = "sine", vol = 0.08, slideTo?: number) {
  if (!isSfxEnabled()) return;
  const ac = ctx(); if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

export function sfxPop() { tone(880, 0.08, "triangle", 0.07, 1320); }
export function sfxCombo(level: number) {
  const base = 600 + level * 120;
  tone(base, 0.06, "square", 0.05);
  setTimeout(() => tone(base * 1.5, 0.07, "square", 0.05), 60);
}
export function sfxLevelUp() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.12, "triangle", 0.07), i * 70));
}
export function sfxVictory() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, 0.16, "sawtooth", 0.06), i * 90));
}

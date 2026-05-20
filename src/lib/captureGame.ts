import confetti from "canvas-confetti";

const PALETTE = ["#22c55e", "#10b981", "#84cc16", "#eab308", "#06b6d4", "#a855f7", "#f43f5e"];

export function fireMiniConfetti() {
  confetti({
    particleCount: 35,
    spread: 55,
    origin: { y: 0.6 },
    colors: PALETTE.slice(0, 4),
    scalar: 0.7,
    ticks: 120,
  });
}

export function fireBigConfetti() {
  const end = Date.now() + 1200;
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors: PALETTE });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors: PALETTE });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/** Balões subindo das laterais */
function fireBalloons() {
  const colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      confetti({
        particleCount: 8,
        startVelocity: 55,
        gravity: -0.5,
        ticks: 220,
        spread: 30,
        angle: 90,
        origin: { x: 0.1 + Math.random() * 0.8, y: 1 },
        colors,
        scalar: 1.6,
        shapes: ["circle"],
      });
    }, i * 220);
  }
}

/** Estrelas explodindo no centro */
function fireStars() {
  const defaults = { spread: 360, ticks: 80, gravity: 0.4, decay: 0.94, startVelocity: 30, shapes: ["star" as const], colors: ["#FFD700", "#FFA500", "#FFE066", "#FFFFFF"] };
  confetti({ ...defaults, particleCount: 50, scalar: 1.2 });
  confetti({ ...defaults, particleCount: 25, scalar: 0.75 });
  setTimeout(() => confetti({ ...defaults, particleCount: 30, scalar: 1 }), 200);
}

/** 3 fogos espaçados */
function fireFireworks() {
  const duration = 1400;
  const end = Date.now() + duration;
  const interval: number = window.setInterval(() => {
    if (Date.now() > end) return clearInterval(interval);
    const particleCount = 40;
    confetti({
      particleCount,
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      origin: { x: Math.random(), y: Math.random() * 0.4 + 0.1 },
      colors: PALETTE,
    });
  }, 300);
}

/** Chuva de emojis */
function fireEmojiRain() {
  const scalar = 2;
  const emojis = ["🎉", "🎊", "✨", "💚", "⚡", "🏆", "🔥"];
  emojis.forEach((emoji, i) => {
    setTimeout(() => {
      confetti({
        particleCount: 6,
        spread: 100,
        origin: { x: Math.random(), y: 0 },
        shapes: [(confetti as any).shapeFromText({ text: emoji, scalar })],
        scalar,
        gravity: 1,
        ticks: 200,
      });
    }, i * 80);
  });
}

/** Canhões laterais */
function fireSideCannons() {
  const end = Date.now() + 900;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, startVelocity: 55, origin: { x: 0, y: 0.7 }, colors: PALETTE });
    confetti({ particleCount: 4, angle: 120, spread: 55, startVelocity: 55, origin: { x: 1, y: 0.7 }, colors: PALETTE });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/** Espiral central */
function fireSpiral() {
  const total = 30;
  for (let i = 0; i < total; i++) {
    setTimeout(() => {
      const angle = (i / total) * 360;
      confetti({
        particleCount: 4,
        angle,
        spread: 10,
        startVelocity: 35,
        origin: { x: 0.5, y: 0.5 },
        colors: PALETTE,
        ticks: 100,
      });
    }, i * 25);
  }
}

const EFFECTS: Array<{ name: string; fn: () => void }> = [
  { name: "big", fn: fireBigConfetti },
  { name: "balloons", fn: fireBalloons },
  { name: "stars", fn: fireStars },
  { name: "fireworks", fn: fireFireworks },
  { name: "emoji", fn: fireEmojiRain },
  { name: "cannons", fn: fireSideCannons },
  { name: "spiral", fn: fireSpiral },
];

const LAST_KEY = "capture-last-celebration";

export function fireRandomCelebration() {
  let last: string | null = null;
  try { last = sessionStorage.getItem(LAST_KEY); } catch { /* no-op */ }
  const pool = EFFECTS.filter((e) => e.name !== last);
  const pick = pool[Math.floor(Math.random() * pool.length)] || EFFECTS[0];
  try { sessionStorage.setItem(LAST_KEY, pick.name); } catch { /* no-op */ }
  pick.fn();
}

export const MOTIVATIONAL_PHRASES: Record<number, string> = {
  1: "Boa! Primeiro dado capturado 🔥",
  2: "Tá no ritmo, segue 🎯",
  3: "Tá fluindo, segue o jogo!",
  4: "Quase metade 💪",
  5: "Metade! Foco que tá saindo 🚀",
  6: "Mais da metade, não para! ⚡",
  7: "Reta final iniciada 🏁",
  8: "Faltam só 2, não solta agora!",
  9: "Próximo passo: vitória 🏆",
  10: "CADASTRO COMPLETO ⚡ Aperta o botão!",
};

const EXTRA_PHRASES = [
  "Show de bola! 🎯",
  "Você tá voando 🚀",
  "Isso! Mais um na conta 💚",
  "Boa jogada, consultor! ⚡",
  "Combo ativado 🔥",
  "Tá inspirado hoje, hein? ✨",
  "Mais um pedaço do quebra-cabeça 🧩",
  "Velocidade Lewis Hamilton 🏎️",
  "Caprichou! 👏",
  "Tá no flow 💫",
  "Mira certeira 🎯",
  "É o ouro 🥇",
];

export function pickRandomPhrase(): string {
  return EXTRA_PHRASES[Math.floor(Math.random() * EXTRA_PHRASES.length)];
}

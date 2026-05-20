import confetti from "canvas-confetti";

export function fireMiniConfetti() {
  confetti({
    particleCount: 35,
    spread: 55,
    origin: { y: 0.6 },
    colors: ["#22c55e", "#10b981", "#84cc16", "#eab308"],
    scalar: 0.7,
    ticks: 120,
  });
}

export function fireBigConfetti() {
  const end = Date.now() + 1200;
  const colors = ["#22c55e", "#10b981", "#84cc16", "#eab308", "#06b6d4"];
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors });
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
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

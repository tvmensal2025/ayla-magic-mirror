// Tactile feedback helpers — Vibration API (Android/iOS PWA where supported).
// Falha silenciosamente em browsers que não suportam (desktop, Safari iOS sem PWA).
//
// Padrões inspirados em jogos casuais:
//   - tap: feedback discreto ao capturar UM campo (40ms)
//   - success: padrão de duas batidas (40-30-40) ao completar etapa importante
//   - levelUp: longo sustained ao subir de nível
//   - error: 3 batidas curtas ao falhar
//
// Mobile = sempre tenta. Desktop = no-op (Vibration API não existe).

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export const haptics = {
  /** Tap leve — usar a cada campo capturado. */
  tap(enabled = true) {
    if (!enabled || !canVibrate()) return;
    try { navigator.vibrate(40); } catch { /* no-op */ }
  },
  /** Confirmação curta — ao salvar dados/avançar passo. */
  click(enabled = true) {
    if (!enabled || !canVibrate()) return;
    try { navigator.vibrate(20); } catch { /* no-op */ }
  },
  /** Sucesso — duplo pulso (40-30-40). */
  success(enabled = true) {
    if (!enabled || !canVibrate()) return;
    try { navigator.vibrate([40, 30, 40]); } catch { /* no-op */ }
  },
  /** Subiu de nível — vibração longa com batida (150ms longo + 80ms curto). */
  levelUp(enabled = true) {
    if (!enabled || !canVibrate()) return;
    try { navigator.vibrate([150, 80, 80, 80, 200]); } catch { /* no-op */ }
  },
  /** Cadastro finalizado — celebração triple com pausa. */
  victory(enabled = true) {
    if (!enabled || !canVibrate()) return;
    try { navigator.vibrate([60, 40, 60, 40, 200]); } catch { /* no-op */ }
  },
  /** Erro — 3 batidas curtas. */
  error(enabled = true) {
    if (!enabled || !canVibrate()) return;
    try { navigator.vibrate([30, 50, 30, 50, 30]); } catch { /* no-op */ }
  },
};

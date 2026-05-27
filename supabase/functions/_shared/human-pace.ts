// Task 24 do whatsapp-flow-reliability-fix + Task 3 do whatsapp-flow-architecture-v3.
//
// Cálculo de delay "humano" antes de enviar uma mensagem outbound. Substitui
// a fórmula antiga `min(14000, max(3500, 3000 + len * 60))` que era cega para
// mensagens curtas (sempre 3.5s, mesmo para "ok") e tinha teto agressivo
// demais (14s).
//
// Novas regras (design.md §6 da spec antiga):
//   - Piso 2000ms se len <= 10 caracteres; senão 2500ms.
//   - Proporcional: 60ms por caractere.
//   - Teto: 12000ms.
//   - Quando a IA pediu pausa explícita (`should_pause_seconds`), respeitamos
//     no caller — esse helper só calcula o delay base.
//
// Função pura. Sem efeito colateral. Determinística.

export interface HumanPaceInput {
  /** Comprimento do texto a enviar. Use `text.length`. */
  charLen: number;
  /** Se a IA pediu pausa explícita antes do envio (em segundos). Default 0. */
  iaPauseSec?: number;
}

export const HUMAN_PACE_FLOOR_SHORT_MS = 2000;
export const HUMAN_PACE_FLOOR_LONG_MS = 2500;
export const HUMAN_PACE_PER_CHAR_MS = 60;
export const HUMAN_PACE_CEILING_MS = 12000;
export const HUMAN_PACE_SHORT_THRESHOLD = 10;
export const HUMAN_PACE_IA_PAUSE_CAP_SEC = 8;

/**
 * Calcula o delay base em ms para uma mensagem de comprimento `charLen`.
 * Para mensagens curtas (<=10 chars), usa piso menor (2000ms).
 *
 * Invariantes (validadas por PBT):
 *   - resultado >= floor (2000 ou 2500 conforme len).
 *   - resultado <= ceiling (12000ms).
 *   - monotônico não-decrescente em charLen.
 *
 * Não inclui pausa pedida pela IA — caller soma separado se quiser.
 */
export function computeHumanDelayMs(charLen: number): number {
  const len = Math.max(0, Math.floor(charLen || 0));
  const floor = len <= HUMAN_PACE_SHORT_THRESHOLD
    ? HUMAN_PACE_FLOOR_SHORT_MS
    : HUMAN_PACE_FLOOR_LONG_MS;
  const proportional = len * HUMAN_PACE_PER_CHAR_MS;
  const candidate = Math.max(floor, proportional);
  return Math.min(HUMAN_PACE_CEILING_MS, candidate);
}

/**
 * Variante que soma a pausa pedida pela IA (capada em 8s).
 * Mantém invariantes de teto considerando a soma.
 */
export function computeHumanDelayWithPauseMs(input: HumanPaceInput): number {
  const base = computeHumanDelayMs(input.charLen);
  const pauseMs = Math.max(
    0,
    Math.min(HUMAN_PACE_IA_PAUSE_CAP_SEC, Math.floor(input.iaPauseSec ?? 0)),
  ) * 1000;
  // Teto absoluto continua 12s + pausa explícita (caller controlou conscientemente).
  return base + pauseMs;
}

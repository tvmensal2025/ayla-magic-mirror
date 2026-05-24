// PBT do `human-pace.ts` (Task 24 da spec antiga + Task 3 da nova spec).
// Verifica monotonicidade, piso e teto da função `computeHumanDelayMs`.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeHumanDelayMs,
  computeHumanDelayWithPauseMs,
  HUMAN_PACE_CEILING_MS,
  HUMAN_PACE_FLOOR_SHORT_MS,
  HUMAN_PACE_FLOOR_LONG_MS,
  HUMAN_PACE_SHORT_THRESHOLD,
} from "./human-pace.ts";

Deno.test("computeHumanDelayMs: piso curto 2000ms para len <= 10", () => {
  for (let len = 0; len <= HUMAN_PACE_SHORT_THRESHOLD; len++) {
    const d = computeHumanDelayMs(len);
    assert(d >= HUMAN_PACE_FLOOR_SHORT_MS, `len=${len}: ${d} < ${HUMAN_PACE_FLOOR_SHORT_MS}`);
    assert(d <= HUMAN_PACE_CEILING_MS, `len=${len}: ${d} > ${HUMAN_PACE_CEILING_MS}`);
  }
});

Deno.test("computeHumanDelayMs: piso longo 2500ms para len > 10 e proporcional baixo", () => {
  // len=11: proporcional 660ms < piso longo 2500ms => deve usar piso.
  assertEquals(computeHumanDelayMs(11), HUMAN_PACE_FLOOR_LONG_MS);
  assertEquals(computeHumanDelayMs(20), HUMAN_PACE_FLOOR_LONG_MS); // 1200 < 2500
});

Deno.test("computeHumanDelayMs: proporcional 60ms/char quando supera piso longo", () => {
  // len=50: 50 * 60 = 3000ms > 2500ms (piso) → 3000.
  assertEquals(computeHumanDelayMs(50), 3000);
  // len=100: 100 * 60 = 6000ms.
  assertEquals(computeHumanDelayMs(100), 6000);
});

Deno.test("computeHumanDelayMs: teto 12000ms é aplicado em mensagens longas", () => {
  // len=300: 300 * 60 = 18000ms → cortado para 12000.
  assertEquals(computeHumanDelayMs(300), HUMAN_PACE_CEILING_MS);
  assertEquals(computeHumanDelayMs(10000), HUMAN_PACE_CEILING_MS);
});

Deno.test("computeHumanDelayMs: monotonicidade não-decrescente em charLen", () => {
  // PBT manual: para 0..400, delay(N) >= delay(N-1).
  let prev = computeHumanDelayMs(0);
  for (let len = 1; len <= 400; len++) {
    const cur = computeHumanDelayMs(len);
    assert(cur >= prev, `monotonicidade quebrada em len=${len}: ${cur} < ${prev}`);
    prev = cur;
  }
});

Deno.test("computeHumanDelayMs: tolera entradas negativas/NaN", () => {
  assertEquals(computeHumanDelayMs(-5), HUMAN_PACE_FLOOR_SHORT_MS);
  assertEquals(computeHumanDelayMs(NaN), HUMAN_PACE_FLOOR_SHORT_MS);
});

Deno.test("computeHumanDelayWithPauseMs: pausa IA é capada em 8s", () => {
  const base = computeHumanDelayMs(50);
  // pausa 100s é capada em 8000ms.
  assertEquals(computeHumanDelayWithPauseMs({ charLen: 50, iaPauseSec: 100 }), base + 8000);
  assertEquals(computeHumanDelayWithPauseMs({ charLen: 50, iaPauseSec: 0 }), base);
  assertEquals(computeHumanDelayWithPauseMs({ charLen: 50, iaPauseSec: -1 }), base);
});

Deno.test("computeHumanDelayWithPauseMs: pausa IA é somada após teto, não capada por ele", () => {
  // len=300 → base=12000 (teto). Soma de 5s = 17000.
  const r = computeHumanDelayWithPauseMs({ charLen: 300, iaPauseSec: 5 });
  assertEquals(r, HUMAN_PACE_CEILING_MS + 5000);
});

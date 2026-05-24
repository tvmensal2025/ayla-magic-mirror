// Task 26 (whatsapp-flow-reliability-fix): testes de `sleepBetweenMedia`.
// Valida o piso, o post-roll de áudio/vídeo, e o cap de 8s.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  sleepBetweenMedia,
  SLEEP_BETWEEN_MEDIA_FLOOR_MS,
  POST_AUDIO_VIDEO_CAP_MS,
} from "./step-media-order.ts";

Deno.test("sleepBetweenMedia: piso 800ms para texto-texto", () => {
  assertEquals(sleepBetweenMedia({ previousKind: "text" }), SLEEP_BETWEEN_MEDIA_FLOOR_MS);
});

Deno.test("sleepBetweenMedia: piso 800ms para imagem", () => {
  assertEquals(sleepBetweenMedia({ previousKind: "image" }), SLEEP_BETWEEN_MEDIA_FLOOR_MS);
});

Deno.test("sleepBetweenMedia: configuredDelayMs sobrescreve piso quando maior", () => {
  assertEquals(sleepBetweenMedia({ previousKind: "text", configuredDelayMs: 2000 }), 2000);
});

Deno.test("sleepBetweenMedia: configuredDelayMs ignorado quando menor que piso", () => {
  assertEquals(sleepBetweenMedia({ previousKind: "text", configuredDelayMs: 300 }), 800);
});

Deno.test("sleepBetweenMedia: áudio curto (5s) → 60% = 3000ms > piso", () => {
  assertEquals(sleepBetweenMedia({ previousKind: "audio", previousDurationMs: 5000 }), 3000);
});

Deno.test("sleepBetweenMedia: áudio muito curto (1s) → piso vence", () => {
  // 0.6 * 1000 = 600 < piso 800.
  assertEquals(sleepBetweenMedia({ previousKind: "audio", previousDurationMs: 1000 }), 800);
});

Deno.test("sleepBetweenMedia: vídeo longo (20s) → cap 8000ms aplicado", () => {
  // 0.6 * 20000 = 12000ms → capado em 8000.
  assertEquals(sleepBetweenMedia({ previousKind: "video", previousDurationMs: 20000 }), POST_AUDIO_VIDEO_CAP_MS);
});

Deno.test("sleepBetweenMedia: configuredDelay > postAv > piso", () => {
  // configuredDelay=10s vence post-roll 3s e piso 800ms.
  assertEquals(
    sleepBetweenMedia({ previousKind: "audio", previousDurationMs: 5000, configuredDelayMs: 10_000 }),
    10_000,
  );
});

Deno.test("sleepBetweenMedia: postAv ignorado para imagem mesmo com duração", () => {
  // Imagem não tem post-roll — duração é ignorada.
  assertEquals(
    sleepBetweenMedia({ previousKind: "image", previousDurationMs: 30_000 }),
    800,
  );
});

Deno.test("sleepBetweenMedia: PBT — sleep nunca menor que piso", () => {
  for (const kind of ["text", "image", "audio", "video", "document", "buttons"] as const) {
    for (let dur = 0; dur < 30_000; dur += 1000) {
      for (let cfg = 0; cfg < 5000; cfg += 500) {
        const ms = sleepBetweenMedia({
          previousKind: kind,
          previousDurationMs: dur,
          configuredDelayMs: cfg,
        });
        assert(
          ms >= SLEEP_BETWEEN_MEDIA_FLOOR_MS,
          `kind=${kind} dur=${dur} cfg=${cfg} → ${ms} < piso ${SLEEP_BETWEEN_MEDIA_FLOOR_MS}`,
        );
        // Cap absoluto: max(piso, configurado, cap_post_av) — nunca mais.
        const expectedCap = Math.max(SLEEP_BETWEEN_MEDIA_FLOOR_MS, cfg, POST_AUDIO_VIDEO_CAP_MS);
        assert(ms <= expectedCap, `kind=${kind} dur=${dur} cfg=${cfg} → ${ms} > cap ${expectedCap}`);
      }
    }
  }
});

Deno.test("sleepBetweenMedia: tolera entradas inválidas", () => {
  assertEquals(
    sleepBetweenMedia({ previousKind: "audio", previousDurationMs: -100, configuredDelayMs: -200 }),
    SLEEP_BETWEEN_MEDIA_FLOOR_MS,
  );
});

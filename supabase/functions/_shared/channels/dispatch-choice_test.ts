// PBT do `dispatch-choice` (Property 6 do design — Phase D Task 23).
// Verifica que `renderChoice` nunca emite kind='button' se supportsButtons=false.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderChoice, renderNumberedText } from "./dispatch-choice.ts";
import type { ChannelCapabilities, OutboundChoice } from "./types.ts";

function capsWith(overrides: Partial<ChannelCapabilities>): ChannelCapabilities {
  return {
    channel: "evolution",
    supportsButtons: true,
    maxButtons: 3,
    supportsList: false,
    supportsAudio: true,
    supportsVideo: true,
    supportsTypingPresence: true,
    supportsReactions: false,
    inboundIdField: "messageId",
    ...overrides,
  };
}

Deno.test("renderChoice: button + supports + <= maxButtons → button", () => {
  const r = renderChoice(
    "Escolha:",
    { preferred: "button", options: [{ id: "a", title: "A" }, { id: "b", title: "B" }] },
    capsWith({ supportsButtons: true, maxButtons: 3 }),
  );
  assertEquals(r.rendered.kind, "button");
  assertEquals(r.downgraded, false);
});

Deno.test("renderChoice: button + supportsButtons=false → texto + downgrade", () => {
  const r = renderChoice(
    "Escolha:",
    { preferred: "button", options: [{ id: "a", title: "A" }] },
    capsWith({ supportsButtons: false }),
  );
  assertEquals(r.rendered.kind, "text");
  assertEquals(r.downgraded, true);
  assertEquals(r.downgradeReason, "channel_no_button_support");
});

Deno.test("renderChoice: button + opções > maxButtons → texto + downgrade", () => {
  const r = renderChoice(
    "Escolha:",
    {
      preferred: "button",
      options: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
        { id: "c", title: "C" },
        { id: "d", title: "D" },
      ],
    },
    capsWith({ supportsButtons: true, maxButtons: 3 }),
  );
  assertEquals(r.rendered.kind, "text");
  assertEquals(r.downgraded, true);
  assertEquals(r.downgradeReason, "too_many_options");
});

Deno.test("renderChoice: list + supports → list", () => {
  const r = renderChoice(
    "Escolha:",
    { preferred: "list", options: [{ id: "a", title: "A" }] },
    capsWith({ supportsList: true }),
  );
  assertEquals(r.rendered.kind, "list");
});

Deno.test("renderChoice: list + supportsList=false → texto + downgrade", () => {
  const r = renderChoice(
    "Escolha:",
    { preferred: "list", options: [{ id: "a", title: "A" }] },
    capsWith({ supportsList: false }),
  );
  assertEquals(r.rendered.kind, "text");
  assertEquals(r.downgradeReason, "channel_no_list_support");
});

Deno.test("renderChoice: preferred=number → texto sem downgrade", () => {
  const r = renderChoice(
    "Escolha:",
    { preferred: "number", options: [{ id: "a", title: "A" }, { id: "b", title: "B" }] },
    capsWith({}),
  );
  assertEquals(r.rendered.kind, "text");
  assertEquals(r.downgraded, false);
});

// PBT manual: invariante "nunca emite button se !supportsButtons".
Deno.test("renderChoice: PBT — button NUNCA emerge sem supportsButtons", () => {
  for (const supportsButtons of [false]) {
    for (const max of [1, 3, 5]) {
      for (const preferred of ["button", "list", "number"] as const) {
        for (const optCount of [0, 1, 2, 3, 5]) {
          const opts = Array.from({ length: optCount }, (_, i) => ({ id: `o${i}`, title: `O${i}` }));
          const choice: OutboundChoice = { preferred, options: opts };
          const r = renderChoice("Q", choice, capsWith({ supportsButtons, maxButtons: max }));
          assert(r.rendered.kind !== "button", `Violação: rendered=button com supportsButtons=false (preferred=${preferred} max=${max} count=${optCount})`);
        }
      }
    }
  }
});

Deno.test("renderNumberedText: formato determinístico exato", () => {
  const t = renderNumberedText("Pergunta?", [
    { id: "a", title: "Opção A" },
    { id: "b", title: "Opção B" },
  ]);
  assertEquals(t, "Pergunta?\n\n*1.* Opção A\n*2.* Opção B\n\n_Digite o número da opção desejada._");
});

Deno.test("renderNumberedText: opções vazias retorna prompt cru", () => {
  assertEquals(renderNumberedText("Q", []), "Q");
});

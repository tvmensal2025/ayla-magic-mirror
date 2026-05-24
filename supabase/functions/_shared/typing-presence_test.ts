// Task 25 (whatsapp-flow-reliability-fix): testes do `withTypingPresence`.
// Verifica:
//  - presença é renovada enquanto `run` está em andamento;
//  - presença "paused" é enviada ao final (sucesso ou erro);
//  - falhas consecutivas pausam renovação (não floodam Evolution).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  withTypingPresence,
  TYPING_PRESENCE_RENEW_MS,
  type PresenceKind,
} from "./typing-presence.ts";

function spy() {
  const calls: PresenceKind[] = [];
  const fn = async (p: PresenceKind): Promise<boolean> => {
    calls.push(p);
    return true;
  };
  return { calls, fn };
}

Deno.test("withTypingPresence: chama presença inicial e final 'paused'", async () => {
  const s = spy();
  const result = await withTypingPresence({
    sendPresence: s.fn,
    presence: "composing",
    run: async () => "ok",
  });
  assertEquals(result, "ok");
  assertEquals(s.calls[0], "composing");
  assertEquals(s.calls[s.calls.length - 1], "paused");
});

Deno.test("withTypingPresence: renova durante run() longo", async () => {
  const s = spy();
  // run() de 3x o intervalo de renovação → esperamos 1 inicial + ~3 renovações + 1 paused.
  await withTypingPresence({
    sendPresence: s.fn,
    presence: "composing",
    run: async () => {
      await new Promise((r) => setTimeout(r, TYPING_PRESENCE_RENEW_MS * 3 + 200));
    },
  });
  // Pelo menos 4 chamadas: 1 inicial + 3 renovações + 1 paused = 5 (mas timing pode oscilar).
  // Garantimos >=3 composing e exatamente 1 paused no final.
  const composing = s.calls.filter((p) => p === "composing").length;
  const paused = s.calls.filter((p) => p === "paused").length;
  assert(composing >= 3, `esperava >=3 composing, obteve ${composing}: ${JSON.stringify(s.calls)}`);
  assert(paused >= 1, `esperava >=1 paused, obteve ${paused}`);
  assertEquals(s.calls[s.calls.length - 1], "paused");
});

Deno.test("withTypingPresence: sempre envia 'paused' mesmo quando run() lança", async () => {
  const s = spy();
  let thrown = false;
  try {
    await withTypingPresence({
      sendPresence: s.fn,
      presence: "composing",
      run: async () => {
        throw new Error("boom");
      },
    });
  } catch (e: any) {
    thrown = true;
    assertEquals(e.message, "boom");
  }
  assert(thrown, "exception deve propagar");
  assertEquals(s.calls[s.calls.length - 1], "paused");
});

Deno.test("withTypingPresence: falhas consecutivas pausam renovação", async () => {
  // sendPresence sempre retorna false → após 3 falhas, helper para de renovar.
  const calls: PresenceKind[] = [];
  const fn = async (p: PresenceKind): Promise<boolean> => {
    calls.push(p);
    return false; // simula Evolution offline
  };
  await withTypingPresence({
    sendPresence: fn,
    presence: "composing",
    run: async () => {
      await new Promise((r) => setTimeout(r, TYPING_PRESENCE_RENEW_MS * 5 + 200));
    },
  });
  // Após bater 3 falhas, paramos de chamar sendPresence (exceto o paused final).
  // Devemos ver no MÁXIMO ~4 composing + 1 paused.
  const composing = calls.filter((p) => p === "composing").length;
  assert(composing <= 5, `esperava no máximo 5 composing antes de pausar (${composing}): ${JSON.stringify(calls)}`);
});

Deno.test("withTypingPresence: presença 'recording' é respeitada", async () => {
  const s = spy();
  await withTypingPresence({
    sendPresence: s.fn,
    presence: "recording",
    run: async () => {},
  });
  // Inicial deve ser 'recording', final deve ser 'paused'.
  assertEquals(s.calls[0], "recording");
  assertEquals(s.calls[s.calls.length - 1], "paused");
});

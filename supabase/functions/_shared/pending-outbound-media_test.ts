// Task 27 (whatsapp-flow-reliability-fix): testes do split por budget.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { splitByBudget } from "./pending-outbound-media.ts";

Deno.test("splitByBudget: tudo cabe no orçamento", () => {
  const items = [
    { delay_before_ms: 1000 },
    { delay_before_ms: 2000 },
    { delay_before_ms: 3000 },
  ];
  const r = splitByBudget(items, 10_000);
  assertEquals(r.head.length, 3);
  assertEquals(r.tail.length, 0);
  assertEquals(r.spentMs, 6000);
});

Deno.test("splitByBudget: divide quando orçamento estoura", () => {
  const items = [
    { delay_before_ms: 20_000 },
    { delay_before_ms: 25_000 },
    { delay_before_ms: 10_000 },
  ];
  const r = splitByBudget(items, 50_000);
  // 20+25=45 cabe; +10 estoura; tail = [item3].
  assertEquals(r.head.length, 2);
  assertEquals(r.tail.length, 1);
  assertEquals(r.spentMs, 45_000);
});

Deno.test("splitByBudget: orçamento zero envia tudo pra tail", () => {
  const items = [{ delay_before_ms: 100 }, { delay_before_ms: 200 }];
  const r = splitByBudget(items, 0);
  assertEquals(r.head.length, 0);
  assertEquals(r.tail.length, 2);
});

Deno.test("splitByBudget: items sem delay são gratuitos", () => {
  const items = [{ delay_before_ms: 50_000 }, {}, {}, { delay_before_ms: 1000 }];
  const r = splitByBudget(items, 50_000);
  // 50_000 cabe; depois dois sem delay (=0) cabem; depois +1000 estoura → tail.
  assertEquals(r.head.length, 3);
  assertEquals(r.tail.length, 1);
});

Deno.test("splitByBudget: itens vazios", () => {
  const r = splitByBudget([], 50_000);
  assertEquals(r.head.length, 0);
  assertEquals(r.tail.length, 0);
  assertEquals(r.spentMs, 0);
});

Deno.test("splitByBudget: PRESERVA ORDEM original", () => {
  const items = [
    { delay_before_ms: 30_000, id: "a" },
    { delay_before_ms: 30_000, id: "b" },
    { delay_before_ms: 30_000, id: "c" },
  ];
  const r = splitByBudget(items, 50_000);
  // Só "a" cabe (30s), "b" estoura (60s>50s).
  assertEquals(r.head.map((i) => i.id), ["a"]);
  assertEquals(r.tail.map((i) => i.id), ["b", "c"]);
});

Deno.test("splitByBudget: itens AFTER budget overflow vão pra tail mesmo se sozinhos cabessem", () => {
  // Garante ordem total: depois que estoura uma vez, tudo vai pra cauda.
  // Senão a sequência ficaria fora de ordem.
  const items = [
    { delay_before_ms: 60_000, id: "a" },
    { delay_before_ms: 100, id: "b" },
  ];
  const r = splitByBudget(items, 50_000);
  // "a" estoura (sozinho) → vai para tail. "b" também vai, mesmo cabendo.
  assertEquals(r.head.length, 0);
  assertEquals(r.tail.map((i) => i.id), ["a", "b"]);
});

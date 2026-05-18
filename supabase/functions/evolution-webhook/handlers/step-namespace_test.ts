// Auditoria completa do namespace + routing — 20 cenários fictícios end-to-end.
// Simula o ciclo vida do customer.conversation_step do welcome até cadastro,
// passando pelo flow conversacional e voltando pro sys engine, validando que
// não há colisão UUID↔nome canônico nem loop "unknown step → restart".

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isFlowStep,
  normalizeOutgoing,
  routeEngine,
  stripPrefix,
} from "./step-namespace.ts";

const FAKE_UUID = "6226f6f3-1234-4abc-9def-1234567890ab";
const FAKE_PASSO = "passo_1715794512345";

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 1 — Customer novo (null) → sys/welcome
// ════════════════════════════════════════════════════════════════════
Deno.test("[01] customer novo (null) → sys engine, stripPrefix=welcome", () => {
  assertEquals(routeEngine(null), "sys");
  assertEquals(stripPrefix(null), "welcome");
  assertEquals(isFlowStep(null), false);
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 2 — Boas-vindas canônico
// ════════════════════════════════════════════════════════════════════
Deno.test("[02] welcome cru → sys engine, normalizeOutgoing(sys) preserva cru", () => {
  assertEquals(routeEngine("welcome"), "sys");
  assertEquals(normalizeOutgoing("welcome", "sys"), "welcome");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 3 — Qualificação canônica
// ════════════════════════════════════════════════════════════════════
Deno.test("[03] qualificacao → sys, mantém cru", () => {
  assertEquals(routeEngine("qualificacao"), "sys");
  assertEquals(normalizeOutgoing("qualificacao", "sys"), "qualificacao");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 4 — Aguardando conta (nome canônico longo)
// ════════════════════════════════════════════════════════════════════
Deno.test("[04] aguardando_conta → sys, sem prefixo", () => {
  assertEquals(routeEngine("aguardando_conta"), "sys");
  assertEquals(normalizeOutgoing("aguardando_conta", "sys"), "aguardando_conta");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 5 — UUID puro (legacy, sem prefixo) → flow (compat reversa)
// ════════════════════════════════════════════════════════════════════
Deno.test("[05] UUID legacy sem prefixo → flow engine (compat)", () => {
  assertEquals(routeEngine(FAKE_UUID), "flow");
  // Ao escrever via flow, deve adicionar prefixo
  assertEquals(normalizeOutgoing(FAKE_UUID, "flow"), `flow:${FAKE_UUID}`);
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 6 — passo_<ts> legacy → flow
// ════════════════════════════════════════════════════════════════════
Deno.test("[06] passo_<ts> legacy → flow engine", () => {
  assertEquals(routeEngine(FAKE_PASSO), "flow");
  assertEquals(normalizeOutgoing(FAKE_PASSO, "flow"), `flow:${FAKE_PASSO}`);
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 7 — flow:<uuid> já prefixado → continua flow, idempotente
// ════════════════════════════════════════════════════════════════════
Deno.test("[07] flow:<uuid> já prefixado é idempotente", () => {
  const v = `flow:${FAKE_UUID}`;
  assertEquals(routeEngine(v), "flow");
  assertEquals(isFlowStep(v), true);
  assertEquals(normalizeOutgoing(v, "flow"), v);
  assertEquals(stripPrefix(v), FAKE_UUID);
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 8 — flow handler devolve nome canônico (transição p/ cadastro)
// ════════════════════════════════════════════════════════════════════
Deno.test("[08] conversational devolve 'aguardando_conta' → mantém cru no flow engine", () => {
  // O conversational devolveu cadastro. normalizeOutgoing(flow) NÃO deve prefixar
  // porque não parece UUID — assim a próxima msg roteia pro sys engine
  assertEquals(normalizeOutgoing("aguardando_conta", "flow"), "aguardando_conta");
  assertEquals(routeEngine("aguardando_conta"), "sys");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 9 — null no engine flow → null
// ════════════════════════════════════════════════════════════════════
Deno.test("[09] normalizeOutgoing(null) sempre retorna null", () => {
  assertEquals(normalizeOutgoing(null, "sys"), null);
  assertEquals(normalizeOutgoing(null, "flow"), null);
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 10 — string vazia
// ════════════════════════════════════════════════════════════════════
Deno.test("[10] string vazia → sys engine, stripPrefix=welcome", () => {
  assertEquals(routeEngine(""), "sys");
  assertEquals(stripPrefix(""), "welcome");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 11 — UUID em maiúsculas
// ════════════════════════════════════════════════════════════════════
Deno.test("[11] UUID maiúsculo é reconhecido", () => {
  const upper = FAKE_UUID.toUpperCase();
  assertEquals(routeEngine(upper), "flow");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 12 — Etapa de edição (editing_conta_valor)
// ════════════════════════════════════════════════════════════════════
Deno.test("[12] editing_conta_valor → sys (canônico)", () => {
  assertEquals(routeEngine("editing_conta_valor"), "sys");
  assertEquals(normalizeOutgoing("editing_conta_valor", "sys"), "editing_conta_valor");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 13 — Etapa final 'complete'
// ════════════════════════════════════════════════════════════════════
Deno.test("[13] complete → sys", () => {
  assertEquals(routeEngine("complete"), "sys");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 14 — Pseudo-UUID inválido (formato errado) → sys
// ════════════════════════════════════════════════════════════════════
Deno.test("[14] string com hífens mas não UUID válido → sys", () => {
  // 7 chars no primeiro grupo, não UUID
  assertEquals(routeEngine("abcdefg-1234-4abc-9def-1234567890ab"), "sys");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 15 — flow: prefixo vazio (corner case)
// ════════════════════════════════════════════════════════════════════
Deno.test("[15] 'flow:' sem id → roteia flow, stripPrefix devolve string vazia", () => {
  assertEquals(routeEngine("flow:"), "flow");
  assertEquals(stripPrefix("flow:"), "");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 16 — Simulação fluxo completo PAULO (era o cliente travado)
// welcome → flow:UUID → aguardando_conta → editing_doc_menu → complete
// ════════════════════════════════════════════════════════════════════
Deno.test("[16] jornada completa PAULO sem loop", () => {
  let step: string | null = null;

  // msg 1: chega a primeira interação
  assertEquals(routeEngine(step), "sys");
  step = normalizeOutgoing("welcome", "sys");
  assertEquals(step, "welcome");

  // msg 2: bot-flow.ts entrega ao flow conversacional
  assertEquals(routeEngine(step), "sys");
  step = normalizeOutgoing(FAKE_UUID, "flow");
  assertEquals(step, `flow:${FAKE_UUID}`);

  // msg 3: conversational acha o step pelo UUID e transita p/ cadastro
  assertEquals(routeEngine(step), "flow");
  assertEquals(stripPrefix(step), FAKE_UUID);
  step = normalizeOutgoing("aguardando_conta", "flow");
  assertEquals(step, "aguardando_conta");

  // msg 4: roteia pro sys, OCR ok, vai pra editing_doc_menu
  assertEquals(routeEngine(step), "sys");
  step = normalizeOutgoing("editing_doc_menu", "sys");

  // msg 5: finaliza
  assertEquals(routeEngine(step), "sys");
  step = normalizeOutgoing("complete", "sys");
  assertEquals(step, "complete");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 17 — Fluxo só conversacional (consultor com flow custom completo)
// ════════════════════════════════════════════════════════════════════
Deno.test("[17] consultor com flow custom: várias transições flow→flow", () => {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  let step: string | null = null;
  for (const id of ids) {
    step = normalizeOutgoing(id, "flow");
    assertEquals(routeEngine(step), "flow");
    assertEquals(stripPrefix(step), id);
  }
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 18 — Volta sys após flow (cadastro disparado pelo flow)
// ════════════════════════════════════════════════════════════════════
Deno.test("[18] flow→sys→flow: ping-pong sem corromper estado", () => {
  let step: string | null = `flow:${FAKE_UUID}`;
  assertEquals(routeEngine(step), "flow");

  // flow disparou cadastro
  step = normalizeOutgoing("cadastro_pedir_conta", "flow");
  assertEquals(routeEngine(step), "sys");

  // sys terminou cadastro, devolve pro flow
  step = normalizeOutgoing(FAKE_UUID, "sys"); // sys engine guarda cru
  assertEquals(step, FAKE_UUID);
  assertEquals(routeEngine(step), "flow"); // mas a heurística reversa pega
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 19 — Reset manual via reset_lead_conversation
// ════════════════════════════════════════════════════════════════════
Deno.test("[19] reset → null → próxima msg roteia sys/welcome", () => {
  let step: string | null = `flow:${FAKE_UUID}`;
  assertEquals(routeEngine(step), "flow");
  step = null; // reset_lead_conversation zerou
  assertEquals(routeEngine(step), "sys");
  assertEquals(stripPrefix(step), "welcome");
});

// ════════════════════════════════════════════════════════════════════
// CENÁRIO 20 — Tentativa maliciosa de injection no step
// ════════════════════════════════════════════════════════════════════
Deno.test("[20] valores hostis (espaços, ;, --) → sys (não casa UUID nem passo_)", () => {
  assertEquals(routeEngine("welcome; DROP TABLE customers;"), "sys");
  assertEquals(routeEngine("  welcome  "), "sys");
  // garante que stripPrefix não quebra
  assertEquals(stripPrefix("welcome  "), "welcome  ");
});

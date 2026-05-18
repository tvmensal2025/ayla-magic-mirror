// Deno tests for the conversational rules-engine — cobre os bugs corrigidos
// nas Fases 1-4 do plano de hardening.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  _consumeCustomerRateLimit,
  evaluateRules,
  isRuleApplicable,
  normalize,
  tryMatchRule,
  type BotFlowRule,
} from "./rules-engine.ts";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<BotFlowRule> = {}): BotFlowRule {
  return {
    id: overrides.id || crypto.randomUUID(),
    flow_id: "flow-1",
    consultant_id: "consultant-1",
    name: overrides.name || "rule",
    match_mode: "contains",
    keywords: ["valor"],
    regex_pattern: null,
    normalize: true,
    min_word_boundary: false,
    priority: 10,
    scope: "global",
    scoped_step_ids: [],
    excluded_step_ids: [],
    response_text: "ok",
    media_id: null,
    return_behavior: "stay",
    goto_step_id: null,
    cooldown_seconds: 0,
    max_fires_per_conversation: null,
    is_active: true,
    ...overrides,
  };
}

// Minimal Supabase-like fluent stub. Reaproveita para qualquer .from().select()
// e captura a última query montada.
interface StubOpts {
  rules?: BotFlowRule[];
  fireCounts?: Record<string, number>; // rule_id → count
}

function makeSupabaseStub(opts: StubOpts) {
  const rules = opts.rules || [];
  const fireCounts = opts.fireCounts || {};

  return {
    from(table: string) {
      if (table === "bot_flow_rules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: rules, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "bot_flow_rule_fires") {
        return {
          select: (_cols: string, _opt: any) => ({
            eq: (_c1: string, ruleId: string) => ({
              eq: (_c2: string, _customerId: string) => {
                const count = fireCounts[ruleId] ?? 0;
                return Promise.resolve({ count, data: null, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// ────────────────────────────────────────────────────────────
// Pure matchers
// ────────────────────────────────────────────────────────────

Deno.test("tryMatchRule: keyword com menos de 2 chars é ignorada", () => {
  const rule = makeRule({ keywords: ["a", "b"] });
  assertEquals(tryMatchRule(rule, "qualquer mensagem com a letra a"), null);
});

Deno.test("tryMatchRule: keyword 'valor' casa em mensagem normalizada", () => {
  const rule = makeRule({ keywords: ["VALOR"] });
  assertEquals(tryMatchRule(rule, "Qual o vâlor da minha conta?"), "VALOR");
});

Deno.test("tryMatchRule: regex inválido não derruba", () => {
  const rule = makeRule({ match_mode: "regex", regex_pattern: "(", keywords: [] });
  assertEquals(tryMatchRule(rule, "qualquer coisa"), null);
});

Deno.test("normalize: remove acentos e baixa caixa", () => {
  assertEquals(normalize("Olá Mundo Çedilha"), "ola mundo cedilha");
});

Deno.test("isRuleApplicable: scope='step' só aplica em step listado", () => {
  const rule = makeRule({ scope: "step", scoped_step_ids: ["s1", "s2"] });
  assertEquals(isRuleApplicable(rule, "s1"), true);
  assertEquals(isRuleApplicable(rule, "s3"), false);
});

Deno.test("isRuleApplicable: excluded_step_ids bloqueia mesmo se global", () => {
  const rule = makeRule({ scope: "global", excluded_step_ids: ["welcome"] });
  assertEquals(isRuleApplicable(rule, "welcome"), false);
  assertEquals(isRuleApplicable(rule, "qualificacao"), true);
});

// ────────────────────────────────────────────────────────────
// Rate limit por cliente
// ────────────────────────────────────────────────────────────

Deno.test("_consumeCustomerRateLimit: 5 permitidos, 6º bloqueado em 60s", () => {
  const id = `rate-test-${crypto.randomUUID()}`;
  for (let i = 1; i <= 5; i++) {
    assert(_consumeCustomerRateLimit(id), `tentativa ${i} deveria passar`);
  }
  assertEquals(_consumeCustomerRateLimit(id), false);
});

// ────────────────────────────────────────────────────────────
// evaluateRules — integração com stub do Supabase
// ────────────────────────────────────────────────────────────

Deno.test("evaluateRules: hasCapture=true pula regras globais", async () => {
  const rule = makeRule({ keywords: ["valor"], scope: "global" });
  const supa = makeSupabaseStub({ rules: [rule] });
  const res = await evaluateRules({
    supabase: supa,
    flowId: "flow-1",
    consultantId: "consultant-1",
    customerId: "cust-1",
    currentStepId: "qualificacao",
    messageText: "trezentos reais é o valor",
    hasCapture: true,
  });
  assertEquals(res, null);
});

Deno.test("evaluateRules: hasCapture=true NÃO pula regras de escopo step", async () => {
  const rule = makeRule({
    keywords: ["valor"],
    scope: "step",
    scoped_step_ids: ["qualificacao"],
  });
  const supa = makeSupabaseStub({ rules: [rule] });
  const res = await evaluateRules({
    supabase: supa,
    flowId: "flow-1",
    consultantId: "consultant-1",
    customerId: "cust-1",
    currentStepId: "qualificacao",
    messageText: "qual o valor disso",
    hasCapture: true,
  });
  assert(res !== null);
  assertEquals(res!.matchedKeyword, "valor");
});

Deno.test("evaluateRules: max_fires_per_conversation=null aplica default 10", async () => {
  const rule = makeRule({ keywords: ["oi"], max_fires_per_conversation: null });
  const supa = makeSupabaseStub({
    rules: [rule],
    fireCounts: { [rule.id]: 10 }, // já no limite
  });
  const res = await evaluateRules({
    supabase: supa,
    flowId: "flow-1",
    consultantId: "consultant-1",
    customerId: "cust-1",
    currentStepId: "welcome",
    messageText: "oi tudo bem",
  });
  assertEquals(res, null);
});

Deno.test("evaluateRules: abaixo do limite default dispara normalmente", async () => {
  const rule = makeRule({ keywords: ["oi"], max_fires_per_conversation: null });
  const supa = makeSupabaseStub({
    rules: [rule],
    fireCounts: { [rule.id]: 9 },
  });
  const res = await evaluateRules({
    supabase: supa,
    flowId: "flow-1",
    consultantId: "consultant-1",
    customerId: "cust-1",
    currentStepId: "welcome",
    messageText: "oi tudo bem",
  });
  assert(res !== null);
  assertEquals(res!.rule.id, rule.id);
});

Deno.test("evaluateRules: cooldown bloqueia mesma regra dentro da janela", async () => {
  const rule = makeRule({ keywords: ["faq"], cooldown_seconds: 60 });
  const supa = makeSupabaseStub({ rules: [rule] });
  const res = await evaluateRules({
    supabase: supa,
    flowId: "flow-1",
    consultantId: "consultant-1",
    customerId: "cust-1",
    currentStepId: "welcome",
    messageText: "preciso de faq",
    lastRuleId: rule.id,
    lastRuleFireAt: new Date(Date.now() - 10_000).toISOString(),
  });
  assertEquals(res, null);
});

Deno.test("evaluateRules: mensagem muito curta (<2 chars) não avalia", async () => {
  const rule = makeRule({ keywords: ["oi"] });
  const supa = makeSupabaseStub({ rules: [rule] });
  const res = await evaluateRules({
    supabase: supa,
    flowId: "flow-1",
    consultantId: "consultant-1",
    customerId: "cust-1",
    currentStepId: "welcome",
    messageText: "a",
  });
  assertEquals(res, null);
});

Deno.test("evaluateRules: prioridade respeitada (menor primeiro)", async () => {
  const ruleHigh = makeRule({ keywords: ["foo"], priority: 1, name: "rule-prio-1" });
  const ruleLow = makeRule({ keywords: ["foo"], priority: 99, name: "rule-prio-99" });
  // O stub devolve na ordem que recebe; rules-engine pede order priority asc,
  // então simulamos a ordem já ordenada.
  const supa = makeSupabaseStub({ rules: [ruleHigh, ruleLow] });
  const res = await evaluateRules({
    supabase: supa,
    flowId: "flow-1",
    consultantId: "consultant-1",
    customerId: "cust-1",
    currentStepId: "welcome",
    messageText: "olha o foo",
  });
  assert(res !== null);
  assertEquals(res!.rule.id, ruleHigh.id);
});

// Tests for `_shared/grounding.ts` — bugfix
// `whatsapp-flow-reliability-fix`, task 5.
//
// Covers unit cases for sanitizer banned-phrase / numeric-grounding /
// link-grounding / length-cap, plus validateNextStep, filterMediaIds,
// validateAudioSlot, checkPreconditions and deterministicFallback. The
// PBTs validate the two universal invariants:
//
//   - sanitizeHumanReply never emits a number/URL that isn't backed by
//     `ctx` (it either preserves the input verbatim or returns "");
//   - filterMediaIds.kept ⊆ relevantIds for any (proposed, relevant)
//     pair.

import {
  assert,
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "https://esm.sh/fast-check@3.23.2";

import {
  checkPreconditions,
  deterministicFallback,
  filterMediaIds,
  type GroundingContext,
  isReachableFromCurrent,
  sanitizeHumanReply,
  STEP_PRECONDITIONS,
  validateAiFallbackChoice,
  validateAudioSlot,
  validateNextStep,
} from "./grounding.ts";

// ─── sanitizeHumanReply: unit ────────────────────────────────────────────

Deno.test("sanitizeHumanReply lets clean text through unchanged", () => {
  const out = sanitizeHumanReply("oii tudo bem com você?", {});
  assertEquals(out, "oii tudo bem com você?");
});

Deno.test("sanitizeHumanReply strips banned phrase 'sou assistente virtual'", () => {
  const out = sanitizeHumanReply(
    "sou uma assistente virtual da iGreen, posso te ajudar?",
    {},
  );
  assertEquals(out, "");
});

Deno.test("sanitizeHumanReply strips 'como IA' phrasing", () => {
  const out = sanitizeHumanReply(
    "como IA, eu não tenho opinião pessoal sobre isso",
    {},
  );
  assertEquals(out, "");
});

Deno.test("sanitizeHumanReply strips bot/robot self-references", () => {
  assertEquals(sanitizeHumanReply("eu sou um bot que responde rápido", {}), "");
  assertEquals(sanitizeHumanReply("sou um robô da iGreen", {}), "");
});

Deno.test("sanitizeHumanReply strips 'preço de R$' generic claim", () => {
  const out = sanitizeHumanReply("o preço de R$ varia conforme a região", {});
  assertEquals(out, "");
});

Deno.test("sanitizeHumanReply removes 🤖 emoji", () => {
  const out = sanitizeHumanReply("🤖 oii tudo bem", {});
  assertEquals(out, "oii tudo bem");
});

Deno.test("sanitizeHumanReply zeros price not in knowledge", () => {
  const ctx: GroundingContext = {
    knowledgeSections: [
      { title: "Plano", body: "Estamos atendendo cidades do interior." },
    ],
  };
  const out = sanitizeHumanReply("vai te custar R$ 250 por mês", ctx);
  assertEquals(out, "");
});

Deno.test("sanitizeHumanReply lets price through when present in knowledge", () => {
  const ctx: GroundingContext = {
    knowledgeSections: [
      { title: "Mensalidade", body: "A taxa é de R$ 250,00 ao mês." },
    ],
  };
  const out = sanitizeHumanReply("a mensalidade é R$ 250", ctx);
  assertEquals(out, "a mensalidade é R$ 250");
});

Deno.test("sanitizeHumanReply lets percentage through when grounded in knowledge", () => {
  const ctx: GroundingContext = {
    knowledgeSections: [
      { body: "A economia é de 18% sobre a fatura atual." },
    ],
  };
  const out = sanitizeHumanReply("vc economiza 18% na conta", ctx);
  assertEquals(out, "vc economiza 18% na conta");
});

Deno.test("sanitizeHumanReply zeros percentage not in knowledge", () => {
  const out = sanitizeHumanReply("vc economiza 35% na conta", {
    knowledgeSections: [{ body: "Economia média de 18%." }],
  });
  assertEquals(out, "");
});

Deno.test("sanitizeHumanReply accepts numbers from customer fields", () => {
  const ctx: GroundingContext = {
    customer: { electricity_bill_value: 350 },
  };
  const out = sanitizeHumanReply("sua conta é R$ 350 esse mês", ctx);
  assertEquals(out, "sua conta é R$ 350 esse mês");
});

Deno.test("sanitizeHumanReply zeros link with disallowed host", () => {
  const ctx: GroundingContext = { allowedDomains: ["igreen.energy"] };
  const out = sanitizeHumanReply(
    "olha o link: https://golpista.com/promocao",
    ctx,
  );
  assertEquals(out, "");
});

Deno.test("sanitizeHumanReply allows link from allowed domain (and subdomain)", () => {
  const ctx: GroundingContext = { allowedDomains: ["igreen.energy"] };
  assertEquals(
    sanitizeHumanReply("acessa https://igreen.energy/portal", ctx),
    "acessa https://igreen.energy/portal",
  );
  assertEquals(
    sanitizeHumanReply("entra em https://app.igreen.energy/login", ctx),
    "entra em https://app.igreen.energy/login",
  );
});

Deno.test("sanitizeHumanReply truncates to 280 chars", () => {
  const long = "a".repeat(400);
  const out = sanitizeHumanReply(long, {});
  assertEquals(out.length, 280);
});

Deno.test("sanitizeHumanReply returns '' for empty input", () => {
  assertEquals(sanitizeHumanReply("", {}), "");
  assertEquals(sanitizeHumanReply("   ", {}), "");
});

// ─── validateNextStep: unit ──────────────────────────────────────────────

const VALID = new Set(["welcome", "qualificacao", "apresentacao", "cadastro_portal"]);

Deno.test("validateNextStep returns proposed when valid", () => {
  assertEquals(validateNextStep("apresentacao", VALID, "welcome"), "apresentacao");
});

Deno.test("validateNextStep falls back to current when invalid", () => {
  assertEquals(validateNextStep("ramo_inexistente", VALID, "welcome"), "welcome");
});

Deno.test("validateNextStep falls back to current when undefined/empty", () => {
  assertEquals(validateNextStep(undefined, VALID, "welcome"), "welcome");
  assertEquals(validateNextStep("   ", VALID, "qualificacao"), "qualificacao");
});

// ─── filterMediaIds: unit ────────────────────────────────────────────────

Deno.test("filterMediaIds keeps only valid IDs and reports dropped", () => {
  const relevant = new Set(["m1", "m2", "m3"]);
  const r = filterMediaIds(["m1", "m9", "m2", "fake"], relevant);
  assertEquals(r.kept, ["m1", "m2"]);
  assertEquals(r.dropped, ["m9", "fake"]);
});

Deno.test("filterMediaIds handles undefined/empty", () => {
  const relevant = new Set(["m1"]);
  assertEquals(filterMediaIds(undefined, relevant), { kept: [], dropped: [] });
  assertEquals(filterMediaIds([], relevant), { kept: [], dropped: [] });
});

Deno.test("filterMediaIds skips empty entries silently", () => {
  const relevant = new Set(["m1"]);
  const r = filterMediaIds(["", "  ", "m1"], relevant);
  assertEquals(r.kept, ["m1"]);
  assertEquals(r.dropped, []);
});

// ─── validateAudioSlot: unit ─────────────────────────────────────────────

const SLOTS = new Set(["boas_vindas", "objecao_preco", "fechamento"]);

Deno.test("validateAudioSlot returns slot when valid", () => {
  assertEquals(validateAudioSlot("objecao_preco", SLOTS, "qualificacao"), "objecao_preco");
});

Deno.test("validateAudioSlot recovers to 'boas_vindas' on invalid + welcome", () => {
  assertEquals(validateAudioSlot("xyz_invalid", SLOTS, "welcome"), "boas_vindas");
});

Deno.test("validateAudioSlot returns '' on invalid + non-welcome", () => {
  assertEquals(validateAudioSlot("xyz_invalid", SLOTS, "qualificacao"), "");
});

Deno.test("validateAudioSlot returns '' on empty input + non-welcome", () => {
  assertEquals(validateAudioSlot(undefined, SLOTS, "qualificacao"), "");
  assertEquals(validateAudioSlot("", SLOTS, "qualificacao"), "");
});

Deno.test("validateAudioSlot returns 'boas_vindas' on empty + welcome", () => {
  assertEquals(validateAudioSlot(undefined, SLOTS, "welcome"), "boas_vindas");
});

Deno.test("validateAudioSlot returns '' when 'boas_vindas' isn't in valid set even on welcome", () => {
  const slots = new Set(["fechamento"]);
  assertEquals(validateAudioSlot("xyz", slots, "welcome"), "");
});

// ─── checkPreconditions: unit ────────────────────────────────────────────

Deno.test("checkPreconditions allows step without configured guard", () => {
  const r = checkPreconditions("welcome", {});
  assertEquals(r.ok, true);
});

Deno.test("checkPreconditions: aguardando_facial requires otp_validated_at", () => {
  assertEquals(checkPreconditions("aguardando_facial", {}).ok, false);
  assertEquals(
    checkPreconditions("aguardando_facial", { otp_validated_at: "2024-01-01T10:00:00Z" }).ok,
    true,
  );
});

Deno.test("checkPreconditions: cadastro_portal requires bill + document", () => {
  assertEquals(checkPreconditions("cadastro_portal", {}).ok, false);
  assertEquals(
    checkPreconditions("cadastro_portal", { electricity_bill_value: 350 }).ok,
    false,
  );
  assertEquals(
    checkPreconditions("cadastro_portal", {
      electricity_bill_value: 350,
      document_uploaded: true,
    }).ok,
    true,
  );
});

Deno.test("STEP_PRECONDITIONS exposes the documented keys", () => {
  assertEquals(typeof STEP_PRECONDITIONS.aguardando_facial, "function");
  assertEquals(typeof STEP_PRECONDITIONS.cadastro_portal, "function");
});

// ─── deterministicFallback: unit ─────────────────────────────────────────

Deno.test("deterministicFallback returns default phrase without templates", () => {
  const d = deterministicFallback("welcome");
  assertEquals(d.reply_text, "oii 😊 me dá um instantinho que eu te respondo");
  assertEquals(d.next_step, "welcome");
  assertEquals(d.media_to_send_ids, []);
  assertEquals(d.audio_slot_key, "");
  assertEquals(d.should_pause_seconds, 0);
});

Deno.test("deterministicFallback uses step template when available", () => {
  const tpl = { qualificacao: "me conta sua cidade pra eu seguir 😊" };
  const d = deterministicFallback("qualificacao", tpl);
  assertEquals(d.reply_text, "me conta sua cidade pra eu seguir 😊");
  assertEquals(d.next_step, "qualificacao");
});

Deno.test("deterministicFallback ignores empty template and uses default", () => {
  const d = deterministicFallback("welcome", { welcome: "   " });
  assertEquals(d.reply_text, "oii 😊 me dá um instantinho que eu te respondo");
});

// ─── PBT 1: sanitizer never emits ungrounded number / URL ───────────────

/**
 * **Validates: Requirements 2.27**
 *
 * For arbitrary text combining a "filler" portion with either a price
 * or a URL whose host is NOT in `allowedDomains`, the sanitizer either
 * returns "" or returns text that does not contain that price/URL. We
 * carefully construct ctx so the offending token is provably ungrounded
 * (no overlap with allowedDigits / allowedDomains).
 *
 * NOTE: the implementation is conservative — when an ungrounded number
 * or link is detected, it returns "" (full scrub). The property checks
 * the strictly weaker invariant "output does not leak the offending
 * token", which would also accept a future implementation that
 * surgically removes only the bad spans.
 */
const fillerArb = fc.string({ minLength: 0, maxLength: 60 }).filter(
  (s) => !/(http|R\$|%|\d)/i.test(s),
);

const priceArb = fc
  .integer({ min: 100, max: 99_999 })
  .map((n) => `R$ ${n}`);

const linkArb = fc
  .constantFrom(
    "https://golpista.com/oferta",
    "https://outrodominio.net/x",
    "https://promo-fake.io/abc",
    "http://nao-permitido.com.br/",
  );

Deno.test("PBT: sanitizer never leaks an ungrounded price", () => {
  fc.assert(
    fc.property(fillerArb, fillerArb, priceArb, (a, b, price) => {
      // Empty knowledge / allowedNumbers → digits in `price` are NOT
      // grounded.
      const ctx: GroundingContext = {
        knowledgeSections: [{ body: "conteúdo sem números." }],
        allowedNumbers: [],
        allowedDomains: ["igreen.energy"],
      };
      const text = `${a} ${price} ${b}`.trim();
      const out = sanitizeHumanReply(text, ctx);
      // The price digits must not appear in the output (or output is empty).
      const priceDigits = price.replace(/\D+/g, "");
      return out === "" || !out.includes(priceDigits);
    }),
    { numRuns: 50 },
  );
});

Deno.test("PBT: sanitizer never leaks a link from a disallowed host", () => {
  fc.assert(
    fc.property(fillerArb, fillerArb, linkArb, (a, b, link) => {
      const ctx: GroundingContext = {
        allowedDomains: ["igreen.energy"],
      };
      const text = `${a} ${link} ${b}`.trim();
      const out = sanitizeHumanReply(text, ctx);
      return out === "" || !out.includes(link);
    }),
    { numRuns: 50 },
  );
});

Deno.test("PBT: clean grounded text round-trips (subset of input, ≤280 chars)", () => {
  // For a "safe" filler with no numbers/links/banned phrases, the
  // sanitizer either returns the trimmed input verbatim or its 280-char
  // prefix. We verify that the output is a prefix of the trimmed input
  // and len ≤ 280.
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 350 }).filter((s) => {
        const trimmed = s.trim();
        if (!trimmed) return false;
        if (/(http|R\$|%|\d)/i.test(trimmed)) return false;
        if (/(assistente|bot|rob[oô]|inteligência|fico (à|a)|como posso)/i.test(trimmed)) return false;
        if (/🤖/.test(trimmed)) return false;
        return true;
      }),
      (text) => {
        const out = sanitizeHumanReply(text, {});
        const trimmed = text.trim();
        if (out === "") return true; // permissive
        return out.length <= 280 && trimmed.startsWith(out);
      },
    ),
    { numRuns: 50 },
  );
});

// ─── PBT 2: filterMediaIds.kept ⊆ relevantIds ───────────────────────────

/**
 * **Validates: Requirements 2.28**
 *
 * For arbitrary `proposed` arrays and a randomly-built `relevantIds`
 * set, every element in `kept` is in `relevantIds`, and the partition
 * preserves cardinality (no duplicates introduced, no entries
 * silently dropped beyond empty strings).
 */
Deno.test("PBT: filterMediaIds.kept ⊆ relevantIds", () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 20 }),
      fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 10 }),
      (proposed, relevantArr) => {
        const relevant = new Set(relevantArr);
        const r = filterMediaIds(proposed, relevant);
        // Every kept ID is in relevant.
        for (const id of r.kept) {
          if (!relevant.has(id)) return false;
        }
        // Every dropped ID is NOT in relevant.
        for (const id of r.dropped) {
          if (relevant.has(id)) return false;
        }
        // Partition is exhaustive over non-empty proposed entries.
        const nonEmpty = proposed
          .map((s) => String(s ?? "").trim())
          .filter((s) => s.length > 0);
        return r.kept.length + r.dropped.length === nonEmpty.length;
      },
    ),
    { numRuns: 50 },
  );
});

// Ensure assertStrictEquals stays imported (used implicitly by ⇡ assertions in
// future expansions). Suppress unused warning.
void assertStrictEquals;
void assert;

// ─── isReachableFromCurrent: unit ────────────────────────────────────────

Deno.test("isReachableFromCurrent: same step is always reachable (no-op)", () => {
  assertEquals(isReachableFromCurrent("welcome", "welcome", []), true);
});

Deno.test("isReachableFromCurrent: REPEAT is always reachable", () => {
  assertEquals(isReachableFromCurrent("REPEAT", "qualificacao", []), true);
});

Deno.test("isReachableFromCurrent: special uppercase choices (HUMANO/CADASTRO/MENU)", () => {
  assertEquals(isReachableFromCurrent("HUMANO", "welcome", []), true);
  assertEquals(isReachableFromCurrent("CADASTRO", "welcome", []), true);
  assertEquals(isReachableFromCurrent("MENU", "welcome", []), true);
});

Deno.test("isReachableFromCurrent: explicit special goto in specialGotos list", () => {
  assertEquals(
    isReachableFromCurrent("cadastro", "welcome", [], ["cadastro", "humano"]),
    true,
  );
  assertEquals(
    isReachableFromCurrent("humano", "welcome", [], ["cadastro", "humano"]),
    true,
  );
});

Deno.test("isReachableFromCurrent: matches transition.next_step_key", () => {
  const transitions = [
    { next_step_key: "qualificacao" },
    { next_step_key: "objecao_preco" },
  ];
  assertEquals(isReachableFromCurrent("qualificacao", "welcome", transitions), true);
  assertEquals(isReachableFromCurrent("objecao_preco", "welcome", transitions), true);
});

Deno.test("isReachableFromCurrent: matches transition.goto_step_key (alt column)", () => {
  const transitions = [{ goto_step_key: "fechamento" }];
  assertEquals(isReachableFromCurrent("fechamento", "welcome", transitions), true);
});

Deno.test("isReachableFromCurrent: matches transition.goto_special", () => {
  const transitions = [{ goto_special: "humano" }];
  assertEquals(isReachableFromCurrent("humano", "welcome", transitions), true);
});

Deno.test("isReachableFromCurrent: returns false for unreachable step", () => {
  const transitions = [{ next_step_key: "qualificacao" }];
  assertEquals(
    isReachableFromCurrent("cadastro_portal", "welcome", transitions),
    false,
  );
});

Deno.test("isReachableFromCurrent: returns false for empty/undefined input", () => {
  assertEquals(isReachableFromCurrent(undefined, "welcome", []), false);
  assertEquals(isReachableFromCurrent("", "welcome", []), false);
  assertEquals(isReachableFromCurrent("   ", "welcome", []), false);
});

Deno.test("isReachableFromCurrent: tolerates null/undefined transitions", () => {
  assertEquals(isReachableFromCurrent("welcome", "welcome", null), true);
  assertEquals(isReachableFromCurrent("welcome", "welcome", undefined), true);
});

// ─── validateAiFallbackChoice: unit (cláusulas 2.19 + 2.31) ──────────────

Deno.test("validateAiFallbackChoice: reachable step passes through unchanged", () => {
  const r = validateAiFallbackChoice(
    "qualificacao",
    "welcome",
    [{ next_step_key: "qualificacao" }],
    {},
  );
  assertEquals(r.choice, "qualificacao");
  assertEquals(r.downgradeReason, undefined);
});

Deno.test("validateAiFallbackChoice: unreachable step falls back to REPEAT", () => {
  const r = validateAiFallbackChoice(
    "cadastro_portal",
    "welcome",
    [{ next_step_key: "qualificacao" }],
    { electricity_bill_value: 350, document_uploaded: true },
  );
  assertEquals(r.choice, "REPEAT");
  assertEquals(r.downgradeReason, "unreachable");
  assertEquals(r.failedStep, "cadastro_portal");
});

Deno.test("validateAiFallbackChoice: reachable but precondition fails → REPEAT", () => {
  const r = validateAiFallbackChoice(
    "cadastro_portal",
    "qualificacao",
    [{ next_step_key: "cadastro_portal" }],
    {}, // sem bill, sem document → precondição falha
  );
  assertEquals(r.choice, "REPEAT");
  assertEquals(r.downgradeReason, "precondition_failed");
  assertEquals(r.failedStep, "cadastro_portal");
  assertEquals(r.preconditionReason, "precondition_failed:cadastro_portal");
});

Deno.test("validateAiFallbackChoice: reachable with precondition met passes", () => {
  const r = validateAiFallbackChoice(
    "cadastro_portal",
    "qualificacao",
    [{ next_step_key: "cadastro_portal" }],
    { electricity_bill_value: 350, document_uploaded: true },
  );
  assertEquals(r.choice, "cadastro_portal");
  assertEquals(r.downgradeReason, undefined);
});

Deno.test("validateAiFallbackChoice: special uppercase REPEAT passes through", () => {
  const r = validateAiFallbackChoice("REPEAT", "welcome", [], {});
  assertEquals(r.choice, "REPEAT");
  assertEquals(r.downgradeReason, undefined);
});

Deno.test("validateAiFallbackChoice: special uppercase HUMANO/CADASTRO passes through", () => {
  // HUMANO/CADASTRO/MENU são convenções do aiDecideFallback que o caller resolve
  // para um caminho específico (handoff humano, redirect cadastro). Não checamos
  // pré-condições nelas — são "escolhas especiais" e não step_keys reais.
  const a = validateAiFallbackChoice("HUMANO", "welcome", [], {});
  assertEquals(a.choice, "HUMANO");
  assertEquals(a.downgradeReason, undefined);

  const b = validateAiFallbackChoice("CADASTRO", "welcome", [], {});
  assertEquals(b.choice, "CADASTRO");
  assertEquals(b.downgradeReason, undefined);
});

Deno.test("validateAiFallbackChoice: empty proposed → REPEAT", () => {
  assertEquals(validateAiFallbackChoice("", "welcome", [], {}).choice, "REPEAT");
  assertEquals(validateAiFallbackChoice(undefined, "welcome", [], {}).choice, "REPEAT");
  assertEquals(validateAiFallbackChoice(null, "welcome", [], {}).choice, "REPEAT");
});

Deno.test("validateAiFallbackChoice: aguardando_facial requires otp_validated_at", () => {
  // reachable mas sem OTP → REPEAT
  const a = validateAiFallbackChoice(
    "aguardando_facial",
    "validando_otp",
    [{ next_step_key: "aguardando_facial" }],
    {},
  );
  assertEquals(a.choice, "REPEAT");
  assertEquals(a.downgradeReason, "precondition_failed");

  // reachable + OTP → passa
  const b = validateAiFallbackChoice(
    "aguardando_facial",
    "validando_otp",
    [{ next_step_key: "aguardando_facial" }],
    { otp_validated_at: "2024-01-01T10:00:00Z" },
  );
  assertEquals(b.choice, "aguardando_facial");
});

Deno.test("validateAiFallbackChoice: special goto via goto_special is reachable", () => {
  const r = validateAiFallbackChoice(
    "humano",
    "welcome",
    [{ goto_special: "humano" }],
    {},
    ["cadastro", "humano"],
  );
  assertEquals(r.choice, "humano");
  assertEquals(r.downgradeReason, undefined);
});

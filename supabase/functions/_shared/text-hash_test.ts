// Tests for the normalized text hash used by the anti-dup probe in
// `evolution-webhook/index.ts` (Task 9 of whatsapp-flow-reliability-fix).
//
// The hash MUST collide for inputs that differ only in whitespace / case /
// leading/trailing whitespace, and MUST be deterministic. Both invariants
// are required for the runtime to use the SHA-256 prefix as an equality
// probe on `conversations.message_text_hash` (a GENERATED STORED column —
// see migration §4.10). The Postgres expression and the JS oracle in
// `text-hash.ts` MUST agree byte-for-byte; these tests cover the JS side.

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "https://esm.sh/fast-check@3.23.2";

import { computeMessageTextHash, normalizeMessageText } from "./text-hash.ts";

// ─── Unit: normalizeMessageText ─────────────────────────────────────────

Deno.test("normalizeMessageText collapses whitespace runs to single space", () => {
  assertEquals(normalizeMessageText("a   b\t\tc\n\nd"), "a b c d");
});

Deno.test("normalizeMessageText trims leading/trailing whitespace", () => {
  assertEquals(normalizeMessageText("   hello world   "), "hello world");
  assertEquals(normalizeMessageText("\n\thi\n"), "hi");
});

Deno.test("normalizeMessageText lowercases", () => {
  assertEquals(normalizeMessageText("Hello WORLD"), "hello world");
});

Deno.test("normalizeMessageText handles null/undefined/empty", () => {
  assertEquals(normalizeMessageText(null), "");
  assertEquals(normalizeMessageText(undefined), "");
  assertEquals(normalizeMessageText(""), "");
  assertEquals(normalizeMessageText("   "), "");
});

// ─── Unit: computeMessageTextHash ───────────────────────────────────────

Deno.test("computeMessageTextHash is deterministic", async () => {
  const a = await computeMessageTextHash("oii 😊 tudo bem?");
  const b = await computeMessageTextHash("oii 😊 tudo bem?");
  assertEquals(a, b);
});

Deno.test("computeMessageTextHash returns 32-char lowercase hex", async () => {
  const h = await computeMessageTextHash("anything");
  assertEquals(h.length, 32);
  assertMatch(h, /^[0-9a-f]{32}$/);
});

Deno.test("computeMessageTextHash collides for case-only differences", async () => {
  const lower = await computeMessageTextHash("hello world");
  const upper = await computeMessageTextHash("HELLO WORLD");
  const mixed = await computeMessageTextHash("Hello World");
  assertEquals(lower, upper);
  assertEquals(lower, mixed);
});

Deno.test("computeMessageTextHash collides for whitespace-only differences", async () => {
  const a = await computeMessageTextHash("oi tudo bem");
  const b = await computeMessageTextHash("oi   tudo\tbem");
  const c = await computeMessageTextHash("oi\n\ntudo bem");
  assertEquals(a, b);
  assertEquals(a, c);
});

Deno.test("computeMessageTextHash collides for leading/trailing whitespace", async () => {
  const a = await computeMessageTextHash("hello");
  const b = await computeMessageTextHash("   hello");
  const c = await computeMessageTextHash("hello   ");
  const d = await computeMessageTextHash("\thello\n");
  assertEquals(a, b);
  assertEquals(a, c);
  assertEquals(a, d);
});

Deno.test("computeMessageTextHash separates inputs that differ in non-normalized chars", async () => {
  // Genuinely different content (different letters) must NOT collide.
  const a = await computeMessageTextHash("hello world");
  const b = await computeMessageTextHash("hello world!");
  assertNotEquals(a, b);
});

Deno.test("computeMessageTextHash treats null/undefined/empty as same hash (coalesce)", async () => {
  const empty = await computeMessageTextHash("");
  const nul = await computeMessageTextHash(null);
  const und = await computeMessageTextHash(undefined);
  const wsp = await computeMessageTextHash("   \n\t  ");
  assertEquals(empty, nul);
  assertEquals(empty, und);
  // Whitespace-only normalizes to "" too — same coalesce target.
  assertEquals(empty, wsp);
});

// ─── PBT — Validates: Requirements 2.8 ──────────────────────────────────
//
// **Validates: Requirements 2.8** — The anti-dup over the last 60s in
// `conversations` must consider two messages equal when they differ only
// in whitespace / case / emoji variation selectors / leading-trailing
// whitespace. The PBT generates a list of tokens (no internal whitespace),
// joins them with single spaces to make the "canonical" string, and
// joins the same tokens with arbitrary whitespace runs (plus random
// leading/trailing whitespace and per-character case flips) to make
// the "augmented" string. By construction both normalize to the same
// value, so their hashes MUST match.

// Tokens are non-whitespace strings drawn from a small alphabet that
// includes ASCII letters/digits, common Portuguese punctuation, and an
// emoji or two — exactly the kind of content the WhatsApp bot replies
// with. fast-check shrinking stays effective because length and arity
// stay bounded.
const tokenCharArb = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyz0123456789?!.,😊🌟".split(""),
);
const tokenArb = fc.array(tokenCharArb, { minLength: 1, maxLength: 8 })
  .map((cs) => cs.join(""));

const tokensArb = fc.array(tokenArb, { minLength: 1, maxLength: 6 });

// A run of whitespace characters of length 1..4. Used between tokens
// to verify the "whitespace runs collapse" invariant.
const whitespaceRunArb = fc.array(
  fc.constantFrom(" ", "\t", "\n", "\r", "  "),
  { minLength: 1, maxLength: 4 },
).map((parts) => parts.join(""));

// May be empty — for leading/trailing where empty is a valid case too.
const optionalWhitespaceArb = fc.oneof(
  fc.constant(""),
  whitespaceRunArb,
);

// Flip case (best-effort) for each char given a list of booleans cycled
// over positions. Toggling case for whitespace is a no-op so we don't
// special-case it.
function applyCaseFlips(s: string, flips: boolean[]): string {
  if (flips.length === 0) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (flips[i % flips.length]) {
      const upper = c.toUpperCase();
      const lower = c.toLowerCase();
      out += upper !== c ? upper : lower;
    } else {
      out += c;
    }
  }
  return out;
}

Deno.test(
  "PBT: hash collides for inputs that differ only in whitespace/case/leading-trailing",
  async () => {
    await fc.assert(
      fc.asyncProperty(
        tokensArb,
        // One whitespace run per gap between tokens; if the array is
        // shorter than the gaps we cycle through it in `joinWith`.
        fc.array(whitespaceRunArb, { minLength: 1, maxLength: 6 }),
        fc.array(fc.boolean(), { minLength: 0, maxLength: 8 }),
        optionalWhitespaceArb,
        optionalWhitespaceArb,
        async (tokens, runs, flips, leading, trailing) => {
          // Canonical: tokens joined with single ASCII space — already
          // in normalized form modulo case.
          const canonical = tokens.join(" ");

          // Augmented: tokens joined with arbitrary whitespace runs,
          // case flipped per position, optional leading/trailing
          // whitespace.
          let augmented = "";
          for (let i = 0; i < tokens.length; i++) {
            augmented += tokens[i];
            if (i < tokens.length - 1) {
              augmented += runs[i % runs.length];
            }
          }
          augmented = leading + applyCaseFlips(augmented, flips) + trailing;

          const expected = await computeMessageTextHash(canonical);
          const actual = await computeMessageTextHash(augmented);
          return expected === actual;
        },
      ),
      { numRuns: 200 },
    );
  },
);

// PBT: distinct cores (after normalization) MUST hash to distinct values.
// Sanity check; a real SHA-256-prefix collision in 200 runs is
// astronomically unlikely, so the property is "if normalized forms
// differ, hashes differ".
Deno.test(
  "PBT: distinct normalized inputs produce distinct hashes (no spurious collisions)",
  async () => {
    await fc.assert(
      fc.asyncProperty(
        tokensArb,
        tokensArb,
        async (a, b) => {
          const na = normalizeMessageText(a.join(" "));
          const nb = normalizeMessageText(b.join(" "));
          if (na === nb) return true; // not a counter-example
          const ha = await computeMessageTextHash(a.join(" "));
          const hb = await computeMessageTextHash(b.join(" "));
          return ha !== hb;
        },
      ),
      { numRuns: 200 },
    );
  },
);

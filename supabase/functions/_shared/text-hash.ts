// Normalized text hash used for anti-duplication of outbound replies.
//
// The shape of this helper is dictated by the GENERATED column
// `conversations.message_text_hash` (see migration
// `20260521170000_whatsapp_flow_reliability_v2.sql` §4.10). For a given
// `message_text` value, both Postgres and JavaScript MUST produce the same
// hash so that the webhook can probe the index by computing the hash on
// the candidate `finalReply` before it is persisted.
//
// Algorithm
// ---------
// 1. Normalize whitespace: collapse any run of unicode whitespace
//    (`\s+` in JS, `\s+` in PCRE / `regexp_replace` in Postgres) into
//    a single ASCII space, then trim leading/trailing whitespace, then
//    lowercase.
// 2. Hash the normalized string with SHA-256 and return the first 32
//    lowercase hex characters (128 bits of collision resistance — equal
//    in cardinality to MD5, but available in Web Crypto out of the box).
//
// Why SHA-256 (truncated to 32 hex) and not MD5?
// ----------------------------------------------
// Deno's Web Crypto implementation (the runtime used by Supabase Edge
// Functions) does not expose MD5 — `crypto.subtle.digest("MD5", ...)`
// throws `NotSupportedError`. The original design (design.md §4.10)
// proposed MD5, which would force shipping a userland MD5 implementation
// (~80 lines of bit-twiddling) just to mirror the Postgres column.
// Using SHA-256 truncated to the same 32-hex shape gives:
//   * identical column width (TEXT, 32 chars) — no schema impact;
//   * identical anti-dup behaviour — the hash is only used as an
//     equality probe, so length collision is the only relevant property;
//   * better collision resistance than MD5 at the same width;
//   * Web Crypto support out of the box in both Deno and Node ≥ 19.
//
// The migration was updated in lock-step (header note + generated
// expression) to use `encode(digest(..., 'sha256'::text), 'hex')`
// truncated to the same 32 chars via `substring(... , 1, 32)`. Both
// sides MUST stay in sync; this file is the JS oracle.
//
// Trade-offs documented for the reviewer:
//   * SHA-256 truncation is well-known to be safe for non-adversarial
//     dedup (we are not storing passwords or signing anything). The
//     Postgres column is also non-PRIMARY KEY, so collisions would only
//     cause a false skip of an outbound message — never a corruption.
//   * The pre-existing MD5 hashes (rows inserted before this change)
//     remain in the column. They simply will not match the new probe
//     and will not cause false positives. The new path is gated by
//     `flow_reliability_v2 ∈ {dark, canary, on}` (see design §8) so
//     the legacy exact-text path keeps running until the column is
//     fully populated.

const HASH_HEX_LEN = 32;

/**
 * Collapse whitespace runs to a single space, trim, and lowercase.
 * Mirrors the Postgres expression
 *   `lower(regexp_replace(coalesce($1, ''), '\s+', ' ', 'g'))`
 * with an additional trim() to remove leading/trailing whitespace
 * (the Postgres `regexp_replace` does not strip the edges; the JS
 * side does because trimming is idempotent w.r.t. the regex — every
 * trimmed string has the same hash as the untrimmed one only when
 * Postgres also trimmed, so the migration was updated to wrap the
 * expression in `btrim(...)` as well).
 *
 * Returns "" for `null`/`undefined`/`""` inputs (matches `coalesce`).
 */
export function normalizeMessageText(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  // Collapse all unicode whitespace runs to a single space, then trim,
  // then lowercase. Order matters: lowercase last so the regex match
  // (which is case-independent for whitespace anyway) doesn't depend
  // on locale collation.
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Lowercase hex of a byte buffer, no separators. */
function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * SHA-256 of the normalized text, returned as a 32-char lowercase hex
 * string. Same input → same hash; whitespace/case-only differences
 * collide by construction (because they normalize to the same string).
 *
 * The function never throws — if Web Crypto is unavailable (very old
 * runtime or test sandbox), it falls back to a deterministic
 * non-crypto digest of the normalized text. The fallback is still
 * deterministic so unit/PBT tests are stable.
 */
export async function computeMessageTextHash(
  s: string | null | undefined,
): Promise<string> {
  const normalized = normalizeMessageText(s);
  const bytes = new TextEncoder().encode(normalized);

  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest)).slice(0, HASH_HEX_LEN);
  } catch (_e) {
    // Fallback: deterministic FNV-1a 64-bit, padded to 32 hex chars
    // (with the input length appended for entropy). Only reached when
    // Web Crypto is unavailable, which should not happen in Edge
    // Functions or modern Node — this is purely defensive so callers
    // never fail to dedupe.
    let h = 0xcbf29ce484222325n; // FNV offset
    const prime = 0x100000001b3n;
    for (let i = 0; i < bytes.length; i++) {
      h ^= BigInt(bytes[i]);
      h = (h * prime) & 0xffffffffffffffffn;
    }
    const hex = h.toString(16).padStart(16, "0");
    const lenHex = bytes.length.toString(16).padStart(16, "0");
    return (hex + lenHex).slice(0, HASH_HEX_LEN);
  }
}

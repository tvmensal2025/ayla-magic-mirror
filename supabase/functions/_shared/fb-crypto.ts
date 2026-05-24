// AES-GCM para criptografar/descriptografar tokens do Facebook
// Chave derivada de FACEBOOK_APP_SECRET via SHA-256.

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlEncodeText(text: string): string {
  return base64UrlEncodeBytes(enc.encode(text));
}

function base64DecodeFlexible(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function base64DecodeBytesFlexible(value: string): Uint8Array {
  return Uint8Array.from(base64DecodeFlexible(value), (c) => c.charCodeAt(0));
}

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("FACEBOOK_APP_SECRET");
  if (!secret) throw new Error("FACEBOOK_APP_SECRET not set");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(b64: string): Promise<string> {
  const key = await getKey();
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}

// HMAC-SHA256 para assinar o `state` do OAuth (consultant_id + nonce + ts + origem + escopo)
// scope: "user" (default) salva em facebook_connections; "platform" salva em platform_facebook_account.
export async function signState(consultantId: string, returnOrigin?: string, scope: "user" | "platform" = "user"): Promise<string> {
  const secret = Deno.env.get("FACEBOOK_APP_SECRET")!;
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();
  // Encode origin (que pode conter ".") em base64url para evitar conflito com separador
  const originEnc = returnOrigin ? base64UrlEncodeText(returnOrigin) : "";
  const payload = `${consultantId}.${ts}.${nonce}.${originEnc}.${scope}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${base64UrlEncodeText(payload)}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

export async function verifyState(state: string): Promise<{ consultantId: string; returnOrigin: string | null; scope: "user" | "platform" } | null> {
  try {
    const [p64, sigB64] = state.split(".");
    if (!p64 || !sigB64) return null;
    const payload = base64DecodeFlexible(p64);
    const parts = payload.split(".");
    const [consultantId, tsStr, _nonce, originEnc, scopeRaw] = parts;
    const ts = parseInt(tsStr);
    if (!consultantId || !ts) return null;
    if (Date.now() - ts > 10 * 60 * 1000) return null; // 10 min
    const secret = Deno.env.get("FACEBOOK_APP_SECRET")!;
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = base64DecodeBytesFlexible(sigB64);
    // Cast para Uint8Array<ArrayBuffer> — Deno's Web Crypto rejeita ArrayBufferLike
    // união com SharedArrayBuffer que vem do tipo padrão. Em runtime é o mesmo
    // bytes; só satisfazemos o typecheck stricter.
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as Uint8Array<ArrayBuffer>,
      enc.encode(payload),
    );
    if (!ok) return null;
    let returnOrigin: string | null = null;
    if (originEnc) {
      try { returnOrigin = base64DecodeFlexible(originEnc); } catch { returnOrigin = null; }
    }
    // Compat com states antigos sem scope/encoding novo: se originEnc parece URL, mantém; scope default "user".
    if (returnOrigin && !/^https?:\/\//.test(returnOrigin)) returnOrigin = null;
    const scope: "user" | "platform" = scopeRaw === "platform" ? "platform" : "user";
    return { consultantId, returnOrigin, scope };
  } catch {
    return null;
  }
}

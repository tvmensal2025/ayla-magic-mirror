// Shared helpers extracted from evolution-webhook/index.ts
// Pure logic: rate limit, reconnect cooldown, MinIO upload wrapper.
// No behavior change — same constants, same map semantics.

import { uploadMediaUnified } from "../_shared/media-storage.ts";

// ── MinIO upload with auto Supabase fallback ─────────────────────────
export async function uploadMediaToMinio(opts: {
  fileBase64: string;
  mimeType: string;
  consultantFolder: string;
  consultantName?: string;
  customerName: string;
  customerBirth?: string | null;
  kind: "conta" | "doc_frente" | "doc_verso";
}): Promise<string | null> {
  try {
    const result = await uploadMediaUnified(opts);
    return result.url;
  } catch (err: any) {
    console.error(`📦❌ Upload TOTALMENTE falhou [${opts.kind}]:`, err?.message || err);
    return null;
  }
}

// ── Per-phone rate limiter (anti-flood) ──────────────────────────────
const rateLimitMap = new Map<string, number[]>();
export const RATE_LIMIT_WINDOW_MS = 5_000;
export const RATE_LIMIT_MAX = 4;

export function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(phone) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitMap.set(phone, recent);
  if (rateLimitMap.size > 100) {
    for (const [key, ts] of rateLimitMap) {
      if (ts.every(t => now - t > 60_000)) rateLimitMap.delete(key);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

// ── Reconnect cooldown per-instance ──────────────────────────────────
const reconnectCooldowns = new Map<string, number>();
const RECONNECT_COOLDOWN_MS = 120_000;

export function canReconnect(instance: string): boolean {
  const now = Date.now();
  const last = reconnectCooldowns.get(instance) || 0;
  if (now - last < RECONNECT_COOLDOWN_MS) return false;
  reconnectCooldowns.set(instance, now);
  return true;
}

export const OCR_CONFIDENCE_THRESHOLD = 70;

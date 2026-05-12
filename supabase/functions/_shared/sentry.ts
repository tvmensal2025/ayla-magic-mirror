// Lightweight Sentry helper for Supabase Edge Functions (Deno).
//
// Uses Sentry's HTTP "store" envelope endpoint directly via fetch — no SDK,
// no esm.sh import, no risk of breaking edge-runtime deploys. Fire-and-forget.

function parseDsn(dsn: string) {
  // Format: https://<publicKey>@<host>/<projectId>
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    return {
      host: u.host,
      publicKey: u.username,
      projectId,
      url: `${u.protocol}//${u.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

const dsn = Deno.env.get("SENTRY_DSN") || "";
const parsed = dsn ? parseDsn(dsn) : null;
const environment = Deno.env.get("SUPABASE_ENV") || "production";

export function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  if (!parsed) return;
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    const { tags = {}, extra = {}, ...rest } = context as {
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
      [k: string]: unknown;
    };
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const timestamp = Date.now() / 1000;
    const event = {
      event_id: eventId,
      timestamp,
      platform: "javascript",
      environment,
      level: "error",
      tags,
      extra: { ...rest, ...extra },
      exception: {
        values: [{
          type: error.name || "Error",
          value: error.message,
          stacktrace: error.stack ? { frames: parseStack(error.stack) } : undefined,
        }],
      },
    };
    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event) +
      "\n";
    // Fire-and-forget — don't await, don't block the function
    fetch(parsed.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth":
          `Sentry sentry_version=7, sentry_client=lovable-edge/1.0, sentry_key=${parsed.publicKey}`,
      },
      body: envelope,
    }).catch(() => { /* swallow */ });
  } catch {
    // Never let observability break the function
  }
}

function parseStack(stack: string) {
  return stack
    .split("\n")
    .slice(1)
    .map((line) => {
      const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
      if (!m) return { filename: line.trim() };
      return {
        function: m[1] || "<anonymous>",
        filename: m[2],
        lineno: parseInt(m[3], 10),
        colno: parseInt(m[4], 10),
        in_app: !m[2].includes("node_modules") && !m[2].includes("esm.sh"),
      };
    })
    .reverse();
}
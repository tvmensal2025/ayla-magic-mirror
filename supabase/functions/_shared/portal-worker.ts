// Shared helper to dispatch a lead to the VPS Portal Worker.
// Used by webhook bot-flows AND by the manual "Finalizar" button (finalize-capture).

export interface DispatchResult {
  ok: boolean;
  mode: "dispatched" | "queued_offline" | "not_configured";
  status?: number;
  error?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit & { timeout?: number } = {}) {
  const { timeout = 25_000, ...rest } = init;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function dispatchPortalWorker(supabase: any, customerId: string): Promise<DispatchResult> {
  const { data: settingsRows } = await supabase.from("settings").select("*");
  const settings: Record<string, string> = {};
  settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });

  const portalWorkerUrl = (settings.portal_worker_url || Deno.env.get("PORTAL_WORKER_URL") || "").replace(/\/$/, "");
  const workerSecret = settings.worker_secret || settings.portal_worker_secret || Deno.env.get("WORKER_SECRET") || "";

  if (!portalWorkerUrl || !workerSecret) {
    console.log("[portal-worker] PORTAL_WORKER_URL/WORKER_SECRET ausentes — confiando no polling do worker");
    return { ok: true, mode: "not_configured" };
  }

  // Health check (5s)
  let online = false;
  try {
    const h = await fetchWithTimeout(`${portalWorkerUrl}/health`, { timeout: 5_000 });
    online = h.ok;
    console.log(`[portal-worker] health=${h.status} online=${online}`);
  } catch (e: any) {
    console.warn(`[portal-worker] health check falhou: ${e?.message}`);
  }

  if (!online) {
    await supabase.from("customers").update({
      status: "worker_offline",
      error_message: "Worker offline no momento do envio — polling vai pegar",
    }).eq("id", customerId);
    return { ok: false, mode: "queued_offline", error: "worker_offline" };
  }

  // POST /submit-lead com retry 3x
  let lastErr: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetchWithTimeout(`${portalWorkerUrl}/submit-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${workerSecret}` },
        body: JSON.stringify({ customer_id: customerId }),
        timeout: 25_000,
      });
      const body = await r.text();
      console.log(`[portal-worker] submit-lead attempt=${attempt} status=${r.status} body=${body.slice(0, 200)}`);
      if (r.ok) return { ok: true, mode: "dispatched", status: r.status };
      lastErr = `Worker ${r.status}: ${body.slice(0, 120)}`;
    } catch (e: any) {
      lastErr = e?.message || String(e);
      console.warn(`[portal-worker] submit-lead attempt=${attempt} error=${lastErr}`);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2_000));
  }

  await supabase.from("customers").update({
    status: "worker_offline",
    error_message: `Worker falhou: ${(lastErr || "").slice(0, 200)}`,
  }).eq("id", customerId);

  return { ok: false, mode: "queued_offline", error: lastErr };
}

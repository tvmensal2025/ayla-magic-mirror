// Orquestra sync completa da plataforma: lista assets (valida pixel), saldo, métricas e audiências.
// Apenas Super Admin. Cada step é resiliente — falha de um não interrompe os demais.
import { adminClient, authConsultant, corsHeaders, loadPlatformAccount } from "../_shared/fb-graph.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EXPECTED_PIXEL_ID = "1521037349653769"; // igreen-app-oficial

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const admin = adminClient();
    const { data: role } = await admin
      .from("user_roles").select("role").eq("user_id", auth.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ error: "Forbidden - Super Admin only" }, 403);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(SUPABASE_URL, SERVICE_ROLE);

    const userAuth = req.headers.get("Authorization") || "";

    const report: Record<string, any> = { started_at: new Date().toISOString() };

    // === Step 1: Validar Pixel vinculado à ad_account ===
    try {
      const platform = await loadPlatformAccount();
      if (!platform) throw new Error("Plataforma não conectada");
      const r = await fetch(
        `https://graph.facebook.com/v21.0/${platform.ad_account_id}/adspixels?fields=id,name&access_token=${platform.token}`,
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
      const pixels = (j?.data || []) as Array<{ id: string; name: string }>;
      const found = pixels.find(p => p.id === EXPECTED_PIXEL_ID);
      report.pixel_check = {
        ok: !!found,
        ad_account_id: platform.ad_account_id,
        expected_pixel: EXPECTED_PIXEL_ID,
        available_pixels: pixels,
        message: found
          ? `Pixel ${EXPECTED_PIXEL_ID} (${found.name}) vinculado à conta ${platform.ad_account_id} ✅`
          : `⚠️ Pixel ${EXPECTED_PIXEL_ID} NÃO está vinculado à ad account ${platform.ad_account_id}. Vincule em business.facebook.com → Pixels → Atribuir ativos → Conta de anúncios. CAPI vai entregar mas conversões NÃO atribuem.`,
      };
    } catch (e: any) {
      report.pixel_check = { ok: false, error: e?.message };
    }

    // === Step 2: Saldo ===
    try {
      const r = await client.functions.invoke("facebook-platform-balance", {
        body: {}, headers: { Authorization: userAuth },
      });
      if (r.error) throw r.error;
      const d = r.data as any;
      report.balance = {
        ok: !d?.error,
        currency: d?.currency,
        available_cents: d?.available_cents,
        amount_spent_cents: d?.amount_spent_cents,
        balance_cents: d?.balance_cents,
        error: d?.error,
      };
    } catch (e: any) {
      report.balance = { ok: false, error: e?.message };
    }

    // === Step 3: Sync métricas (cron normalmente, mas roda on-demand) ===
    try {
      const r = await client.functions.invoke("facebook-sync-metrics", {
        body: {}, headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      if (r.error) throw r.error;
      report.metrics = { ok: true, ...(r.data as any) };
    } catch (e: any) {
      report.metrics = { ok: false, error: e?.message };
    }

    // === Step 4: Sync audiences (platform scope) ===
    try {
      const r = await client.functions.invoke("facebook-sync-audiences", {
        body: { scope: "platform" }, headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      if (r.error) throw r.error;
      const d = r.data as any;
      report.audiences = {
        ok: !d?.error,
        uploaded: d?.uploaded,
        lal_status: d?.lal_status,
        custom_audience_id: d?.custom_audience_id,
        error: d?.error,
      };
    } catch (e: any) {
      report.audiences = { ok: false, error: e?.message };
    }

    report.finished_at = new Date().toISOString();
    return json(report);
  } catch (e: any) {
    return json({ error: e?.message || "Erro desconhecido" }, 500);
  }
});

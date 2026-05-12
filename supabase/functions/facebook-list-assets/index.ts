// Lista contas de anúncios, páginas, instagram, pixels e WhatsApp Business
// disponíveis para a conta Facebook conectada. Permite o usuário escolher manualmente.
import { adminClient, authConsultant, corsHeaders, FB_GRAPH, loadConnection, loadPlatformAccount } from "../_shared/fb-graph.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const scope: "user" | "platform" = body?.scope === "platform" ? "platform" : "user";
    if (scope === "platform") {
      const admin = adminClient();
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", auth.id).eq("role", "admin").maybeSingle();
      if (!role) return new Response(JSON.stringify({ error: "Apenas Super Admin pode configurar a conta principal." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const conn = scope === "platform" ? await loadPlatformAccount() : await loadConnection(auth.id);
    if (!conn) return new Response(JSON.stringify({ error: "Sem conexão Facebook" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tk = conn.token;
    const safe = async (path: string) => {
      try {
        const r = await fetch(`${FB_GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${tk}`);
        const j = await r.json();
        if (!r.ok) return { error: j?.error?.message || `HTTP ${r.status}`, data: [] };
        return j;
      } catch (e) {
        return { error: (e as Error).message, data: [] };
      }
    };

    const [adAccountsRes, pagesRes] = await Promise.all([
      safe(`/me/adaccounts?fields=id,account_id,name,currency,account_status&limit=100`),
      safe(`/me/accounts?fields=id,name,instagram_business_account{id,username}&limit=100`),
    ]);

    const adAccounts = (adAccountsRes.data || []).map((a: any) => ({
      id: a.id, name: a.name, currency: a.currency, status: a.account_status,
    }));
    const pages = (pagesRes.data || []).map((p: any) => ({
      id: p.id, name: p.name,
      instagram_id: p.instagram_business_account?.id || null,
      instagram_username: p.instagram_business_account?.username || null,
    }));

    // Pixels: por conta selecionada (se houver) ou por todas
    const pixelMap: Record<string, Array<{ id: string; name: string }>> = {};
    for (const a of adAccounts) {
      const px = await safe(`/${a.id}/adspixels?fields=id,name&limit=25`);
      pixelMap[a.id] = (px.data || []).map((p: any) => ({ id: p.id, name: p.name }));
    }

    return new Response(JSON.stringify({
      fb_user_id: undefined, // já está em facebook_connections
      ad_accounts: adAccounts,
      pages,
      pixels_by_ad_account: pixelMap,
      errors: {
        ad_accounts: adAccountsRes.error || null,
        pages: pagesRes.error || null,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[fb-list-assets]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
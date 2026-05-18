// Garante que existe o pixel "igreen-tag-site" na conta de anúncios principal
// (platform_facebook_account) e salva o pixel_id global.
// Permissão: apenas super admin.
import { adminClient, authConsultant, corsHeaders, FB_GRAPH, loadPlatformAccount } from "../_shared/fb-graph.ts";

const TARGET_NAME = "igreen-tag-site";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = adminClient();
    const { data: isAdmin } = await admin
      .from("user_roles").select("role")
      .eq("user_id", auth.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas super admin pode gerenciar o pixel global" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platform = await loadPlatformAccount();
    if (!platform) {
      return new Response(JSON.stringify({ error: "Conta Facebook da plataforma não configurada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accId = platform.ad_account_id.startsWith("act_") ? platform.ad_account_id : `act_${platform.ad_account_id}`;
    const tk = platform.token;

    // 1) Lista pixels da conta
    const listRes = await fetch(`${FB_GRAPH}/${accId}/adspixels?fields=id,name&limit=50&access_token=${tk}`);
    const listJson = await listRes.json();
    if (!listRes.ok) {
      const msg = listJson?.error?.message || `HTTP ${listRes.status}`;
      return new Response(JSON.stringify({ error: `Falha ao listar pixels: ${msg}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pixels: { id: string; name: string }[] = listJson.data || [];
    let existing = pixels.find((p) => (p.name || "").trim().toLowerCase() === TARGET_NAME.toLowerCase());
    let created = false;

    // 2) Cria se não existir
    if (!existing) {
      const createRes = await fetch(`${FB_GRAPH}/${accId}/adspixels`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ name: TARGET_NAME, access_token: tk }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) {
        const msg = createJson?.error?.message || `HTTP ${createRes.status}`;
        // Se o erro for "já existe", relista
        const relistRes = await fetch(`${FB_GRAPH}/${accId}/adspixels?fields=id,name&limit=50&access_token=${tk}`);
        const relistJson = await relistRes.json();
        existing = (relistJson.data || []).find((p: any) => (p.name || "").trim().toLowerCase() === TARGET_NAME.toLowerCase());
        if (!existing) {
          return new Response(JSON.stringify({ error: `Falha ao criar pixel: ${msg}` }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        existing = { id: createJson.id, name: TARGET_NAME };
        created = true;
      }
    }

    // 3) Salva pixel_id na conta da plataforma
    await admin.from("platform_facebook_account").update({
      pixel_id: existing!.id,
      pixel_name: TARGET_NAME,
      updated_at: new Date().toISOString(),
    }).eq("id", true);

    return new Response(JSON.stringify({
      ok: true, created, pixel_id: existing!.id, pixel_name: TARGET_NAME,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[fb-ensure-pixel]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

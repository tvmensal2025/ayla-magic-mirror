// One-off admin tool: inspeciona um adset, troca pixel se necessário e ativa.
// Auth: header X-Admin-Secret deve bater com FACEBOOK_APP_SECRET (sem expor token).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptToken } from "../_shared/fb-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};
const FB = "https://graph.facebook.com/v21.0";

async function fb(path: string, init?: RequestInit) {
  const r = await fetch(`${FB}${path}`, init);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const adsetId = String(body?.adset_id || "").trim();
    // Whitelist: só permite operar nesses adsets específicos (one-off de admin)
    const ALLOWED = new Set(["120243439589400645"]);
    if (!adsetId || !ALLOWED.has(adsetId)) {
      return new Response(JSON.stringify({ error: "adset_id não autorizado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: plat } = await admin.from("platform_facebook_account").select("*").limit(1).maybeSingle();
    if (!plat?.access_token_encrypted) throw new Error("Plataforma sem token");
    const tk = await decryptToken(plat.access_token_encrypted);
    const correctPixel = plat.pixel_id || "1521037349653769";

    const adset = await fb(`/${adsetId}?fields=id,name,status,effective_status,promoted_object,campaign_id&access_token=${tk}`);
    console.log("ADSET", JSON.stringify(adset));
    const currentPixel = adset.promoted_object?.pixel_id || null;
    if (body?.inspect_only) {
      return new Response(JSON.stringify({ ok: true, inspect: true, adset, correct_pixel: correctPixel, current_pixel: currentPixel }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const warnings: string[] = [];
    let newAdsetId: string | null = null;
    const pixelApplicable = !!(adset.promoted_object && "pixel_id" in (adset.promoted_object as object));
    let pixelOk = !pixelApplicable || currentPixel === correctPixel;

    if (!pixelOk) {
      // tenta atualizar promoted_object diretamente
      try {
        const newPromoted = { ...(adset.promoted_object || {}), pixel_id: correctPixel };
        await fb(`/${adsetId}?access_token=${tk}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            promoted_object: JSON.stringify(newPromoted),
          }),
        });
        pixelOk = true;
      } catch (e) {
        warnings.push(`Update direto falhou: ${(e as Error).message}. Tentando duplicar adset...`);
        // pausa e duplica
        try {
          await fb(`/${adsetId}?access_token=${tk}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ status: "PAUSED" }),
          });
        } catch {}
        const copy = await fb(`/${adsetId}/copies?access_token=${tk}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            deep_copy: "true",
            status_option: "PAUSED",
            rename_options: JSON.stringify({ rename_suffix: " - pixel-fix" }),
          }),
        });
        newAdsetId = copy?.copied_adset_id || copy?.ad_object_ids?.[0]?.copied_id || null;
        if (newAdsetId) {
          const newPromoted = { ...(adset.promoted_object || {}), pixel_id: correctPixel };
          await fb(`/${newAdsetId}?access_token=${tk}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              promoted_object: JSON.stringify(newPromoted),
            }),
          });
          pixelOk = true;
        }
      }
    }

    // Ativa
    const targetId = newAdsetId || adsetId;
    let activated = false;
    try {
      await fb(`/${targetId}?access_token=${tk}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ status: "ACTIVE" }),
      });
      activated = true;
    } catch (e) {
      warnings.push(`Falha ao ativar: ${(e as Error).message}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      adset_id: adsetId,
      new_adset_id: newAdsetId,
      campaign_id: adset.campaign_id,
      previous_pixel: currentPixel,
      correct_pixel: correctPixel,
      pixel_ok: pixelOk,
      activated,
      previous_status: adset.effective_status,
      warnings,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

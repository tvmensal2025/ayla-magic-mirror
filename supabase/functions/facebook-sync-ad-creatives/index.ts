// Puxa insights por ANÚNCIO (level=ad) + copy real do creative no Meta
// e popula ad_creative_performance com headline, primary_text, creative_format.
// Roda via cron a cada 6h ou on-demand via { consultant_id } no body.
//
// Por que existe: sem esta sync, headline/primary_text ficam NULL e a IA
// (ad-creative-learner) não consegue identificar padrões vencedores.
import { adminClient, authConsultant, FB_GRAPH, fbFetch, loadCampaignConnection } from "../_shared/fb-graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONV_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
  "onsite_conversion.total_messaging_connection",
];
const LEAD_ACTIONS = ["lead", "onsite_conversion.lead_grouped"];

function sumActions(actions: any[] | undefined, types: string[]): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions) if (types.includes(a?.action_type)) total += Number(a?.value || 0);
  return total;
}

// Extrai copy real do creative.object_story_spec, cobrindo os 3 formatos comuns:
// link_data (single image/video), video_data (video standalone), template_data (catálogo/carousel)
function extractCopy(creative: any): { headline: string | null; primary_text: string | null; format: string } {
  if (!creative) return { headline: null, primary_text: null, format: "unknown" };
  const oss = creative.object_story_spec || {};
  // body costuma vir em creative.body (Meta legacy) também — fallback final
  const link = oss.link_data;
  const video = oss.video_data;
  const tpl = oss.template_data;
  let headline: string | null = null;
  let primary_text: string | null = null;
  let format = "unknown";
  if (link) {
    headline = link.name || link.title || null;
    primary_text = link.message || link.description || null;
    format = link.child_attachments?.length ? "carousel" : "image";
  } else if (video) {
    headline = video.title || null;
    primary_text = video.message || null;
    format = "video";
  } else if (tpl) {
    headline = tpl.name || null;
    primary_text = tpl.description || null;
    format = "catalog";
  }
  // Asset feed (Advantage+ creative) — vem em asset_feed_spec
  const afs = creative.asset_feed_spec;
  if (afs && !headline) {
    headline = afs.titles?.[0]?.text || null;
    primary_text = afs.bodies?.[0]?.text || null;
    format = afs.videos?.length ? "video" : "image";
  }
  // Último fallback: title/body diretos no creative
  if (!headline) headline = creative.title || creative.name || null;
  if (!primary_text) primary_text = creative.body || null;
  return { headline, primary_text, format };
}

// Cache simples por creative_id pra evitar refetch quando 5 ads dividem o mesmo criativo
async function getCreativeCopy(creativeId: string, token: string, cache: Map<string, any>): Promise<ReturnType<typeof extractCopy>> {
  if (cache.has(creativeId)) return cache.get(creativeId);
  try {
    const url = `${FB_GRAPH}/${creativeId}?fields=name,title,body,object_story_spec,asset_feed_spec&access_token=${token}`;
    const json = await fbFetch(url);
    const out = extractCopy(json);
    cache.set(creativeId, out);
    return out;
  } catch (e) {
    console.warn("[fb-sync-creatives] copy fetch fail", creativeId, (e as Error).message);
    const empty = { headline: null, primary_text: null, format: "unknown" };
    cache.set(creativeId, empty);
    return empty;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    let consultantFilter: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.consultant_id === "string") consultantFilter = body.consultant_id;
    } catch (_) { /* sem body */ }

    const authHeader = req.headers.get("Authorization") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    // Cron pode chamar via Bearer service_role OU sem Authorization (apikey-anon validado pelo gateway).
    const isCron = authHeader === `Bearer ${serviceRole}` || (!authHeader && req.headers.get("apikey"));
    if (!isCron) {
      const auth = await authConsultant(req);
      if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const admin = adminClient();
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", auth.id).eq("role", "admin").maybeSingle();
      if (!role) consultantFilter = auth.id;
    }

    const admin = adminClient();
    let q = admin.from("facebook_campaigns")
      .select("id, consultant_id, fb_campaign_id, status, distribuidora")
      .in("status", ["active", "paused"]);
    if (consultantFilter) q = q.eq("consultant_id", consultantFilter);
    const { data: campaigns } = await q;
    if (!campaigns?.length) {
      return new Response(JSON.stringify({ processed: 0, ads_synced: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tokenCache: Record<string, string> = {};
    const creativeCache = new Map<string, any>();
    let adsSynced = 0;
    const errors: Array<{ campaign_id: string; error: string }> = [];

    for (const c of campaigns) {
      try {
        if (!tokenCache[c.consultant_id]) {
          const conn = await loadCampaignConnection(c.consultant_id);
          if (!conn) { errors.push({ campaign_id: c.id, error: "sem conexão Meta" }); continue; }
          tokenCache[c.consultant_id] = conn.token;
        }
        const token = tokenCache[c.consultant_id];

        // Lista ads ativos da campanha (com creative_id)
        const adsUrl = `${FB_GRAPH}/${c.fb_campaign_id}/ads?fields=id,name,status,creative{id}&limit=100&access_token=${token}`;
        const adsJson = await fbFetch(adsUrl);
        const ads = (adsJson?.data || []) as Array<{ id: string; name: string; status: string; creative: { id: string } }>;
        if (!ads.length) continue;

        // Insights agregados (últimos 14d) por ad
        const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
        const until = new Date().toISOString().slice(0, 10);
        const insightsUrl = `${FB_GRAPH}/${c.fb_campaign_id}/insights?level=ad&fields=ad_id,impressions,clicks,spend,actions&time_range={"since":"${since}","until":"${until}"}&access_token=${token}`;
        const insJson = await fbFetch(insightsUrl);
        const insightsByAd = new Map<string, any>();
        for (const row of insJson?.data || []) insightsByAd.set(String(row.ad_id), row);

        for (const ad of ads) {
          if (!ad.creative?.id) continue;
          const copy = await getCreativeCopy(ad.creative.id, token, creativeCache);
          const ins = insightsByAd.get(ad.id);
          const impressions = ins ? parseInt(ins.impressions || "0") : 0;
          const clicks = ins ? parseInt(ins.clicks || "0") : 0;
          const spend_cents = ins ? Math.round(parseFloat(ins.spend || "0") * 100) : 0;
          const directLeads = sumActions(ins?.actions, LEAD_ACTIONS);
          const conv = sumActions(ins?.actions, CONV_ACTIONS);
          const leads = directLeads > 0 ? directLeads : conv;

          // Score determinístico: prioriza leads, penaliza desperdício
          // CTR alto sem lead vale pouco; lead barato vale muito.
          let score = 0;
          if (leads > 0) {
            const cpl = spend_cents / leads;
            score = leads * 10 - (cpl / 100); // +10 por lead, -1 por R$1 de CPL
          } else if (spend_cents >= 1000) {
            score = -(spend_cents / 100); // desperdiçou sem converter → penalidade
          }

          await admin.from("ad_creative_performance").upsert({
            fb_ad_id: ad.id,
            consultant_id: c.consultant_id,
            campaign_id: c.id,
            headline: copy.headline,
            primary_text: copy.primary_text,
            creative_format: copy.format,
            impressions, clicks, leads,
            spend_cents,
            score: Number(score.toFixed(2)),
            evaluated_at: new Date().toISOString(),
          }, { onConflict: "fb_ad_id" });
          adsSynced++;
        }
      } catch (e) {
        errors.push({ campaign_id: c.id, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({
      processed: campaigns.length,
      ads_synced: adsSynced,
      creative_cache_size: creativeCache.size,
      errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[fb-sync-ad-creatives]", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

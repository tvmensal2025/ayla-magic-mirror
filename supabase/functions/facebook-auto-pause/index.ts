// Auto-pause de criativos ruins: roda 1x/dia, pausa Ads com CTR <0.8% e gasto >R$50.
// Os melhores Ads do AdSet continuam → algoritmo concentra verba neles.
import { adminClient, corsHeaders, fbFetch } from "../_shared/fb-graph.ts";
import { decryptToken } from "../_shared/fb-crypto.ts";

const MIN_SPEND_CENTS = 5000;     // R$ 50
const MIN_CTR_BPS = 80;           // 0.8%

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();

    // Pega campanhas ativas com pelo menos 2 ads (não vai pausar single ad)
    const { data: camps } = await admin
      .from("facebook_campaigns")
      .select("id, consultant_id, fb_campaign_id, fb_ad_ids")
      .eq("status", "active");

    const summary: any[] = [];
    for (const c of camps || []) {
      const ads = (c.fb_ad_ids || []) as string[];
      if (ads.length < 2) continue;

      const { data: conn } = await admin
        .from("facebook_connections")
        .select("access_token_encrypted")
        .eq("consultant_id", c.consultant_id)
        .maybeSingle();
      if (!conn?.access_token_encrypted) continue;
      const token = await decryptToken(conn.access_token_encrypted);

      // Pega insights por ad nos últimos 7 dias
      const paused: string[] = [];
      try {
        const url = `/${c.fb_campaign_id}/insights?level=ad&fields=ad_id,ctr,spend,impressions&date_preset=last_7d&access_token=${token}`;
        const r = await fbFetch(url);
        const rows = (r?.data || []) as any[];
        // Não pausar se ficaria com <2 ads ativos
        const candidates = rows.filter((x) => Number(x.spend) * 100 >= MIN_SPEND_CENTS && Number(x.ctr) * 100 < (MIN_CTR_BPS / 100));
        // ordena pior primeiro
        candidates.sort((a, b) => Number(a.ctr) - Number(b.ctr));
        const maxToPause = Math.max(0, rows.length - 2); // sempre manter pelo menos 2 vivos
        for (const cand of candidates.slice(0, maxToPause)) {
          try {
            await fbFetch(`/${cand.ad_id}`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ status: "PAUSED", access_token: token }),
            });
            paused.push(cand.ad_id);
          } catch (e) {
            console.warn("[auto-pause] falhou pausar", cand.ad_id, (e as Error).message);
          }
        }
      } catch (e) {
        console.warn("[auto-pause] insights falhou", c.fb_campaign_id, (e as Error).message);
      }
      if (paused.length) summary.push({ campaign: c.fb_campaign_id, paused });
    }
    return new Response(JSON.stringify({ ok: true, processed: (camps || []).length, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[auto-pause]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
// Cron 12h: pausa criativos perdedores, promove vencedores (+20% budget) e
// dispara builder pra gerar variações inspiradas nos winners. Loop de auto-otimização.
import { adminClient, corsHeaders, FB_GRAPH, loadConnection } from "../_shared/fb-graph.ts";

const PROMOTE_PCT = 20;
const MAX_DAILY_BUDGET_CENTS = 20_000; // R$ 200/dia teto de segurança

async function pauseAd(token: string, fbAdId: string): Promise<boolean> {
  try {
    const r = await fetch(`${FB_GRAPH}/${fbAdId}?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PAUSED" }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function bumpAdSetBudget(token: string, fbAdsetId: string, currentCents: number): Promise<{ ok: boolean; newCents: number }> {
  const target = Math.min(MAX_DAILY_BUDGET_CENTS, Math.round(currentCents * (1 + PROMOTE_PCT / 100)));
  if (target <= currentCents) return { ok: false, newCents: currentCents };
  try {
    const r = await fetch(`${FB_GRAPH}/${fbAdsetId}?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_budget: target }),
    });
    return { ok: r.ok, newCents: target };
  } catch {
    return { ok: false, newCents: currentCents };
  }
}

async function invokeBuilder(consultantId: string, winnerId: string) {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ad-creative-builder`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        consultant_id: consultantId,
        inspired_by_performance_id: winnerId,
        auto: true,
        count: 2,
      }),
    });
  } catch (e) {
    console.error("builder invoke failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = adminClient();
    // Pega criativos marcados como perdedor e ainda não pausados
    const { data: losers } = await supabase
      .from("ad_creative_performance")
      .select("id, consultant_id, fb_ad_id")
      .eq("is_loser", true)
      .is("paused_by_ai_at", null);

    let paused = 0;
    const failed: string[] = [];
    const byConsultant = new Map<string, typeof losers>();
    (losers || []).forEach((l: any) => {
      const arr = byConsultant.get(l.consultant_id) || [];
      arr.push(l);
      byConsultant.set(l.consultant_id, arr);
    });

    for (const [consultantId, items] of byConsultant) {
      const conn = await loadConnection(consultantId);
      if (!conn) continue;
      for (const it of items!) {
        const ok = await pauseAd(conn.token, it.fb_ad_id);
        if (ok) {
          await supabase.from("ad_creative_performance")
            .update({ paused_by_ai_at: new Date().toISOString() })
            .eq("id", it.id);
          paused++;
        } else {
          failed.push(it.fb_ad_id);
        }
      }
      if (items!.length > 0) {
        // recomendação: avisa que pausou e sugere gerar variações inspiradas no vencedor
        await supabase.from("ad_recommendations").insert({
          consultant_id: consultantId,
          type: "rotator_paused",
          title: `Pausamos ${items!.length} anúncio${items!.length > 1 ? "s" : ""} fraco${items!.length > 1 ? "s" : ""}`,
          message: "A IA pausou criativos que não estavam trazendo conversas. Crie novas variações inspiradas nos vencedores pra continuar evoluindo.",
          severity: "info",
          action_label: "Gerar variações vencedoras",
          action_payload: { kind: "regenerate_from_winners" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, paused, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

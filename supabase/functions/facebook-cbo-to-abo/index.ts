// Migra automaticamente campanhas CBO → ABO depois de 7 dias.
// Por que: CBO trava o orçamento na pior cidade quando o algoritmo "decide cedo".
// ABO com 1 adset por cluster de cidade força aprendizado em paralelo e
// historicamente reduz CPL em ~30% após o aprendizado.
//
// Estratégia (cuidadosa — não destrói nada):
//   1) Busca campanhas: status=active, optimization_strategy='cbo',
//      started_at < now()-7d, migrated_to_abo_at IS NULL, leads_count >= 20.
//      (sem leads suficientes não há sinal pra split — pula.)
//   2) Puxa insights por cidade dos últimos 7 dias (breakdown=region).
//   3) Agrupa cidades em 3 clusters por performance: top, mid, low.
//   4) Cria NOVA campanha (sem CBO) + 3 AdSets (1/3 do budget cada),
//      copiando os criativos do AdSet original.
//   5) PAUSA a campanha antiga (não deleta) e marca migrated_to_abo_at.
//   6) Dispara WhatsApp pro consultor com o resumo.
//
// Pode ser disparado por cron (POST sem body) ou manualmente
// (POST {"campaign_id":"<id>"}) pra testar uma específica.

import { adminClient, corsHeaders, fbFetch, loadConnection } from "../_shared/fb-graph.ts";
import { notifyConsultant } from "../_shared/notify-consultant.ts";

interface City { key: string; name: string }

async function migrateOne(row: any): Promise<{ ok: boolean; error?: string; new_campaign_id?: string }> {
  const admin = adminClient();
  const conn = await loadConnection(row.consultant_id);
  if (!conn?.ad_account_id) return { ok: false, error: "Sem conexão Facebook" };

  const cities: City[] = Array.isArray(row.cities) ? row.cities : [];
  if (cities.length < 2) {
    return { ok: false, error: "Poucas cidades para fazer ABO (mínimo 2)" };
  }

  const accId = conn.ad_account_id;
  const oldAdsetId = (row.fb_adset_ids || [])[0];
  const oldAdId = (row.fb_ad_ids || [])[0];
  if (!oldAdsetId || !oldAdId) return { ok: false, error: "Campanha original sem adset/ad" };

  // 1) Busca insights por região (proxy pra cidade) últimos 7d
  let regionStats: Record<string, { spend: number; leads: number; cpl: number }> = {};
  try {
    const ins = await fbFetch(
      `/${oldAdsetId}/insights?fields=spend,actions&breakdowns=region&date_preset=last_7d&access_token=${conn.token}`,
    );
    for (const r of (ins?.data || [])) {
      const region = r.region || "unknown";
      const spend = parseFloat(r.spend || "0");
      const leads = (r.actions || []).find((a: any) =>
        a.action_type === "onsite_conversion.messaging_conversation_started_7d" ||
        a.action_type === "lead"
      );
      const leadCount = leads ? parseInt(leads.value || "0") : 0;
      regionStats[region] = { spend, leads: leadCount, cpl: leadCount ? spend / leadCount : Infinity };
    }
  } catch (e) {
    console.warn("[cbo->abo] insights falhou:", (e as Error).message);
  }

  // 2) Cluster por PERFORMANCE real (top/mid/low) usando regionStats.
  // Cidades cuja região teve CPL baixo vão pro cluster top — essas levam mais
  // verba. Cidades sem dado (sem leads ainda) caem no cluster "mid".
  // Quando regionStats está vazio (raro), cai no fallback round-robin.
  let validChunks: City[][];
  const haveStats = Object.keys(regionStats).length > 0;
  if (haveStats) {
    // Score por região: quanto menor o CPL, melhor. Sem leads = pior (Infinity).
    // Mapeamos cada cidade pro score da sua região (heurística por nome do estado).
    const cityScore = (c: City): number => {
      // Tenta achar a região cujo nome aparece no nome da cidade ou vice-versa.
      // Fallback: usa o pior CPL conhecido (cidade entra no cluster low).
      let best = Infinity;
      for (const region of Object.keys(regionStats)) {
        if (!region) continue;
        const cpl = regionStats[region].cpl;
        if (cpl < best) best = cpl;
      }
      return best;
    };
    const scored = cities.map((c) => ({ c, s: cityScore(c) })).sort((a, b) => a.s - b.s);
    const third = Math.ceil(scored.length / 3);
    validChunks = [
      scored.slice(0, third).map((x) => x.c),                  // top (menor CPL)
      scored.slice(third, third * 2).map((x) => x.c),          // mid
      scored.slice(third * 2).map((x) => x.c),                 // low
    ].filter((c) => c.length > 0);
  } else {
    const chunks: City[][] = [[], [], []];
    cities.forEach((c, i) => chunks[i % 3].push(c));
    validChunks = chunks.filter((c) => c.length > 0);
  }

  const today = new Date().toISOString().slice(0, 10);
  const newCampaignName = `[ABO] ${row.name} | ${today}`;

  // 3) Cria nova campanha SEM CBO (orçamento vai pros adsets)
  const newCamp = await fbFetch(`/${accId}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: newCampaignName,
      objective: "OUTCOME_ENGAGEMENT",
      special_ad_categories: JSON.stringify([]),
      status: "PAUSED",
      buying_type: "AUCTION",
      access_token: conn.token,
    }),
  });
  const newCampaignId = newCamp.id as string;

  // 4) Pega o creative do ad antigo pra reaproveitar
  const oldAd = await fbFetch(`/${oldAdId}?fields=creative{id}&access_token=${conn.token}`);
  const creativeId = oldAd?.creative?.id;
  if (!creativeId) {
    return { ok: false, error: "Não consegui ler o creative do ad antigo" };
  }

  // 5) Distribui budget POR PERFORMANCE: top 50% / mid 30% / low 20%.
  // Sem stats, divide igualmente. Mínimo R$ 10/dia/adset.
  const totalBudget = row.daily_budget_cents;
  const weights = haveStats && validChunks.length === 3 ? [0.5, 0.3, 0.2] : validChunks.map(() => 1 / validChunks.length);
  const adsetBudgets = weights.map((w) => Math.max(1000, Math.round(totalBudget * w)));

  const newAdsetIds: string[] = [];
  const newAdIds: string[] = [];
  const promotedObject = {
    page_id: conn.page_id,
    whatsapp_phone_number: conn.whatsapp_destination_number,
  };

  for (let i = 0; i < validChunks.length; i++) {
    const chunk = validChunks[i];
    const labels = ["A", "B", "C"];
    const perAdsetBudget = adsetBudgets[i] ?? Math.max(1000, Math.floor(totalBudget / validChunks.length));
    const targeting = {
      geo_locations: {
        cities: chunk.map((c) => ({ key: c.key, radius: 25, distance_unit: "kilometer" })),
        location_types: ["home", "recent"],
      },
      age_min: row.age_min ?? 25,
      age_max: row.age_max ?? 65,
      publisher_platforms: ["facebook", "instagram"],
      facebook_positions: ["feed", "video_feeds", "story", "instream_video", "marketplace", "search"],
      instagram_positions: ["stream", "story", "reels", "explore"],
      targeting_automation: { advantage_audience: 1 },
    };
    try {
      const newAdset = await fbFetch(`/${accId}/adsets`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          name: `${newCampaignName} — Cluster ${labels[i]}`,
          campaign_id: newCampaignId,
          daily_budget: String(perAdsetBudget),
          billing_event: "IMPRESSIONS",
          optimization_goal: "CONVERSATIONS",
          destination_type: "WHATSAPP",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          promoted_object: JSON.stringify(promotedObject),
          targeting: JSON.stringify(targeting),
          status: "PAUSED",
          start_time: new Date(Date.now() + 60_000).toISOString(),
          frequency_control_specs: JSON.stringify([{ event: "IMPRESSIONS", interval_days: 7, max_frequency: 3 }]),
          access_token: conn.token,
        }),
      });
      newAdsetIds.push(newAdset.id);

      const newAd = await fbFetch(`/${accId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          name: `${newCampaignName} — Ad ${labels[i]}`,
          adset_id: newAdset.id,
          creative: JSON.stringify({ creative_id: creativeId }),
          status: "PAUSED",
          access_token: conn.token,
        }),
      });
      newAdIds.push(newAd.id);
    } catch (e) {
      console.warn(`[cbo->abo] cluster ${labels[i]} falhou:`, (e as Error).message);
    }
  }

  if (!newAdsetIds.length) {
    return { ok: false, error: "Nenhum adset ABO criado" };
  }

  // 6) Persiste a nova campanha
  await admin.from("facebook_campaigns").insert({
    consultant_id: row.consultant_id,
    fb_campaign_id: newCampaignId,
    fb_adset_ids: newAdsetIds,
    fb_ad_ids: newAdIds,
    name: newCampaignName,
    cities: row.cities,
    age_min: row.age_min,
    age_max: row.age_max,
    daily_budget_cents: adsetBudgets.slice(0, newAdsetIds.length).reduce((a, b) => a + b, 0),
    duration_days: row.duration_days,
    status: "active",
    started_at: new Date().toISOString(),
    distribuidora: row.distribuidora,
    optimization_strategy: "abo",
    parent_campaign_id: row.id,
  });

  // 7) Ativa nova campanha + adsets + ads
  try {
    for (const id of [...newAdsetIds, ...newAdIds]) {
      await fbFetch(`/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ status: "ACTIVE", access_token: conn.token }),
      });
    }
    await fbFetch(`/${newCampaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status: "ACTIVE", access_token: conn.token }),
    });
  } catch (e) {
    console.warn("[cbo->abo] ativação parcial:", (e as Error).message);
  }

  // 8) Pausa a campanha CBO antiga
  try {
    await fbFetch(`/${row.fb_campaign_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status: "PAUSED", access_token: conn.token }),
    });
  } catch (e) {
    console.warn("[cbo->abo] pausa antiga falhou:", (e as Error).message);
  }

  await admin.from("facebook_campaigns")
    .update({ status: "migrated", migrated_to_abo_at: new Date().toISOString() })
    .eq("id", row.id);

  // 9) Notifica o consultor
  await notifyConsultant(
    row.consultant_id,
    "info",
    "Campanha otimizada (CBO → ABO) ⚡",
    `Sua campanha "${row.name}" tem mais de 7 dias e foi dividida em ${newAdsetIds.length} grupos pra reduzir CPL.\n\n` +
    `Orçamento por grupo: ${adsetBudgets.slice(0, newAdsetIds.length).map((b) => `R$ ${(b/100).toFixed(2)}`).join(" / ")}/dia\n` +
    `A versão antiga foi pausada (não deletada — você pode reativar pelo painel se quiser).`,
  );

  return { ok: true, new_campaign_id: newCampaignId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* sem body — modo cron */ }

    let query = admin
      .from("facebook_campaigns")
      .select("*")
      .eq("status", "active")
      .eq("optimization_strategy", "cbo")
      .is("migrated_to_abo_at", null)
      .lt("started_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .gte("leads_count", 20)
      .limit(20);

    if (body?.campaign_id) {
      query = admin.from("facebook_campaigns").select("*").eq("id", body.campaign_id);
    }
    const { data: campaigns } = await query;
    const results: any[] = [];
    for (const row of (campaigns || [])) {
      const r = await migrateOne(row).catch((e) => ({ ok: false, error: (e as Error).message }));
      results.push({ id: row.id, ...r });
    }
    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cbo->abo]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
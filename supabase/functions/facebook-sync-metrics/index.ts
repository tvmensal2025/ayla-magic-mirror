// Sincroniza métricas das campanhas ativas. Roda via cron a cada 30 min.
import { adminClient, FB_GRAPH, fbFetch, loadCampaignConnection } from "../_shared/fb-graph.ts";
import { notifyConsultant } from "../_shared/notify-consultant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    // Carrega config da plataforma (markup + min auto-pause)
    const { data: pSettings } = await admin
      .from("platform_settings").select("*").eq("id", true).maybeSingle();
    const feePct = Number(pSettings?.platform_fee_percent ?? 20) / 100; // 20% padrão
    const lowAlertCents = Number(pSettings?.low_balance_alert_cents ?? 2000);
    const { data: campaigns } = await admin
      .from("facebook_campaigns")
      .select("id, consultant_id, fb_campaign_id, status, started_at")
      .in("status", ["active", "paused", "pending_review"]);
    if (!campaigns?.length) return new Response(JSON.stringify({ synced: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // cache de tokens por consultor (agora vem da plataforma compartilhada)
    const tokenCache: Record<string, string> = {};
    // cache de saldo da carteira por consultor (cents) — pra auto-pause por saldo zerado
    const walletCache: Record<string, { balance: number; auto_pause_at: number } | null> = {};
    async function getWallet(consultantId: string) {
      if (walletCache[consultantId] !== undefined) return walletCache[consultantId];
      const { data } = await admin.from("consultant_wallet").select("balance_cents,auto_pause_at_cents").eq("consultant_id", consultantId).maybeSingle();
      walletCache[consultantId] = data ? { balance: Number(data.balance_cents), auto_pause_at: Number(data.auto_pause_at_cents) } : null;
      return walletCache[consultantId];
    }
    // cache de CPL médio do consultor (centavos) — pra auto-pause adaptativo
    const cplAvgCache: Record<string, number | null> = {};
    async function getConsultantAvgCpl(consultantId: string): Promise<number | null> {
      if (cplAvgCache[consultantId] !== undefined) return cplAvgCache[consultantId];
      const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      const { data } = await admin
        .from("facebook_metrics_daily")
        .select("spend_cents,leads,campaign_id,facebook_campaigns!inner(consultant_id)")
        .eq("facebook_campaigns.consultant_id", consultantId)
        .gte("date", since);
      let totSpend = 0; let totLeads = 0;
      for (const r of (data as any[]) || []) { totSpend += r.spend_cents || 0; totLeads += r.leads || 0; }
      const avg = totLeads >= 5 ? Math.round(totSpend / totLeads) : null; // exige amostra mínima
      cplAvgCache[consultantId] = avg;
      return avg;
    }
    let synced = 0;
    let autoPaused = 0;

    for (const c of campaigns) {
      try {
        if (!tokenCache[c.consultant_id]) {
          const conn = await loadCampaignConnection(c.consultant_id);
          if (!conn) continue;
          tokenCache[c.consultant_id] = conn.token;
        }
        const token = tokenCache[c.consultant_id];
        const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
        const until = new Date().toISOString().slice(0, 10);
        const url = `${FB_GRAPH}/${c.fb_campaign_id}/insights?fields=impressions,reach,clicks,ctr,cpm,spend,actions,frequency&time_range={"since":"${since}","until":"${until}"}&time_increment=1&access_token=${token}`;
        const json = await fbFetch(url);

        // Breakdown por placement (publisher_platform + platform_position) nos últimos 7d
        // — sem time_increment pra agregar e dar custo/lead por placement.
        let cplByPlacement: Record<string, { spend: number; leads: number; cpl: number }> = {};
        try {
          const urlBp = `${FB_GRAPH}/${c.fb_campaign_id}/insights?fields=spend,actions&breakdowns=publisher_platform,platform_position&date_preset=last_7d&access_token=${token}`;
          const bp = await fbFetch(urlBp);
          for (const row of bp?.data || []) {
            const key = `${row.publisher_platform || "?"}:${row.platform_position || "?"}`;
            const spend = Math.round(parseFloat(row.spend || "0") * 100);
            const leads = Number((row.actions || []).find((a: any) =>
              a.action_type === "lead" ||
              a.action_type === "onsite_conversion.messaging_conversation_started_7d"
            )?.value || 0);
            const cpl = leads > 0 ? Math.round(spend / leads) : 0;
            cplByPlacement[key] = { spend, leads, cpl };
          }
        } catch (be) {
          console.warn("[fb-sync] breakdown placement falhou", c.fb_campaign_id, (be as Error).message);
        }

        let totalSpend = 0; let totalLeads = 0; let totalConv = 0; let maxFreq = 0;
        for (const row of json.data || []) {
          const date = row.date_start;
          const leads = (row.actions || []).find((a: any) => a.action_type === "lead")?.value || 0;
          const conv = (row.actions || []).find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value || 0;
          const regs = (row.actions || []).find((a: any) => a.action_type === "complete_registration")?.value || 0;
          const spend = Math.round(parseFloat(row.spend || "0") * 100);
          const cpl = leads > 0 ? Math.round(spend / Number(leads)) : 0;
          totalSpend += spend; totalLeads += Number(leads); totalConv += Number(conv);
          maxFreq = Math.max(maxFreq, parseFloat(row.frequency || "0"));
          // Lê linha existente pra calcular delta de gasto a debitar da wallet
          const { data: prev } = await admin
            .from("facebook_metrics_daily")
            .select("spend_cents,synced_to_wallet_cents")
            .eq("campaign_id", c.id)
            .eq("date", date)
            .maybeSingle();
          const alreadyDebited = Number((prev as any)?.synced_to_wallet_cents ?? 0);
          const deltaSpend = Math.max(0, spend - alreadyDebited);
          if (deltaSpend > 0) {
            // Aplica markup da plataforma sobre o gasto bruto Meta
            const chargeCents = Math.round(deltaSpend * (1 + feePct));
            try {
              await admin.rpc("debit_consultant_wallet", {
                _consultant_id: c.consultant_id,
                _amount_cents: chargeCents,
                _campaign_id: c.id,
                _description: `Gasto Facebook ${date} (Meta R$ ${(deltaSpend/100).toFixed(2)} + margem ${(feePct*100).toFixed(0)}%)`,
                _metadata: { date, fb_campaign_id: c.fb_campaign_id, gross_meta_cents: deltaSpend, fee_percent: feePct },
                _gross_spend_cents: deltaSpend,
              });
              walletCache[c.consultant_id] = undefined as any; // invalida cache
            } catch (de) { console.error("[fb-sync] debit failed", c.id, (de as Error).message); }
          }
          await admin.from("facebook_metrics_daily").upsert({
            campaign_id: c.id,
            date,
            impressions: parseInt(row.impressions || "0"),
            reach: parseInt(row.reach || "0"),
            clicks: parseInt(row.clicks || "0"),
            ctr_bps: Math.round(parseFloat(row.ctr || "0") * 100),
            cpm_cents: Math.round(parseFloat(row.cpm || "0") * 100),
            spend_cents: spend,
            gross_spend_cents: spend,
            synced_to_wallet_cents: spend,
            leads: Number(leads),
            messaging_conversations_started: Number(conv),
            complete_registrations: Number(regs),
            cost_per_lead_cents: cpl,
            frequency_x100: Math.round(parseFloat(row.frequency || "0") * 100),
            cpl_by_placement: cplByPlacement,
            updated_at: new Date().toISOString(),
          }, { onConflict: "campaign_id,date" });
        }
        synced++;

        // Persiste leads_count agregado (necessário pro CBO→ABO disparar)
        // Conta leads + conversas iniciadas como "sinal de lead" — ABO precisa de >=20.
        try {
          await admin.from("facebook_campaigns")
            .update({ leads_count: totalLeads + totalConv, updated_at: new Date().toISOString() })
            .eq("id", c.id);
        } catch (ue) { console.error("[fb-sync] leads_count update failed", c.id, (ue as Error).message); }

        // Auto-pause adaptativo (2026):
        // 1) Frequência cap 3.0 (cold messaging cansa rápido)
        // 2) R$30+ sem nenhuma conversa/lead
        // 3) CPL atual > 2.5x do CPL médio dos últimos 30d do consultor
        // 4) 5 dias seguidos com zero leads (consome verba à toa)
        const reachedActions = totalLeads + totalConv;
        const cplAvg = await getConsultantAvgCpl(c.consultant_id);
        const cplNow = reachedActions > 0 ? Math.round(totalSpend / reachedActions) : null;
        const cplBlown = cplAvg && cplNow && cplNow > cplAvg * 2.5 && totalSpend >= 1500;
        // Conta dias seguidos sem leads no fim da janela
        const daily = (json.data || []).slice().sort((a: any, b: any) => (a.date_start > b.date_start ? -1 : 1));
        let zeroStreak = 0;
        for (const row of daily) {
          const l = Number((row.actions || []).find((a: any) => a.action_type === "lead")?.value || 0);
          const c2 = Number((row.actions || []).find((a: any) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value || 0);
          if (l + c2 === 0) zeroStreak++; else break;
        }
        // Auto-pause também por saldo da wallet abaixo do limite
        const wallet = await getWallet(c.consultant_id);
        const lowBalance = wallet && wallet.balance <= wallet.auto_pause_at;
        const shouldPause = c.status === "active" && (
          maxFreq > 3 ||
          (totalSpend >= 3000 && reachedActions === 0) ||
          cplBlown ||
          zeroStreak >= 5 ||
          lowBalance
        );
        if (shouldPause) {
          try {
            let reason: string;
            if (lowBalance) reason = `Auto-pausada: saldo da carteira baixo (R$ ${((wallet?.balance||0)/100).toFixed(2)}) — recarregue para reativar`;
            else if (maxFreq > 3) reason = `Auto-pausada: frequência ${maxFreq.toFixed(1)} > 3 — criativo cansado`;
            else if (cplBlown) reason = `Auto-pausada: CPL R$${(cplNow!/100).toFixed(2)} > 2.5x da média da conta (R$${(cplAvg!/100).toFixed(2)})`;
            else if (zeroStreak >= 5) reason = `Auto-pausada: ${zeroStreak} dias seguidos sem leads`;
            else reason = `Auto-pausada: gastou R$ ${(totalSpend/100).toFixed(2)} sem leads (últimos 7 dias)`;
            await fbFetch(`${FB_GRAPH}/${c.fb_campaign_id}?status=PAUSED&access_token=${token}`, { method: "POST" });
            await admin.from("facebook_campaigns")
              .update({ status: "paused", rejection_reason: reason })
              .eq("id", c.id);
            autoPaused++;
            try {
              await notifyConsultant(c.consultant_id, lowBalance ? "warning" : "info",
                lowBalance ? "Campanha pausada — saldo baixo 💳" : "Campanha pausada automaticamente",
                reason);
            } catch (_) {}
          } catch (pe) { console.error("[fb-sync] auto-pause failed", c.fb_campaign_id, (pe as Error).message); }
        }
      } catch (e) {
        console.error("[fb-sync]", c.fb_campaign_id, (e as Error).message);
      }
    }

    return new Response(JSON.stringify({ synced, auto_paused: autoPaused }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

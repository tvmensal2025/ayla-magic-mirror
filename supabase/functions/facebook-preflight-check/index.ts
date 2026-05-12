// Pré-voo da campanha: valida token, conta, número WA, e pede reach estimate à Meta.
// Retorna issues bloqueantes + estimativa de alcance — chamado antes de publicar.
import { authConsultant, corsHeaders, FB_GRAPH, fbFetch, loadCampaignConnection } from "../_shared/fb-graph.ts";

interface PreflightBody {
  cities?: { key: string; name: string }[];
  daily_budget_cents?: number;
  age_min?: number;
  age_max?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const conn = await loadCampaignConnection(auth.id);
    if (!conn) return json({ ok: false, blockers: ["Conta principal de anúncios em sincronização. Tente novamente em instantes."], warnings: [], reach: null }, 200);

    const body = (await req.json().catch(() => ({}))) as PreflightBody;
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Token vivo?
    try {
      const tk = await fbFetch(`/debug_token?input_token=${conn.token}&access_token=${conn.token}`);
      const exp = tk?.data?.expires_at as number | undefined;
      if (exp && exp > 0) {
        const daysLeft = Math.floor((exp * 1000 - Date.now()) / 86400_000);
        if (daysLeft < 0) {
          blockers.push("Token do Facebook expirou — reconecte sua conta");
          return json({ ok: false, blockers, warnings, reach: null });
        }
        if (daysLeft < 7) warnings.push(`Token do Facebook expira em ${daysLeft} dias — reconecte logo`);
      }
      if (tk?.data?.is_valid === false) {
        blockers.push("Token do Facebook inválido — reconecte sua conta");
        return json({ ok: false, blockers, warnings, reach: null });
      }
    } catch (e) {
      blockers.push("Token do Facebook expirou — reconecte sua conta");
      return json({ ok: false, blockers, warnings, reach: null });
    }

    // 2. Página + WhatsApp number presente
    if (!conn.page_id) blockers.push("Página do Facebook não selecionada");
    if (!conn.whatsapp_destination_number) blockers.push("Número de WhatsApp de destino não configurado");

    // 3. Ad account ativo + payment + spend cap
    try {
      const acct = await fbFetch(`/${conn.ad_account_id}?fields=account_status,disable_reason,currency,funding_source,spend_cap,amount_spent&access_token=${conn.token}`);
      if (acct?.account_status && acct.account_status !== 1) {
        const reasonMap: Record<number, string> = { 2: "desativada", 3: "não confirmada", 7: "em revisão", 8: "pendente fechamento", 9: "em revisão pelo Meta", 100: "pendente revisão de pagamento", 101: "fechada", 201: "qualquer revisão" };
        blockers.push(`Conta de anúncios ${reasonMap[acct.account_status] || `status ${acct.account_status}`}`);
      }
      if (!acct?.funding_source) {
        blockers.push("Conta de anúncios sem forma de pagamento — adicione cartão no Meta Business Manager");
      }
      if (acct?.spend_cap && acct?.amount_spent) {
        const remaining = (Number(acct.spend_cap) - Number(acct.amount_spent)) / 100;
        if (remaining < 50) warnings.push(`Limite de gasto da conta quase no fim (R$${remaining.toFixed(2)} restantes)`);
      }
    } catch (e) {
      warnings.push("Não foi possível validar status da conta de anúncios");
    }

    // 4. Página tem WhatsApp Business vinculado E o número de destino é um número WABA?
    if (conn.page_id && conn.whatsapp_destination_number) {
      try {
        const pg = await fbFetch(`/${conn.page_id}?fields=connected_whatsapp_business_account{id,phone_numbers{display_phone_number,verified_name}}&access_token=${conn.token}`);
        const waba = pg?.connected_whatsapp_business_account;
        if (!waba?.id) {
          blockers.push("Página sem WhatsApp Business vinculado — vincule no Meta Business Suite → Configurações → WhatsApp Manager. Sem isso o Facebook reprova o anúncio (subcode 2446885).");
        } else {
          const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
          const dest = onlyDigits(conn.whatsapp_destination_number);
          const numbers: string[] = (waba?.phone_numbers?.data || []).map((n: { display_phone_number: string }) => onlyDigits(n.display_phone_number));
          const matched = numbers.some((n) => n === dest || dest.endsWith(n) || n.endsWith(dest));
          if (numbers.length > 0 && !matched) {
            blockers.push(`Número de destino (${conn.whatsapp_destination_number}) não está registrado como WhatsApp Business na sua Página. Números WABA disponíveis: ${numbers.join(", ")}. Use um destes ou registre o número no WhatsApp Manager.`);
          }
        }
      } catch (_) {
        warnings.push("Não foi possível confirmar se o número é WhatsApp Business — se o anúncio for reprovado, verifique no Meta Business Suite.");
      }
    }

    // 5. Pixel vivo (recebeu evento nos últimos 7 dias)?
    if (conn.pixel_id) {
      try {
        const px = await fbFetch(`/${conn.pixel_id}?fields=last_fired_time,is_unavailable&access_token=${conn.token}`);
        if (px?.is_unavailable) warnings.push("Pixel marcado como indisponível pelo Meta");
        if (px?.last_fired_time) {
          const ageH = (Date.now() - new Date(px.last_fired_time).getTime()) / 3_600_000;
          if (ageH > 168) warnings.push(`Pixel sem eventos há ${Math.round(ageH / 24)} dias — não vai otimizar bem`);
        } else {
          warnings.push("Pixel nunca disparou — eventos do site não estão chegando");
        }
      } catch (_) { /* não crítico */ }
    }

    // 6. Reach estimate (não bloqueante)
    let reach: { lower: number; upper: number; daily_min: number; daily_max: number } | null = null;
    if (body.cities?.length && blockers.length === 0) {
      try {
        const cityKeys = body.cities.map((c) => c.key).slice(0, 200);
        const targeting: Record<string, unknown> = {
          geo_locations: { cities: cityKeys.map((key) => ({ key })) },
          age_min: body.age_min || 25,
          age_max: body.age_max || 65,
          targeting_automation: { advantage_audience: 1 },
        };
        // Reach fiel à campanha real: passa destination_type=WHATSAPP +
        // promoted_object pra Meta filtrar quem tem WhatsApp instalado.
        const promotedObject = conn.page_id && conn.whatsapp_destination_number
          ? { page_id: conn.page_id, whatsapp_phone_number: conn.whatsapp_destination_number }
          : null;
        const params = new URLSearchParams({
          targeting_spec: JSON.stringify(targeting),
          optimization_goal: "CONVERSATIONS",
          access_token: conn.token,
        });
        if (promotedObject) {
          params.set("destination_type", "WHATSAPP");
          params.set("promoted_object", JSON.stringify(promotedObject));
        }
        const url = `${FB_GRAPH}/${conn.ad_account_id}/reachestimate?${params.toString()}`;
        const r = await fbFetch(url);
        const est = r?.data || r;
        const lower = Number(est?.users_lower_bound ?? est?.users ?? 0);
        const upper = Number(est?.users_upper_bound ?? est?.users ?? 0);
        // Estimativa diária bem grosseira: ~3-7% do alcance total por dia com orçamento típico
        const daily_min = Math.round(lower * 0.03);
        const daily_max = Math.round(upper * 0.07);
        reach = { lower, upper, daily_min, daily_max };
        if (lower < 1000) warnings.push(`Audiência muito pequena (${lower.toLocaleString("pt-BR")}) — adicione mais cidades pra baratear o lead`);
      } catch (e) {
        warnings.push("Não foi possível estimar alcance — campanha será criada mesmo assim");
      }
    }

    return json({ ok: blockers.length === 0, blockers, warnings, reach });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
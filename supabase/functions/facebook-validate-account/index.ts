// Valida conta antes de lançar campanha. Retorna lista de problemas.
import { authConsultant, corsHeaders, fbFetch, loadConnection } from "../_shared/fb-graph.ts";

const WA_BUSINESS_REQUIRED_MESSAGE =
  "A Página selecionada precisa ter uma conta WhatsApp Business vinculada. No Meta Business Suite, conecte o número como WhatsApp Business e depois volte em 'Selecionar assets'.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const conn = await loadConnection(auth.id);
    if (!conn) return new Response(JSON.stringify({ ok: false, issues: ["Conta do Facebook não conectada."] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const issues: string[] = [];
    const warnings: string[] = [];

    // Valida token primeiro
    const me = await fbFetch(`/me?fields=id,name&access_token=${conn.token}`).catch((e) => ({ error: e.message }));
    if ((me as any).error) {
      issues.push(`Token expirado ou inválido — reconecte o Facebook. (${(me as any).error})`);
      return new Response(JSON.stringify({ ok: false, issues, warnings }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!conn.ad_account_id) issues.push("Selecione uma conta de anúncios.");
    if (!conn.page_id) issues.push("Selecione uma Página do Facebook.");
    if (!conn.whatsapp_destination_number) {
      issues.push("Configure o número de WhatsApp Business que vai receber os leads (em 'Selecionar assets').");
    } else if (conn.page_id && conn.ad_account_id) {
      try {
        await fbFetch(`/${conn.ad_account_id}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify({ geo_locations: { countries: ["BR"] } }))}&optimization_goal=CONVERSATIONS&destination_type=WHATSAPP&promoted_object=${encodeURIComponent(JSON.stringify({ page_id: conn.page_id, whatsapp_phone_number: conn.whatsapp_destination_number }))}&access_token=${conn.token}`);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("2446885") || msg.includes("conta pessoal")) issues.push(WA_BUSINESS_REQUIRED_MESSAGE);
      }
    }

    if (conn.ad_account_id) {
      const acc = await fbFetch(`/${conn.ad_account_id}?fields=account_status,disable_reason,funding_source_details,currency,balance,amount_spent,spend_cap&access_token=${conn.token}`).catch((e) => ({ error: e.message }));
      if ((acc as any).error) {
        issues.push(`Não foi possível ler a conta: ${(acc as any).error}`);
      } else {
        // 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 9=IN_GRACE_PERIOD
        if (acc.account_status !== 1 && acc.account_status !== 9) {
          issues.push(`Conta de anúncios inativa (status ${acc.account_status}).`);
        }
        if (!acc.funding_source_details) {
          issues.push("Conta sem cartão/forma de pagamento configurada.");
        }
      }
    }

    if (conn.page_id) {
      const page = await fbFetch(`/${conn.page_id}?fields=id,name,is_published&access_token=${conn.token}`).catch((e) => ({ error: e.message }));
      if ((page as any).error) issues.push(`Página inacessível: ${(page as any).error}`);
    }

    if (!conn.pixel_id) {
      warnings.push("Pixel não configurado — atribuição ficará prejudicada.");
    }

    return new Response(JSON.stringify({ ok: issues.length === 0, issues, warnings }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[fb-validate]", err);
    return new Response(JSON.stringify({ ok: false, issues: [(err as Error).message], warnings: [] }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

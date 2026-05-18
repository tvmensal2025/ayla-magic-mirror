// Retorna saldo atual da conta Facebook da plataforma + gasto sincronizado pelo sistema. Apenas admin.
import { adminClient, authConsultant, corsHeaders, fbFetch, loadPlatformAccount } from "../_shared/fb-graph.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toCents(v: unknown) {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const admin = adminClient();
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json({ error: "Forbidden" }, 403);

    const platform = await loadPlatformAccount();
    if (!platform) return json({ connected: false });

    const acc = await fbFetch(
      `/${platform.ad_account_id}?fields=name,currency,balance,amount_spent,spend_cap,account_status,disable_reason,funding_source_details&access_token=${platform.token}`,
    ).catch((e) => ({ error: e.message }));

    if ((acc as any).error) {
      return json({ connected: true, error: (acc as any).error });
    }

    // Permissões concedidas / negadas
    const perms = await fbFetch(`/me/permissions?access_token=${platform.token}`).catch(() => ({ data: [] }));
    const granted: string[] = [];
    const declined: string[] = [];
    for (const p of ((perms as any).data || [])) {
      if (p.status === "granted") granted.push(p.permission);
      else declined.push(p.permission);
    }
    const REQUIRED = [
      "ads_management", "ads_read", "business_management", "leads_retrieval",
      "pages_show_list", "pages_read_engagement", "pages_manage_metadata",
      "pages_manage_ads", "instagram_basic", "instagram_manage_insights",
      "read_insights",
    ];
    const missing = REQUIRED.filter((p) => !granted.includes(p));

    const balance_cents = toCents((acc as any).balance);
    const lifetime_amount_spent_cents = toCents((acc as any).amount_spent);
    const spend_cap_cents = toCents((acc as any).spend_cap);
    const prepaidAccount = Number((acc as any).account_status) === 9 || balance_cents > 0;
    const available_cents = prepaidAccount
      ? balance_cents
      : spend_cap_cents > 0
        ? Math.max(0, spend_cap_cents - lifetime_amount_spent_cents)
        : balance_cents;

    const { data: systemSpend } = await admin
      .from("wallet_transactions")
      .select("amount_cents,gross_spend_cents,created_at")
      .eq("type", "spend");
    const system_spend_cents = ((systemSpend as any[]) || [])
      .reduce((sum, row) => sum + Number(row.gross_spend_cents ?? row.amount_cents ?? 0), 0);
    const system_charged_cents = ((systemSpend as any[]) || [])
      .reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);
    const last_system_sync_at = ((systemSpend as any[]) || [])
      .map((row) => row.created_at as string | null)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    // Δ = quanto a Meta gastou que o sistema ainda não contabilizou
    const delta_unsynced_cents = Math.max(0, lifetime_amount_spent_cents - system_spend_cents);

    return json({
      connected: true,
      ad_account_id: platform.ad_account_id,
      name: (acc as any).name ?? null,
      currency: (acc as any).currency ?? "BRL",
      account_status: (acc as any).account_status ?? null,
      balance_cents,
      amount_spent_cents: system_spend_cents,
      system_spend_cents,
      system_charged_cents,
      lifetime_amount_spent_cents,
      delta_unsynced_cents,
      spend_cap_cents,
      available_cents,
      has_funding: !!(acc as any).funding_source_details || prepaidAccount || spend_cap_cents > 0,
      last_system_sync_at,
      permissions: {
        granted,
        declined,
        missing,
        all_ok: missing.length === 0,
      },
    });
  } catch (err) {
    console.error("[fb-platform-balance]", err);
    return json({ error: (err as Error).message }, 500);
  }
});
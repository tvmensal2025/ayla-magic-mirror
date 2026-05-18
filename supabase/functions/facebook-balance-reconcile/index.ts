// Reconciliação diária: compara gasto da Meta (lifetime_amount_spent) com total debitado em wallet_transactions.
// Se divergir > 50 centavos, registra transação 'adjustment' para alinhar e dispara log.
// Pode ser chamado manualmente (admin) ou via cron pg_cron.
import { adminClient, corsHeaders, fbFetch, loadPlatformAccount } from "../_shared/fb-graph.ts";

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
    const admin = adminClient();
    const platform = await loadPlatformAccount();
    if (!platform) return json({ ok: false, reason: "no_platform_account" });

    const acc = await fbFetch(
      `/${platform.ad_account_id}?fields=amount_spent,currency&access_token=${platform.token}`,
    ).catch((e) => ({ error: (e as Error).message }));

    if ((acc as any).error) return json({ ok: false, error: (acc as any).error });

    const meta_lifetime_cents = toCents((acc as any).amount_spent);

    const { data: rows } = await admin
      .from("wallet_transactions")
      .select("amount_cents,gross_spend_cents")
      .eq("type", "spend");

    const system_lifetime_cents = ((rows as any[]) || [])
      .reduce((sum, r) => sum + Number(r.gross_spend_cents ?? r.amount_cents ?? 0), 0);

    const delta = meta_lifetime_cents - system_lifetime_cents;
    const result: Record<string, unknown> = {
      ok: true,
      meta_lifetime_cents,
      system_lifetime_cents,
      delta_cents: delta,
      currency: (acc as any).currency ?? "BRL",
      adjusted: false,
    };

    if (Math.abs(delta) >= 50) {
      // Procura wallet da plataforma (consultor admin) — usa o primeiro consultant_id com role super_admin
      const { data: superAdmin } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin")
        .limit(1)
        .maybeSingle();

      const consultantId = (superAdmin as any)?.user_id;

      if (consultantId && delta > 0) {
        // Meta gastou mais do que o sistema sabe → registra adjustment como spend extra
        await admin.from("wallet_transactions").insert({
          consultant_id: consultantId,
          type: "spend",
          amount_cents: delta,
          gross_spend_cents: delta,
          description: "Reconciliação automática: Meta gastou além do sincronizado",
          metadata: { kind: "balance_reconcile", meta_lifetime_cents, system_lifetime_cents },
        });
        result.adjusted = true;
      }
    }

    return json(result);
  } catch (err) {
    console.error("[fb-balance-reconcile]", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

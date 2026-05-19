// Fallback para "Assumir / Devolver IA" quando RLS bloqueia o update direto.
// Valida via JWT que o usuário é dono OU super admin e atualiza o customer
// usando service_role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  customerId: string;
  paused: boolean; // true = humano assume, false = devolve para IA
  reason?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await userClient.auth.getUser(jwt);
    const userId = userRes?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.customerId || typeof body?.paused !== "boolean") {
      return json({ error: "missing_fields", message: "Faltam dados (customerId, paused)." }, 400);
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("id, consultant_id")
      .eq("id", body.customerId)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found", message: "Lead não encontrado." }, 404);

    // Auth: dono OU super admin
    if (customer.consultant_id !== userId) {
      const { data: isAdmin } = await supabase.rpc("is_super_admin", { _user_id: userId });
      if (!isAdmin) return json({ error: "forbidden", message: "Sem permissão sobre esse lead." }, 403);
    }

    const patch: Record<string, any> = body.paused
      ? {
          bot_paused: true,
          bot_paused_reason: body.reason || "humano_assumiu",
          bot_paused_at: new Date().toISOString(),
          bot_paused_until: null, // limpa timer pra não confundir crons
          assigned_human_id: userId,
          updated_at: new Date().toISOString(),
        }
      : {
          bot_paused: false,
          bot_paused_reason: null,
          bot_paused_at: null,
          bot_paused_until: null,
          assigned_human_id: null,
          updated_at: new Date().toISOString(),
        };

    const { error } = await supabase
      .from("customers")
      .update(patch)
      .eq("id", body.customerId);

    if (error) {
      console.error("[customer-takeover] update falhou:", error);
      return json({ error: "update_failed", message: error.message, code: error.code, details: error.details }, 500);
    }

    return json({ ok: true, paused: body.paused });
  } catch (e: any) {
    console.error("[customer-takeover] crash:", e?.message);
    return json({ error: "server_error", message: e?.message || String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Edge: flow-simulate-reset
// Limpa o customer sandbox (phone range 5500000xxx) deste consultor + estados
// derivados e runs de teste antigos. Não toca em dados reais.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

function testPhoneFor(consultantId: string): string {
  let h = 0;
  for (const ch of consultantId) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  const suffix = String(Math.abs(h)).padStart(8, "0").slice(0, 8);
  return `5500000${suffix}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const requestedConsultantId = String(body?.consultant_id || user.id);

    if (requestedConsultantId !== user.id) {
      const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) =>
        ["admin", "super_admin", "superadmin"].includes(String(r.role)),
      );
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    // Usa o mesmo consultor canônico do flow-simulate-run/whapi-webhook.
    // Sem isso, reset limpava o telefone sandbox do usuário e o run usava o superadmin.
    const { data: sRow } = await svc
      .from("settings")
      .select("value")
      .eq("key", "superadmin_consultant_id")
      .maybeSingle();
    const realSuperAdminId = String((sRow as any)?.value || "").trim();
    if (!realSuperAdminId) return json({ error: "superadmin_consultant_id_missing" }, 500);
    const consultantId = realSuperAdminId;

    // Real mode → reseta pelo telefone real informado. Sandbox → phone determinístico.
    const realMode = body?.real_mode === true;
    const rawRealPhone = String(body?.real_phone || "").replace(/\D/g, "");
    const phone = realMode && rawRealPhone ? rawRealPhone : testPhoneFor(consultantId);

    // Acha customers pelo phone. Em real mode, exige is_test_lead=true
    // pra NUNCA apagar um cliente real por engano.
    let q = svc
      .from("customers")
      .select("id, is_test_lead, is_sandbox")
      .eq("phone_whatsapp", phone)
      .eq("consultant_id", consultantId);
    if (realMode) q = q.eq("is_test_lead", true);
    const { data: list } = await q;
    const ids = (list || []).map((r: any) => r.id);

    if (ids.length > 0) {
      // Dependências sem cascade
      const safeDelete = async (table: string, col: string) => {
        await svc.from(table).delete().in(col, ids).then(() => {}, () => {});
      };
      await safeDelete("customer_flow_state", "customer_id");
      await safeDelete("customer_memory", "customer_id");
      await safeDelete("customer_processing_lock", "customer_id");
      await safeDelete("whatsapp_message_buffer", "customer_id");
      await safeDelete("conversations", "customer_id");
      await safeDelete("ai_slot_dispatch_log", "customer_id");
      // bot_test_runs / bot_test_outbound do customer
      const { data: oldRuns } = await svc
        .from("bot_test_runs")
        .select("id")
        .in("customer_id", ids);
      const runIds = (oldRuns || []).map((r: any) => r.id);
      if (runIds.length > 0) {
        await svc.from("bot_test_outbound").delete().in("run_id", runIds).then(() => {}, () => {});
        await svc.from("bot_test_runs").delete().in("id", runIds).then(() => {}, () => {});
      }
      await svc.from("customers").delete().in("id", ids);
    }
    return json({ deleted: ids.length, phone });
  } catch (e) {
    return json({ error: "internal", detail: String((e as Error)?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

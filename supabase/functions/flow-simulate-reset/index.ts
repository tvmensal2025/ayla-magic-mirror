// Edge: flow-simulate-reset
// Apaga o customer sandbox do consultor (qualquer linha is_sandbox=true).
// Os triggers garantem que não há lixo em outras tabelas — só o próprio
// customer + linhas que referenciam direto (customer_memory, etc.) caem
// via FK on delete cascade quando configurado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const consultantId = String(body?.consultant_id || user.id);

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (consultantId !== user.id) {
      const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) =>
        ["admin", "super_admin", "superadmin"].includes(String(r.role)),
      );
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    // Limpa todos os customers sandbox deste consultor
    const { data: list } = await svc
      .from("customers")
      .select("id")
      .eq("consultant_id", consultantId)
      .eq("is_sandbox", true);

    const ids = (list || []).map((r: any) => r.id);
    if (ids.length > 0) {
      // Apaga dependências comuns que NÃO têm trigger (estado de fluxo, memória).
      await svc.from("customer_flow_state").delete().in("customer_id", ids).then(() => {}, () => {});
      await svc.from("customer_memory").delete().in("customer_id", ids).then(() => {}, () => {});
      await svc.from("customer_processing_lock").delete().in("customer_id", ids).then(() => {}, () => {});
      await svc.from("whatsapp_message_buffer").delete().in("customer_id", ids).then(() => {}, () => {});
      await svc.from("customers").delete().in("id", ids);
    }
    return json({ deleted: ids.length });
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

// Conversions API: envia eventos server-side ao Pixel.
// Pode ser chamado por outras edge functions (lead, contact) ou diretamente.
import { adminClient, fbFetch, FB_GRAPH, sha256Hex } from "../_shared/fb-graph.ts";
import { decryptToken } from "../_shared/fb-crypto.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

interface CapiBody {
  consultant_id: string;
  event_name: "Lead" | "Contact" | "SubmitApplication" | "Purchase" | "PageView";
  event_id?: string;
  customer_id?: string | null;
  email?: string | null;
  phone?: string | null;
  value?: number | null;
  currency?: string;
  source_url?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  client_user_agent?: string | null;
  client_ip?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json() as CapiBody;
    if (!body?.consultant_id || !body?.event_name) {
      return new Response(JSON.stringify({ error: "consultant_id e event_name obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = adminClient();
    const { data: conn } = await admin.from("facebook_connections").select("pixel_id,access_token_encrypted").eq("consultant_id", body.consultant_id).maybeSingle();
    if (!conn?.pixel_id) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_pixel" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = await decryptToken(conn.access_token_encrypted);
    const eventId = body.event_id || crypto.randomUUID();

    const userData: Record<string, unknown> = {};
    if (body.email) userData.em = [await sha256Hex(body.email)];
    if (body.phone) userData.ph = [await sha256Hex(body.phone.replace(/\D/g, ""))];
    if (body.fbp) userData.fbp = body.fbp;
    if (body.fbc) userData.fbc = body.fbc;
    if (body.client_user_agent) userData.client_user_agent = body.client_user_agent;
    if (body.client_ip) userData.client_ip_address = body.client_ip;

    const event = {
      event_name: body.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: body.source_url || "https://igreen.institutodossonhos.com.br",
      user_data: userData,
      ...(body.value ? { custom_data: { value: body.value, currency: body.currency || "BRL" } } : {}),
    };

    const fbRes = await fbFetch(`${FB_GRAPH}/${conn.pixel_id}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [event] }),
    }).catch((e) => ({ error: (e as Error).message }));

    await admin.from("facebook_capi_events").insert({
      consultant_id: body.consultant_id,
      customer_id: body.customer_id ?? null,
      event_name: body.event_name,
      event_id: eventId,
      fb_response: fbRes,
      status: (fbRes as any).error ? "failed" : "sent",
    });

    return new Response(JSON.stringify({ ok: true, event_id: eventId, fb: fbRes }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[fb-capi]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

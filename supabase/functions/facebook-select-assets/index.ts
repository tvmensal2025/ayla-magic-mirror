// Salva os assets escolhidos pelo usuário (ad account, page, instagram, pixel) na conexão.
import { adminClient, authConsultant, corsHeaders, FB_GRAPH, loadConnection, loadPlatformAccount } from "../_shared/fb-graph.ts";

interface Body {
  ad_account_id?: string | null;
  page_id?: string | null;
  pixel_id?: string | null;
  whatsapp_destination_number?: string | null;
  scope?: "user" | "platform";
}

function normalizeAdAccount(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("act_")) return trimmed;
  // Aceita "act_123", "123" ou URL contendo o id
  const m = trimmed.match(/(\d{6,})/);
  return m ? `act_${m[1]}` : trimmed;
}

function extractDigits(id: string): string {
  const m = (id || "").match(/(\d{6,})/);
  return m ? m[1] : (id || "").trim();
}

function normalizeWhatsapp(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // garante prefixo 55 se vier sem
  return digits.startsWith("55") ? digits : `55${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({})) as Body;
    const scope: "user" | "platform" = body?.scope === "platform" ? "platform" : "user";
    const admin = adminClient();
    if (scope === "platform") {
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", auth.id).eq("role", "admin").maybeSingle();
      if (!role) return new Response(JSON.stringify({ error: "Apenas Super Admin pode definir a conta principal." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const conn = scope === "platform" ? await loadPlatformAccount() : await loadConnection(auth.id);
    if (!conn) return new Response(JSON.stringify({ error: "Sem conexão Facebook" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tk = conn.token;
    const updates: Record<string, unknown> = {};

    if (body.ad_account_id) {
      const adId = normalizeAdAccount(body.ad_account_id);
      const r = await fetch(`${FB_GRAPH}/${adId}?fields=id,name,currency&access_token=${tk}`);
      const j = await r.json();
      if (!r.ok) return new Response(JSON.stringify({ error: j?.error?.message || "Conta de anúncios inválida ou sem permissão para o token atual." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      updates.ad_account_id = j.id || adId;
      updates.ad_account_name = j.name || adId;
      updates.ad_account_currency = j.currency || null;
    }
    if (body.page_id) {
      const pageId = extractDigits(body.page_id);
      const r = await fetch(`${FB_GRAPH}/${pageId}?fields=id,name,instagram_business_account{id,username}&access_token=${tk}`);
      const j = await r.json();
      if (!r.ok) {
        // Fallback: tenta leitura mínima (apenas name) — algumas permissões avançadas
        // (instagram_business_account) podem estar bloqueadas por App Review.
        const r2 = await fetch(`${FB_GRAPH}/${pageId}?fields=id,name&access_token=${tk}`);
        const j2 = await r2.json();
        if (!r2.ok) {
          // Último fallback: salva o ID cru (sem nome) — útil quando o token não
          // tem pages_show_list aprovado mas a Página é gerenciada pelo usuário.
          updates.page_id = pageId;
          updates.page_name = `Página ${pageId}`;
          updates.ig_account_id = null;
          updates.ig_account_username = null;
        } else {
          updates.page_id = j2.id || pageId;
          updates.page_name = j2.name || `Página ${pageId}`;
          updates.ig_account_id = null;
          updates.ig_account_username = null;
        }
      } else {
        updates.page_id = j.id || pageId;
        updates.page_name = j.name || `Página ${pageId}`;
        updates.ig_account_id = j.instagram_business_account?.id || null;
        updates.ig_account_username = j.instagram_business_account?.username || null;
      }
    }
    if (body.pixel_id !== undefined) {
      if (body.pixel_id) {
        const pxId = extractDigits(body.pixel_id);
        const r = await fetch(`${FB_GRAPH}/${pxId}?fields=id,name&access_token=${tk}`);
        const j = await r.json();
        if (!r.ok) {
          // Pixel é opcional: salva mesmo sem leitura, com nome fallback.
          updates.pixel_id = pxId;
          updates.pixel_name = `Pixel ${pxId}`;
        } else {
          updates.pixel_id = j.id || pxId;
          updates.pixel_name = j.name || `Pixel ${pxId}`;
        }
      } else {
        updates.pixel_id = null;
        updates.pixel_name = null;
      }
    }

    if (body.whatsapp_destination_number !== undefined) {
      if (body.whatsapp_destination_number) {
        const wa = normalizeWhatsapp(body.whatsapp_destination_number);
        if (wa.length < 12 || wa.length > 13) {
          return new Response(JSON.stringify({ error: "Número de WhatsApp inválido. Use formato 55 + DDD + número." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        updates.whatsapp_destination_number = wa;
      } else {
        updates.whatsapp_destination_number = null;
      }
    }

    if (!Object.keys(updates).length) {
      return new Response(JSON.stringify({ ok: true, updated: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    updates.last_validated_at = new Date().toISOString();
    const { error } = scope === "platform"
      ? await admin.from("platform_facebook_account").update(updates).eq("id", true)
      : await admin.from("facebook_connections").update(updates).eq("consultant_id", auth.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ ok: true, updated: true, fields: Object.keys(updates) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[fb-select-assets]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
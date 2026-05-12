// QR Redirect: redireciona QR impresso para o WhatsApp atual da instância do consultor
// Público (sem JWT). Recebe ?l={licenca}. Sempre retorna um redirect — nunca quebra os panfletos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE_URL = "https://igreen.institutodossonhos.com.br";
const DEFAULT_MESSAGE = "Oi! 👋 Vi sobre a iGreen Energy e quero saber como economizar na minha conta de luz.";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildWhatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://api.whatsapp.com/send?phone=${normalized}&text=${encodeURIComponent(message)}`;
}

function redirectTo(url: string) {
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: url,
      "Cache-Control": "public, max-age=60",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Aceita ?l=LICENCA ou path /r/LICENCA
    let licenca = url.searchParams.get("l") || url.searchParams.get("licenca");
    if (!licenca) {
      const parts = url.pathname.split("/").filter(Boolean);
      // ex: /functions/v1/qr-redirect/LICENCA  ou  /r/LICENCA
      licenca = parts[parts.length - 1] || null;
      if (licenca === "qr-redirect") licenca = null;
    }

    const message = url.searchParams.get("msg") || DEFAULT_MESSAGE;

    if (!licenca) {
      // Sem licença → site institucional (panfleto NUNCA quebra, sem expor número pessoal)
      return redirectTo(SITE_URL);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Busca consultor pela licença
    const { data: consultant } = await supabase
      .from("consultants")
      .select("id, phone")
      .eq("license", licenca)
      .maybeSingle();

    let phone: string | null = null;

    if (consultant?.id) {
      // 2) Telefone conectado da instância
      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("connected_phone")
        .eq("consultant_id", consultant.id)
        .not("connected_phone", "is", null)
        .limit(1)
        .maybeSingle();

      phone = (inst?.connected_phone as string | null) || null;

      // 3) Fallback: telefone do perfil do consultor
      if (!phone && consultant.phone) {
        phone = consultant.phone;
      }

      // Tracking (não bloqueia o redirect)
      supabase.from("page_events").insert({
        consultant_id: consultant.id,
        event_type: "qr_scan",
        event_target: "panfleto",
        page_type: "client",
      }).then(() => {});
    }

    // 4) Fallback final: landing page do consultor (sem expor número pessoal)
    if (!phone) {
      return redirectTo(`${SITE_URL}/${licenca}`);
    }

    return redirectTo(buildWhatsappUrl(phone, message));
  } catch (e) {
    console.error("[qr-redirect] error:", e);
    return redirectTo(SITE_URL);
  }
});
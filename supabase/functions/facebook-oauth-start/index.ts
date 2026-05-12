// Gera URL de autorização do Facebook para o consultor logado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { signState } from "../_shared/fb-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FB_VERSION = "v21.0";
const SCOPES = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "email",
  "public_profile",
].join(",");

function allowedReturnOrigin(req: Request, requested?: string | null): string {
  const candidates = [
    requested,
    req.headers.get("origin"),
    req.headers.get("referer") ? (() => {
      try { return new URL(req.headers.get("referer")!).origin; } catch { return null; }
    })() : null,
  ].filter(Boolean) as string[];

  for (const value of candidates) {
    try {
      const origin = new URL(value).origin;
      if (origin.endsWith(".lovable.app") || origin === "https://igreen.institutodossonhos.com.br") return origin;
    } catch { /* ignore */ }
  }
  return "https://igreen.institutodossonhos.com.br";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    let consultantId: string | null = null;
    try {
      // @ts-ignore
      if (typeof supabase.auth.getClaims === "function") {
        // @ts-ignore
        const { data: claimsData } = await supabase.auth.getClaims(token);
        consultantId = (claimsData as any)?.claims?.sub || null;
      }
    } catch (_) { /* fallback */ }
    if (!consultantId) {
      const { data: userData } = await supabase.auth.getUser();
      consultantId = userData?.user?.id || null;
    }
    if (!consultantId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Modo: 'connect' (padrão) ou 'switch' (forçar troca de conta)
    // Escopo: 'user' (consultor) ou 'platform' (conta única da plataforma — só super admin).
    let mode: "connect" | "switch" = "connect";
    let scope: "user" | "platform" = "user";
    let body: any = {};
    try {
      body = await req.json().catch(() => ({}));
      if (body?.mode === "switch") mode = "switch";
      if (body?.scope === "platform") scope = "platform";
    } catch (_) { /* sem body */ }

    // Gate: somente admin pode iniciar OAuth de plataforma.
    if (scope === "platform") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", consultantId)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Apenas Super Admin pode conectar a conta da plataforma." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const appId = Deno.env.get("FACEBOOK_APP_ID");
    if (!appId) throw new Error("FACEBOOK_APP_ID not configured");

    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${projectUrl}/functions/v1/facebook-oauth-callback`;
    const returnOrigin = allowedReturnOrigin(req, body?.return_origin);
    const state = await signState(consultantId, returnOrigin, scope);

    const url = new URL(`https://www.facebook.com/${FB_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    if (mode === "switch") {
      // Solicita ao Facebook reautenticar/permitir trocar conta.
      // Obs.: o Facebook não garante 100% que pedirá senha — depende dos cookies do navegador.
      url.searchParams.set("auth_type", "reauthenticate");
      url.searchParams.set("prompt", "login");
      url.searchParams.set("force_authentication", "1");
    }

    // URL auxiliar de logout do Facebook (para casos em que o usuário queira garantir troca de conta)
    const fbLogoutUrl = `https://www.facebook.com/logout.php?next=${encodeURIComponent(url.toString())}&access_token=`;

    console.log("[fb-oauth-start]", { consultantId, mode, scope, returnOrigin });

    return new Response(JSON.stringify({ url: url.toString(), logout_url: fbLogoutUrl, mode, scope }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[facebook-oauth-start]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

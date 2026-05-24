// Edge: flow-simulate — usado pelo Simulador de Fluxo (admin).
// NÃO envia nada via WhatsApp. Apenas:
//   action="media": devolve áudio/imagem/vídeo reais do slot (ai_media_library)
//   action="ai":   chama Lovable AI Gateway (Gemini) com prompt do passo
// Auth: exige JWT do consultor logado; só permite consultar a si mesmo
// (ou admin/superadmin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return json({ error: "missing_auth" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const consultantId = String(body?.consultant_id || user.id);

    // Authz: só admin/super_admin pode simular outro consultor.
    if (consultantId !== user.id) {
      const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: roles } = await svc
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) =>
        ["admin", "super_admin", "superadmin"].includes(String(r.role)),
      );
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "media") {
      const slotKey = String(body?.slot_key || "").trim();
      if (!slotKey) return json({ media: [] });
      const { data, error } = await svc
        .from("ai_media_library")
        .select("id, kind, url, slot_key, send_order, duration_sec, delay_before_ms, transcript, label")
        .eq("consultant_id", consultantId)
        .eq("slot_key", slotKey)
        .eq("active", true)
        .order("send_order", { ascending: true })
        .limit(20);
      if (error) return json({ error: error.message }, 500);
      return json({ media: data || [] });
    }

    if (action === "ai") {
      if (!LOVABLE_API_KEY) {
        return json({
          reply:
            "🤖 (modo simulação) IA real desativada — defina LOVABLE_API_KEY pra ver a resposta de verdade.",
        });
      }
      const prompt = String(body?.prompt || "");
      const userMessage = String(body?.user_message || "");
      const consultantName = String(body?.consultant_name || "");
      const history: Array<{ role: string; content: string }> = Array.isArray(body?.history)
        ? body.history
        : [];

      const system = [
        `Você é o assistente virtual de ${consultantName || "um consultor iGreen Energy"}.`,
        "Responda de forma curta (2-4 frases), em português, tom WhatsApp, com emojis nas frases-chave.",
        "Desconto exibido ao cliente é sempre 'até 20%'.",
        prompt ? `Contexto do passo:\n${prompt}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const messages = [
        { role: "system", content: system },
        ...history.slice(-8),
        { role: "user", content: userMessage },
      ];

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          temperature: 0.6,
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return json({ error: `ai_gateway_${resp.status}`, detail: txt.slice(0, 200) }, 502);
      }
      const out = await resp.json();
      const reply = out?.choices?.[0]?.message?.content || "(sem resposta)";
      return json({ reply });
    }

    return json({ error: "unknown_action" }, 400);
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

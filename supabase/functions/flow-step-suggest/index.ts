// Sugere 3 próximos passos para um fluxo baseado no passo atual + contexto.
// Retorna JSON via tool-calling do Gemini.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  consultantId: string;
  stepId: string;
}

interface Suggestion {
  title: string;
  step_type: string;        // "message" | "capture_conta" | "capture_documento" | etc
  message_text: string;
  buttons?: { id: string; title: string }[];
  reasoning: string;
}

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "missing_gemini_key" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
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
    if (!body?.consultantId || !body?.stepId) return json({ error: "missing_fields" }, 400);
    if (userId !== body.consultantId) {
      const { data: isAdmin } = await admin.rpc("is_super_admin", { _user_id: userId });
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    const { data: step } = await admin
      .from("bot_flow_steps")
      .select("id, step_key, slot_key, title, message_text, position, flow_id, step_type")
      .eq("id", body.stepId)
      .maybeSingle();
    if (!step) return json({ error: "step_not_found" }, 404);

    const { data: allSteps } = await admin
      .from("bot_flow_steps")
      .select("position, title, step_type, message_text")
      .eq("flow_id", (step as any).flow_id)
      .eq("is_active", true)
      .order("position", { ascending: true });

    const flowOverview = ((allSteps || []) as any[])
      .map((s) => `  ${s.position}. [${s.step_type}] ${s.title}: ${(s.message_text || "").slice(0, 80)}`)
      .join("\n");

    const prompt = `Você é um especialista em fluxos de WhatsApp pra captação de leads de energia solar (iGreen Energy).
Analise o passo atual e sugira 3 PRÓXIMOS passos que façam sentido no funil.

FLUXO ATUAL:
${flowOverview || "  (vazio)"}

PASSO ATUAL (posição ${(step as any).position}):
- Tipo: ${(step as any).step_type}
- Título: ${(step as any).title}
- Mensagem: ${((step as any).message_text || "").slice(0, 300)}

Para cada sugestão, retorne:
- title: nome curto e claro
- step_type: um de [message, capture_conta, capture_documento, capture_email, confirm_phone, finalizar_cadastro]
- message_text: texto pronto pro WhatsApp (PT-BR, tom direto, máx 3 linhas, pode usar {{nome}}, {{valor_conta}}, {{representante}})
- buttons (opcional): array de {id, title} se fizer sentido oferecer botões
- reasoning: 1 frase explicando por que essa é a próxima jogada

Foque em mover o lead pra frente (fechamento, captação de dados, ou objeção).`;

    const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    step_type: { type: "string" },
                    message_text: { type: "string" },
                    buttons: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "string" }, title: { type: "string" } },
                        required: ["id", "title"],
                      },
                    },
                    reasoning: { type: "string" },
                  },
                  required: ["title", "step_type", "message_text", "reasoning"],
                },
              },
            },
            required: ["suggestions"],
          },
        },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[flow-step-suggest] gemini error", resp.status, txt);
      if (resp.status === 429) return json({ error: "rate_limit", message: "Limite do Gemini atingido." }, 429);
      return json({ error: "gemini_error", details: txt.slice(0, 300) }, 500);
    }
    const data = await resp.json();
    const raw = String(
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "",
    ).trim();
    if (!raw) return json({ error: "empty_response" }, 500);

    let parsed: { suggestions?: Suggestion[] } = {};
    try { parsed = JSON.parse(raw); } catch {
      return json({ error: "parse_error", raw: raw.slice(0, 200) }, 500);
    }
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [];
    return json({ ok: true, suggestions });
  } catch (e) {
    console.error("[flow-step-suggest] error", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

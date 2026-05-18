// AI Suggest Reply — gera 3 variantes de resposta para o consultor
// usar no chat do CRM. Usa Lovable AI Gateway (LOVABLE_API_KEY) com
// histórico recente da conversa + resumo + memórias do lead.
//
// Auth: requer JWT do consultor (verify_jwt = true via default Lovable).
// Retorna: { suggestions: [{text, tone}] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { aiChat } from "../_shared/ai-gateway.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tone: { type: "string", enum: ["empatico", "objetivo", "consultivo"] },
          text: { type: "string" },
        },
        required: ["tone", "text"],
      },
    },
  },
  required: ["suggestions"],
};

const SYSTEM = `Você é uma assistente que sugere respostas para um consultor de energia solar
(iGreen Energy) no WhatsApp. Gere SEMPRE exatamente 3 variantes da MESMA mensagem em tons
diferentes: empático, objetivo, consultivo. Regras:
- 1 a 3 frases por variante. Sem markdown, sem listas.
- Tom brasileiro, sem emoji exagerado (máx 1).
- Use o nome do lead se disponível. Não invente preços, prazos ou benefícios.
- Não cumprimente se já houve cumprimento no histórico.
- Se houver objeção/dúvida pendente, ataque ela diretamente.
- Sempre termine com um próximo passo claro (pergunta ou CTA curto).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { customer_id, hint } = await req.json();
    if (!customer_id) {
      return new Response(JSON.stringify({ error: "customer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: pega user do JWT
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: customer } = await supabase
      .from("customers")
      .select("id, consultant_id, name, sales_phase, conversation_summary, electricity_bill_value, distribuidora")
      .eq("id", customer_id)
      .maybeSingle();
    if (!customer) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só o consultor dono pode pedir sugestão
    if (customer.consultant_id !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: history } = await supabase
      .from("conversations")
      .select("message_direction, message_text, message_type, created_at")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: false })
      .limit(20);
    const recent = (history || []).reverse();

    const { data: memory } = await supabase
      .from("customer_memory_active")
      .select("category, key, value")
      .eq("customer_id", customer_id)
      .limit(15);
    const memLine = ((memory as any[]) || []).length
      ? ((memory as any[]) || []).map((m) => `- ${m.category}/${m.key}: ${m.value}`).join("\n")
      : "(sem memórias)";

    const transcript = recent.map((m: any) =>
      `${m.message_direction === "inbound" ? "Lead" : "Consultor"}: ${(m.message_text || "(mídia)").slice(0, 240)}`
    ).join("\n") || "(conversa vazia)";

    const userPrompt = `[LEAD]
Nome: ${customer.name || "(sem nome)"}
Fase do funil: ${customer.sales_phase || "(início)"}
Valor da conta: ${customer.electricity_bill_value || "(desconhecido)"}
Distribuidora: ${customer.distribuidora || "(desconhecida)"}

[RESUMO]
${customer.conversation_summary || "(sem resumo)"}

[MEMÓRIAS]
${memLine}

[CONVERSA RECENTE]
${transcript}

${hint ? `[INSTRUÇÃO DO CONSULTOR]\n${hint}\n` : ""}
Gere 3 variantes de resposta (empático, objetivo, consultivo) para a próxima mensagem do consultor.`;

    const result = await aiChat({
      model: "google/gemini-3-flash-preview",
      temperature: 0.7,
      maxTokens: 600,
      jsonSchema: { name: "suggest_replies", schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    });

    const suggestions = result.json?.suggestions || [];
    return new Response(JSON.stringify({ ok: true, suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-suggest-reply error:", e);
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// FAQ Organizer — recebe seções atuais e retorna proposta organizada (preview).
// Não escreve no banco: o front mostra o diff e o admin aprova manualmente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { aiChat } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface IncomingSection {
  id?: string;
  title: string;
  content: string;
  persona?: string;
  is_critical?: boolean;
  keywords?: string[];
  position?: number;
}

const SYSTEM = `Você é uma curadora especialista em base de conhecimento para um agente de IA do WhatsApp da iGreen Energy (energia solar por assinatura).

TAREFA: Receber seções brutas e devolver uma versão organizada para alimentar a IA.

REGRAS:
1. Consolide seções duplicadas ou muito parecidas em uma só.
2. Quebre seções gigantes (>2000 chars) em temas menores.
3. Título curto e claro (max 60 chars), em CAIXA ALTA quando representa uma SEÇÃO geral, em formato normal quando é um item específico.
4. Conteúdo direto, sem floreio. Mantenha TODOS os fatos, valores, regras e exemplos.
5. persona: "lead" (quem ainda não é cliente, quer entender produto/carreira), "cliente" (já é cliente Green, dúvidas sobre conta), "ambos" (informação institucional).
6. is_critical: true APENAS para informações que NÃO podem ser parafraseadas (CNPJ, contatos oficiais, valores legais, percentuais regulados).
7. keywords: 4 a 8 termos curtos que clientes/leads usariam ao perguntar (sinônimos inclusos).
8. NUNCA invente informação. Se faltar dado, use exatamente o que estava no original.
9. Ordene por relevância para a jornada do lead: institucional → produto → como funciona → cobertura → cashback → carreira/licença → FAQ.

Retorne JSON:
{
  "sections": [
    { "title": "...", "content": "...", "persona": "lead|cliente|ambos", "is_critical": false, "keywords": ["..."] }
  ],
  "changes_summary": "Resumo curto do que mudou (3-5 bullets)."
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica role admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sections = (body?.sections || []) as IncomingSection[];
    const extra = (body?.extra_raw_text || "") as string;

    if (!sections.length && !extra.trim()) {
      return new Response(JSON.stringify({ error: "no_sections" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = [
      "SEÇÕES ATUAIS (JSON):",
      JSON.stringify(sections.map((s) => ({
        title: s.title,
        content: (s.content || "").slice(0, 4000),
        persona: s.persona || "ambos",
        is_critical: !!s.is_critical,
        keywords: s.keywords || [],
      })), null, 2),
      extra.trim() ? `\nTEXTO BRUTO ADICIONAL PARA INCORPORAR:\n${extra.slice(0, 8000)}` : "",
    ].join("\n");

    const res = await aiChat({
      model: "google/gemini-3-flash-preview",
      temperature: 0.2,
      maxTokens: 8000,
      jsonSchema: {
        name: "organized_faq",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            sections: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  persona: { type: "string", enum: ["lead", "cliente", "ambos"] },
                  is_critical: { type: "boolean" },
                  keywords: { type: "array", items: { type: "string" } },
                },
                required: ["title", "content", "persona", "is_critical", "keywords"],
              },
            },
            changes_summary: { type: "string" },
          },
          required: ["sections", "changes_summary"],
        },
      },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    });

    const parsed = res.json;
    if (!parsed?.sections) {
      return new Response(JSON.stringify({ error: "ai_no_output", raw: res.text }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[faq-organizer] error:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

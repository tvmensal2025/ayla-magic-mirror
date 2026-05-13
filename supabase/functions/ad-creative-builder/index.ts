// Gera copy de elite (6 frameworks), filtra termos proibidos pela Meta e atribui score por variação.
// Injeta padrões aprendidos pelo ad-creative-learner pra cada novo anúncio sair melhor que o anterior.
import { adminClient, authConsultant, corsHeaders } from "../_shared/fb-graph.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");

async function loadInsights(consultantId: string, distribuidora?: string) {
  try {
    const admin = adminClient();
    const q = admin.from("ad_creative_insights").select("*").eq("consultant_id", consultantId);
    const { data } = distribuidora
      ? await q.eq("distribuidora", distribuidora).maybeSingle()
      : await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    return data;
  } catch { return null; }
}

// Termos que a Meta rejeita ou penaliza fortemente — copy regenera/filtra automaticamente.
const FORBIDDEN = [
  /\bgarantid[oa]s?\b/i, /\b100\s*%\b/, /\bmilagre|milagros[oa]\b/i,
  /\bganh(?:e|a|ar)\s+(dinheiro|grana|muito)\b/i, /\bgr[áa]tis\b/i,
  /\bmelhor\s+do\s+(brasil|mundo|mercado)\b/i, /[!?]{2,}/,
  /\b(VOC[ÊE]|SEU|SUA)\b/,
];

function isClean(s: string): boolean {
  if (!s) return false;
  return !FORBIDDEN.some((r) => r.test(s));
}

function variationScore(s: string, kind: "headline" | "primary"): number {
  if (!isClean(s)) return 0;
  const len = s.length;
  const idealMin = kind === "headline" ? 14 : 35;
  const idealMax = kind === "headline" ? 30 : 90;
  let score = 60;
  if (len >= idealMin && len <= idealMax) score += 15;
  if (/\d/.test(s)) score += 10; // números aumentam CTR
  if (/(fala|toca|garante|peça|peca|simule|baixe|conhe[çc]a|descubra|economiz|chame|👇|👉)/i.test(s)) score += 10;
  if (/cliente|cidade|região|aqui|seu boleto|sua conta/i.test(s)) score += 5;
  return Math.min(100, score);
}

const FALLBACK = {
  headlines: [
    { text: "Conta de luz 20% mais barata", framework: "específico", score: 90 },
    { text: "Sua conta de luz subiu de novo?", framework: "PAS", score: 80 },
    { text: "Pague menos sem obra nem taxa", framework: "objeção", score: 85 },
    { text: "Em até 30 dias na sua fatura", framework: "urgência", score: 78 },
    { text: "+50 mil famílias economizam", framework: "prova social", score: 82 },
  ],
  primary_texts: [
    { text: "Sua conta de luz até 20% mais barata. Sem obra. Fala no zap 👇", framework: "AIDA", score: 92 },
    { text: "Cansado da conta alta? Desconto direto na fatura. Toca aqui.", framework: "PAS", score: 86 },
    { text: "Energia limpa, conta leve. Sem instalar nada. Garante a sua 🌱", framework: "benefício", score: 88 },
  ],
  description: "Sem obra. Sem taxa.",
};

interface Variation { text: string; framework: string; score: number }
interface CopyPack {
  headlines: Variation[];
  primary_texts: Variation[];
  description: string;
  // Backwards compatibility — clientes antigos esperam string[]
  legacy?: { headlines: string[]; primary_texts: string[] };
}

async function generate(cities: string[]): Promise<CopyPack> {
  if (!GEMINI_KEY) return packWithLegacy(FALLBACK);
  const ctx = cities.join(", ") || "Brasil";
  const isDistribuidora = ctx.toLowerCase().includes("clientes da");
  const prompt = `Você é o melhor copywriter de Facebook Ads do Brasil. Gere copy em pt-BR para iGreen Energy (energia por assinatura — desconto na conta de luz).

Contexto-alvo: ${ctx}.
${isDistribuidora ? "IMPORTANTE: o 1º item é a distribuidora do cliente — use o NOME dela em pelo menos 3 dos 6 títulos.\n" : ""}

Retorne JSON ESTRITO com 6 títulos (cada um em UM framework diferente) + 3 textos primários:

{
  "headlines": [
    { "text": "...", "framework": "PAS" },           // Dor-Agita-Solução: começa com pergunta sobre dor
    { "text": "...", "framework": "pergunta_direta" }, // pergunta que qualifica o público
    { "text": "...", "framework": "prova_social" },    // "+X mil famílias", "milhares já..."
    { "text": "...", "framework": "urgência_local" },  // menciona cidade/distribuidora + prazo
    { "text": "...", "framework": "curiosidade" },     // gancho que dá vontade de clicar
    { "text": "...", "framework": "específico" }       // número concreto: "R$48/mês", "20%"
  ],
  "primary_texts": [
    { "text": "...", "framework": "AIDA" },
    { "text": "...", "framework": "PAS" },
    { "text": "...", "framework": "benefício_direto" }
  ],
  "description": "1 descrição curta"
}

REGRAS DE OURO (cumpra TODAS, senão a Meta rejeita):
- Títulos: 14 a 30 caracteres. Textos: 35 a 90 caracteres. Descrição: até 25.
- PROIBIDO usar: "garantido", "100%", "milagre", "ganhe dinheiro", "grátis", "melhor do Brasil/mundo", "!!" ou "??", VOCÊ/SEU/SUA em CAIXA ALTA.
- Tom direto, brasileiro, sem enrolação. Foque em ECONOMIA, nunca em ganho.
- Cada texto primário precisa ter um CTA no final (ex: "Fala no zap 👇", "Toca aqui", "Garante a sua").
- Use no máximo 1 emoji por texto.
- Pelo menos 3 itens devem conter um número específico (R$, %, mil, etc.).

Exemplo do nível de qualidade esperado:
- headline: "Conta CPFL 20% mais barata"
- primary: "Cansado da conta alta? Desconto de até 20% direto no boleto. Sem obra. Fala no zap 👇"`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
        }),
      },
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return packWithLegacy(FALLBACK);
    const parsed = JSON.parse(text);
    const trim = (s: string, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

    const cleanList = (arr: any[], kind: "headline" | "primary", maxLen: number): Variation[] =>
      (arr || [])
        .map((v) => ({
          text: trim(typeof v === "string" ? v : v?.text || "", maxLen),
          framework: typeof v === "object" ? (v?.framework || "geral") : "geral",
        }))
        .filter((v) => v.text && isClean(v.text))
        .map((v) => ({ ...v, score: variationScore(v.text, kind) }))
        .sort((a, b) => b.score - a.score);

    const headlines = cleanList(parsed.headlines, "headline", 30);
    const primary_texts = cleanList(parsed.primary_texts, "primary", 90);

    return packWithLegacy({
      headlines: headlines.length >= 3 ? headlines.slice(0, 6) : FALLBACK.headlines,
      primary_texts: primary_texts.length >= 2 ? primary_texts.slice(0, 3) : FALLBACK.primary_texts,
      description: trim(parsed.description || FALLBACK.description, 25),
    });
  } catch {
    return packWithLegacy(FALLBACK);
  }
}

function packWithLegacy(p: { headlines: Variation[]; primary_texts: Variation[]; description: string }): CopyPack {
  return {
    ...p,
    legacy: {
      headlines: p.headlines.map((h) => h.text),
      primary_texts: p.primary_texts.map((t) => t.text),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { cities } = await req.json().catch(() => ({ cities: [] }));
    const copy = await generate(cities || []);
    // Mantém shape antigo no topo (headlines/primary_texts como string[]) + novo shape em `variations`
    const flat = {
      headlines: copy.legacy!.headlines,
      primary_texts: copy.legacy!.primary_texts,
      description: copy.description,
      variations: { headlines: copy.headlines, primary_texts: copy.primary_texts },
    };
    return new Response(JSON.stringify(flat), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

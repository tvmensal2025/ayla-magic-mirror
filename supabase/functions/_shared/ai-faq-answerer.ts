// AI FAQ Answerer — fallback Lovable AI quando lead pergunta algo
// que NÃO existe em bot_flow_qa. Usa ai_knowledge_sections como RAG.
//
// Filosofia:
// - Resposta curta (máx 3 frases)
// - Tom conversacional brasileiro, sem emoji exagerado
// - Se não souber responder com confiança → retorna null (bot mantém comportamento default: repete passo ou faz handoff)
// - NUNCA inventa números, prazos ou taxas que não estejam no conhecimento.

import { aiChat } from "./ai-gateway.ts";

export interface FaqAnswer {
  text: string;
  confidence: number;          // 0..1
  shouldHandoff: boolean;      // true → pergunta exige humano
  source: "ai" | "skipped";
}

interface KnowledgeSection {
  title: string;
  content: string;
}

const SYSTEM_PROMPT = `Você é a assistente da iGreen Energy respondendo dúvidas de leads no WhatsApp.

REGRAS RÍGIDAS:
1. Responda APENAS com base no CONHECIMENTO fornecido. Não invente preços, prazos, taxas, distribuidoras ou benefícios.
2. Resposta MUITO curta: 1 a 3 frases. Sem listas, sem markdown, sem emoji (no máximo 1 emoji simples).
3. Tom brasileiro, simpático, direto. Trate o lead pelo nome se for fornecido.
4. Se a pergunta NÃO puder ser respondida com o conhecimento OU exigir cálculo individual / análise de conta específica / negociação → marque shouldHandoff=true.
5. Sempre termine convidando o lead a continuar o cadastro (ex: "Quer que eu siga com seu cadastro?").
6. Se o lead expressar raiva, desistência, reclamação séria, pedido explícito de humano, ou pergunta sobre cancelamento → shouldHandoff=true.
7. confidence: 0.9+ se tem resposta clara no conhecimento; 0.6-0.8 se parcial; <0.6 se não sabe.

Retorne JSON: {"text": "...", "confidence": 0.0-1.0, "shouldHandoff": true|false}`;

export async function answerFaqWithAI(opts: {
  supabase: any;
  question: string;
  leadName?: string;
  currentStepLabel?: string;
  signal?: AbortSignal;
}): Promise<FaqAnswer> {
  const q = (opts.question || "").trim();
  if (!q || q.length < 3) {
    return { text: "", confidence: 0, shouldHandoff: false, source: "skipped" };
  }

  // Busca knowledge base (max ~6KB de contexto pra ficar barato)
  const { data: sections } = await opts.supabase
    .from("ai_knowledge_sections")
    .select("title, content")
    .eq("is_active", true)
    .order("position", { ascending: true })
    .limit(20);

  const knowledge = ((sections as KnowledgeSection[]) || [])
    .map((s) => `### ${s.title}\n${(s.content || "").slice(0, 800)}`)
    .join("\n\n")
    .slice(0, 6000);

  if (!knowledge) {
    // Sem base de conhecimento: melhor mandar pra humano
    return { text: "", confidence: 0, shouldHandoff: true, source: "skipped" };
  }

  const userPrompt = `CONHECIMENTO IGREEN:
${knowledge}

CONTEXTO:
- Nome do lead: ${opts.leadName || "(desconhecido)"}
- Passo atual do funil: ${opts.currentStepLabel || "(início)"}

PERGUNTA DO LEAD: "${q.slice(0, 400)}"`;

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10_000);
    const res = await aiChat({
      model: "google/gemini-3-flash-preview",
      temperature: 0.3,
      maxTokens: 250,
      jsonSchema: {
        name: "faq_answer",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            confidence: { type: "number" },
            shouldHandoff: { type: "boolean" },
          },
          required: ["text", "confidence", "shouldHandoff"],
        },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      signal: opts.signal || ctrl.signal,
    });
    clearTimeout(to);

    const parsed = res.json;
    if (!parsed || typeof parsed.text !== "string") {
      return { text: "", confidence: 0, shouldHandoff: true, source: "skipped" };
    }

    return {
      text: String(parsed.text).trim().slice(0, 600),
      confidence: Number(parsed.confidence) || 0,
      shouldHandoff: !!parsed.shouldHandoff,
      source: "ai",
    };
  } catch (e) {
    console.warn("[ai-faq-answerer] failed:", (e as Error).message);
    return { text: "", confidence: 0, shouldHandoff: false, source: "skipped" };
  }
}

// AI FAQ Answerer — fallback Lovable AI quando lead pergunta algo
// que NÃO existe em bot_flow_qa. Usa ai_knowledge_sections como RAG.
//
// Filosofia:
// - Resposta curta (máx 3 frases)
// - Tom conversacional brasileiro, sem emoji exagerado
// - Se não souber responder com confiança → retorna null (bot mantém comportamento default: repete passo ou faz handoff)
// - NUNCA inventa números, prazos ou taxas que não estejam no conhecimento.

import { aiChatCascade } from "./ai-gateway.ts";
import { trackAIUsage } from "./ai-cost-tracker.ts";

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

const SYSTEM_PROMPT = `Você é a assistente sênior da iGreen Energy respondendo dúvidas de leads no WhatsApp. Sua missão é tirar QUALQUER dúvida do lead de forma clara, segura e que dê confiança para ele seguir com o cadastro.

REGRAS RÍGIDAS:
1. Responda APENAS com base no CONHECIMENTO fornecido + no contexto da conversa. NUNCA invente preços, prazos, taxas, distribuidoras, números ou benefícios que não estejam ali.
2. Resposta clara e completa: 2 a 5 frases. Sem listas longas, sem markdown pesado, no máximo 1 emoji simples.
3. Tom brasileiro, simpático, direto e profissional. Trate o lead pelo primeiro nome quando souber.
4. Se a pergunta exigir cálculo individual da conta dele, negociação, análise de documento específico, cancelamento, reclamação séria, raiva, desistência ou pedido explícito de humano → shouldHandoff=true (e ainda assim escreva uma resposta curta acolhedora).
5. Sempre termine com um convite leve para continuar (ex: "Posso seguir com seu cadastro?" / "Quer que eu te ajude com o próximo passo?").
6. confidence: 0.9+ se a resposta está claramente coberta; 0.6-0.8 se parcial; <0.6 se você não sabe — nesse caso shouldHandoff=true.
7. NUNCA mencione áudio, vídeo ou que vai "mandar de novo" o material. Você está respondendo só com texto.

Retorne JSON: {"text": "...", "confidence": 0.0-1.0, "shouldHandoff": true|false}`;


export async function answerFaqWithAI(opts: {
  supabase: any;
  question: string;
  leadName?: string;
  currentStepLabel?: string;
  consultantId?: string;
  recentHistory?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<FaqAnswer> {

  const q = (opts.question || "").trim();
  if (!q || q.length < 3) {
    return { text: "", confidence: 0, shouldHandoff: false, source: "skipped" };
  }

  // Busca knowledge base: seções do consultor + globais (max ~6KB de contexto pra ficar barato)
  const { data: sections } = await opts.supabase
    .from("ai_knowledge_sections")
    .select("title, content")
    .eq("is_active", true)
    .or(`consultant_id.is.null${opts.consultantId ? `,consultant_id.eq.${opts.consultantId}` : ""}`)
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
${opts.recentHistory ? `\nÚLTIMAS MENSAGENS DA CONVERSA:\n${opts.recentHistory.slice(0, 2000)}\n` : ""}
PERGUNTA DO LEAD: "${q.slice(0, 600)}"`;

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15_000);
    const res = await aiChatCascade({
      model: opts.model || "google/gemini-3.1-pro-preview",
      temperature: 0.35,
      maxTokens: 500,
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

    void trackAIUsage({
      supabase: opts.supabase,
      consultantId: opts.consultantId,
      model: res.modelUsed,
      phase: "faq",
      usage: res.usage,
    });

    const parsed = res.json;
    if (!parsed || typeof parsed.text !== "string") {
      return { text: "", confidence: 0, shouldHandoff: true, source: "skipped" };
    }

    return {
      text: String(parsed.text).trim().slice(0, 1200),
      confidence: Number(parsed.confidence) || 0,
      shouldHandoff: !!parsed.shouldHandoff,
      source: "ai",
    };
  } catch (e) {
    console.warn("[ai-faq-answerer] failed:", (e as Error).message);
    return { text: "", confidence: 0, shouldHandoff: false, source: "skipped" };
  }
}

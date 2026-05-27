// AI FAQ Answerer — busca DETERMINÍSTICA na base de conhecimento.
//
// Política (atualizada 2026-05-26):
//   - NUNCA chama LLM para gerar texto criativo.
//   - Usa `lookupKnowledge` (knowledge-lookup.ts) que faz:
//       1. Match exato em `bot_flow_qa.text_response` via triggers
//       2. Match fuzzy por keywords em `bot_flow_qa_triggers`
//       3. Match em `ai_knowledge_sections.keywords[]` ou content
//   - Se nenhum match → shouldHandoff=true, source="skipped".
//
// O parâmetro `model` permanece na assinatura por compatibilidade com
// callers legacy (ai-agent-router) mas é IGNORADO. A IA não escreve
// texto livre em nenhum cenário.

import { lookupKnowledge } from "./knowledge-lookup.ts";

export interface FaqAnswer {
  text: string;
  confidence: number;          // 0..1
  shouldHandoff: boolean;      // true → pergunta exige humano
  source: "ai" | "skipped" | "exact_qa" | "fuzzy_qa" | "keyword_section";
}

/**
 * Normaliza texto para match exato. Mantida exportada para backward
 * compat com callers legacy (`evolution-webhook`, `whapi-webhook`).
 */
export function normalizeFaqQuestion(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?!.,;:]+$/g, "")
    .trim();
}

/**
 * Resposta de FAQ baseada APENAS em conteúdo persistido.
 *
 * Hierarquia (em ordem de confiança):
 *   1. `bot_flow_qa` match exato (consultor cadastrou pergunta literal)
 *   2. `bot_flow_qa` match fuzzy (palavras-chave do lead encostam)
 *   3. `ai_knowledge_sections` (seções com keywords[] ou content)
 *   4. Sem match → `shouldHandoff=true` + texto vazio
 *
 * Nunca chama LLM. Nunca inventa texto. Confiança 1.0 (exato), 0.7
 * (fuzzy QA), 0.5 (seção). Caller pode escolher só agir com
 * `confidence ≥ 0.7` se quiser ser conservador.
 */
export async function answerFaqWithAI(opts: {
  supabase: any;
  question: string;
  leadName?: string;
  currentStepLabel?: string;
  consultantId?: string;
  recentHistory?: string;
  /** @deprecated kept for backward compat; LLM is never invoked. */
  model?: string;
  /** @deprecated kept for backward compat; lookups are synchronous-ish. */
  signal?: AbortSignal;
}): Promise<FaqAnswer> {
  const q = (opts.question || "").trim();
  if (!q || q.length < 3) {
    return { text: "", confidence: 0, shouldHandoff: false, source: "skipped" };
  }

  const consultantId = opts.consultantId || "";

  if (consultantId) {
    try {
      const r = await lookupKnowledge({
        supabase: opts.supabase,
        question: q,
        consultantId,
      });
      if (r.found) {
        return {
          text: r.text.slice(0, 1200),
          confidence: r.confidence,
          shouldHandoff: false,
          source: r.source as FaqAnswer["source"],
        };
      }
      return { text: "", confidence: 0, shouldHandoff: r.shouldHandoff, source: "skipped" };
    } catch (e) {
      console.warn("[ai-faq-answerer] lookupKnowledge failed:", (e as Error).message);
      return { text: "", confidence: 0, shouldHandoff: true, source: "skipped" };
    }
  }

  // Sem consultantId: tenta apenas ai_knowledge_sections global.
  try {
    const { data: sections } = await opts.supabase
      .from("ai_knowledge_sections")
      .select("title, content, keywords")
      .eq("is_active", true);
    type Row = { title: string; content: string; keywords: string[] | null };
    const rows = ((sections as unknown) as Row[]) || [];
    if (rows.length === 0) {
      return { text: "", confidence: 0, shouldHandoff: true, source: "skipped" };
    }
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const qNorm = norm(q);
    const tokens = qNorm.split(/\s+/).filter((t) => t.length >= 3);
    let best: { score: number; row: Row } | null = null;
    for (const row of rows) {
      const kwBag = (row.keywords || []).map(norm);
      let score = 0;
      for (const t of tokens) {
        if (kwBag.some((k) => k.includes(t))) score += 2;
        else if (norm(row.title).includes(t)) score += 1;
        else if (norm(row.content).includes(t)) score += 1;
      }
      if (score > 0 && (!best || score > best.score)) best = { score, row };
    }
    if (!best || best.score < 2) {
      return { text: "", confidence: 0, shouldHandoff: true, source: "skipped" };
    }
    const text = (best.row.content || "").slice(0, 600);
    return { text, confidence: 0.5, shouldHandoff: false, source: "keyword_section" };
  } catch (e) {
    console.warn("[ai-faq-answerer] global knowledge lookup failed:", (e as Error).message);
    return { text: "", confidence: 0, shouldHandoff: true, source: "skipped" };
  }
}

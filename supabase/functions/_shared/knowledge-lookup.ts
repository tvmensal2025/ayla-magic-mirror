/**
 * Knowledge Lookup — busca determinística (SEM LLM) na base de conhecimento.
 *
 * Política:
 *   1. Match exato em `bot_flow_qa.text_response` via `bot_flow_qa_triggers`
 *      do consultor (já existe em `ai-faq-answerer.findExactFaqMatch`).
 *   2. Se não achar, faz match por palavra-chave em
 *      `bot_flow_qa_triggers` (substring case-insensitive normalizada).
 *   3. Se não achar, busca em `ai_knowledge_sections.keywords[]` (ARRAY)
 *      ou em `title`/`content` por palavras-chave do lead.
 *   4. Se nenhum dos 3 acertar → retorna { found: false, shouldHandoff: true }.
 *
 * NUNCA chama LLM. NUNCA inventa texto. Toda resposta vem de campo persistido
 * no banco que o consultor escreveu/aprovou.
 *
 * Usado pelo engine V3 (handler ai_answer corrigido) e pelos webhooks legacy
 * que querem responder dúvida sem cair no Gemini.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface KnowledgeLookupResult {
  found: boolean;
  /** Texto a enviar ao lead. Vazio quando found=false. */
  text: string;
  /** Match strategy used. */
  source: "exact_qa" | "fuzzy_qa" | "keyword_section" | "no_match";
  /** Confiança do match: 1.0 exato, 0.7 fuzzy QA, 0.5 keyword. */
  confidence: number;
  /** True quando o caller deve escalar para humano. */
  shouldHandoff: boolean;
}

/**
 * Stemming brasileiro mínimo: remove sufixos verbais/plurais comuns
 * para que "atendem" case com "atende", "consultas" com "consulta", etc.
 *
 * NÃO é um stemmer completo — só corta os sufixos mais frequentes que
 * causam falso negativo em matches por substring.
 */
function stem(token: string): string {
  if (token.length <= 4) return token;
  // Verbos no presente: -am, -em, -ou, -ei, -ão
  const suffixes = [
    "amos", "emos", "imos",
    "aram", "eram", "iram",
    "asse", "esse", "isse",
    "ando", "endo", "indo",
    "ado", "ido",
    "ada", "ida",
    "am", "em", "ou", "ei",
    "as", "es", "os",
    "ar", "er", "ir",
    "a", "e", "o",
  ];
  for (const sfx of suffixes) {
    if (token.length - sfx.length >= 3 && token.endsWith(sfx)) {
      return token.slice(0, token.length - sfx.length);
    }
  }
  return token;
}

/** Normalização compartilhada com `ai-faq-answerer.normalizeFaqQuestion`:
 *   - lowercase
 *   - remove diacríticos
 *   - colapsa whitespace
 *   - remove pontuação final comum
 */
export function normalizeQuestion(text: string): string {
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
 * Versão "stemmed" da string — para comparações onde queremos casar
 * variações morfológicas (atende/atendem/atendendo).
 */
function normalizeAndStem(text: string): string {
  const norm = normalizeQuestion(text);
  return norm
    .split(/\s+/)
    .map((w) => stem(w))
    .join(" ");
}

/** Tokeniza uma pergunta em palavras-chave significativas (≥3 chars, sem stopwords). */
const STOPWORDS_PT = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "no", "na", "nos", "nas",
  "em", "para", "por", "com", "sem", "sob", "sobre",
  "e", "ou", "mas", "que", "se", "como", "quando", "onde",
  "eu", "tu", "ele", "ela", "nos", "vos", "eles", "elas",
  "meu", "minha", "seu", "sua", "nosso", "nossa",
  "este", "esta", "esse", "essa", "isto", "isso",
  "ser", "estar", "ter", "haver", "ir", "vir",
  "muito", "pouco", "mais", "menos", "tudo", "nada",
  "sim", "nao", "não",
]);

export function extractKeywords(text: string): string[] {
  const norm = normalizeQuestion(text);
  if (!norm) return [];
  const words = norm.split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS_PT.has(w));
  // Aplica stemming para casar variações morfológicas (atende/atendem).
  const stemmed = words.map((w) => stem(w));
  return Array.from(new Set(stemmed));
}

/**
 * Match exato em bot_flow_qa via triggers (idêntico a findExactFaqMatch).
 */
async function tryExactQa(opts: {
  supabase: SupabaseClient;
  question: string;
  consultantId: string;
}): Promise<{ text: string } | null> {
  const norm = normalizeQuestion(opts.question);
  if (!norm) return null;

  const { data: flows } = await opts.supabase
    .from("bot_flows")
    .select("id")
    .eq("consultant_id", opts.consultantId)
    .eq("is_active", true);
  const flowIds = ((flows as Array<{ id: string }>) || []).map((f) => f.id);
  if (flowIds.length === 0) return null;

  const { data: triggers } = await opts.supabase
    .from("bot_flow_qa_triggers")
    .select("phrase, qa_id, bot_flow_qa!inner(id, flow_id, position, text_response)")
    .in("bot_flow_qa.flow_id", flowIds);

  type Row = {
    phrase: string;
    bot_flow_qa: { position: number; text_response: string | null };
  };
  const rows = ((triggers as unknown) as Row[]) || [];
  const candidates: Array<{ position: number; text: string }> = [];
  for (const row of rows) {
    const text = (row.bot_flow_qa?.text_response || "").trim();
    if (!text) continue;
    if (normalizeQuestion(row.phrase) === norm) {
      candidates.push({ position: row.bot_flow_qa.position, text });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.position - b.position);
  return { text: candidates[0].text };
}

/**
 * Match fuzzy: palavras-chave do lead encostam em alguma trigger do QA.
 * Score = quantas keywords distintas estão presentes na trigger.
 * Vence o QA com maior score (e menor position em empate).
 */
async function tryFuzzyQa(opts: {
  supabase: SupabaseClient;
  question: string;
  consultantId: string;
}): Promise<{ text: string; score: number } | null> {
  const keywords = extractKeywords(opts.question);
  if (keywords.length === 0) return null;

  const { data: flows } = await opts.supabase
    .from("bot_flows")
    .select("id")
    .eq("consultant_id", opts.consultantId)
    .eq("is_active", true);
  const flowIds = ((flows as Array<{ id: string }>) || []).map((f) => f.id);
  if (flowIds.length === 0) return null;

  const { data: triggers } = await opts.supabase
    .from("bot_flow_qa_triggers")
    .select("phrase, bot_flow_qa!inner(id, flow_id, position, text_response)")
    .in("bot_flow_qa.flow_id", flowIds);

  type Row = {
    phrase: string;
    bot_flow_qa: { id: string; position: number; text_response: string | null };
  };
  const rows = ((triggers as unknown) as Row[]) || [];

  // Agrupa por qa.id; soma score = #keywords distintos batidos em qualquer trigger do mesmo QA.
  const byQa = new Map<string, { position: number; text: string; matched: Set<string> }>();
  for (const row of rows) {
    const text = (row.bot_flow_qa?.text_response || "").trim();
    if (!text) continue;
    // Aplica stem nas palavras da phrase também para casar com keywords stemmed.
    const phraseStem = normalizeAndStem(row.phrase);
    if (!phraseStem) continue;
    const qaId = row.bot_flow_qa.id;
    let entry = byQa.get(qaId);
    if (!entry) {
      entry = { position: row.bot_flow_qa.position, text, matched: new Set() };
      byQa.set(qaId, entry);
    }
    for (const kw of keywords) {
      if (phraseStem.includes(kw)) {
        entry.matched.add(kw);
      }
    }
  }

  // Ordena: maior número de keywords batidas, menor position de desempate.
  const ranked = Array.from(byQa.values())
    .filter((e) => e.matched.size >= 1) // exige pelo menos 1 keyword forte (já filtrada por stopwords + stem)
    .sort((a, b) => {
      if (b.matched.size !== a.matched.size) return b.matched.size - a.matched.size;
      return a.position - b.position;
    });

  if (ranked.length === 0) return null;
  // Para evitar falso positivo, exige score ≥ 2 quando a query tem mais
  // de 2 keywords; caso contrário (queries curtas) aceita score = 1.
  const minScore = keywords.length >= 3 ? 2 : 1;
  if (ranked[0].matched.size < minScore) return null;
  return { text: ranked[0].text, score: ranked[0].matched.size };
}

/**
 * Match em ai_knowledge_sections via:
 *   - keywords[] (ARRAY): qualquer keyword do lead presente no array
 *   - title/content: substring match (último recurso)
 *
 * Retorna a seção com maior número de keywords batidas, com fallback
 * para o conteúdo abreviado. Limita resposta a ~600 chars para não
 * sobrecarregar o WhatsApp.
 */
async function tryKnowledgeSection(opts: {
  supabase: SupabaseClient;
  question: string;
}): Promise<{ text: string; score: number } | null> {
  const keywords = extractKeywords(opts.question);
  if (keywords.length === 0) return null;

  const { data: sections } = await opts.supabase
    .from("ai_knowledge_sections")
    .select("title, content, keywords, position")
    .eq("is_active", true);

  type Row = {
    title: string;
    content: string;
    keywords: string[] | null;
    position: number;
  };
  const rows = ((sections as unknown) as Row[]) || [];

  let best: { score: number; section: Row } | null = null;
  for (const sec of rows) {
    const secKeywords = (sec.keywords || []).map((k) => stem(normalizeQuestion(k)));
    const titleStem = normalizeAndStem(sec.title);
    const contentStem = normalizeAndStem(sec.content);
    let score = 0;
    for (const kw of keywords) {
      if (secKeywords.some((k) => k === kw || k.includes(kw))) score += 2;
      else if (titleStem.includes(kw)) score += 1;
      else if (contentStem.includes(kw)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { score, section: sec };
    }
  }

  if (!best || best.score < 2) return null; // exige pelo menos 2 pontos pra responder

  // Constrói resposta a partir do conteúdo da seção. Tenta extrair o
  // primeiro parágrafo (separação por \n\n) que contenha alguma keyword.
  const content = best.section.content || "";
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  let chosen = paragraphs.find((p) => {
    const norm = normalizeQuestion(p);
    return keywords.some((kw) => norm.includes(kw));
  }) || paragraphs[0] || content;

  // Limita a 600 chars com corte em fim de frase quando possível.
  if (chosen.length > 600) {
    const cut = chosen.slice(0, 600);
    const lastDot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    chosen = lastDot > 200 ? chosen.slice(0, lastDot + 1) : cut + "…";
  }

  return { text: chosen, score: best.score };
}

/**
 * API pública. Tenta as 3 estratégias em ordem de confiança e retorna a
 * primeira que matchear. Sem LLM, sem chamadas externas.
 */
export async function lookupKnowledge(opts: {
  supabase: SupabaseClient;
  question: string;
  consultantId: string;
}): Promise<KnowledgeLookupResult> {
  const q = (opts.question || "").trim();
  if (!q || q.length < 2) {
    return { found: false, text: "", source: "no_match", confidence: 0, shouldHandoff: false };
  }

  // 1. Match exato no bot_flow_qa do consultor
  try {
    const exact = await tryExactQa(opts);
    if (exact) {
      return {
        found: true,
        text: exact.text,
        source: "exact_qa",
        confidence: 1,
        shouldHandoff: false,
      };
    }
  } catch (e) {
    console.warn("[knowledge-lookup] tryExactQa failed:", (e as Error).message);
  }

  // 2. Match fuzzy no bot_flow_qa via keywords
  try {
    const fuzzy = await tryFuzzyQa(opts);
    if (fuzzy) {
      return {
        found: true,
        text: fuzzy.text,
        source: "fuzzy_qa",
        confidence: 0.7,
        shouldHandoff: false,
      };
    }
  } catch (e) {
    console.warn("[knowledge-lookup] tryFuzzyQa failed:", (e as Error).message);
  }

  // 3. Match em ai_knowledge_sections
  try {
    const sec = await tryKnowledgeSection(opts);
    if (sec) {
      return {
        found: true,
        text: sec.text,
        source: "keyword_section",
        confidence: 0.5,
        shouldHandoff: false,
      };
    }
  } catch (e) {
    console.warn("[knowledge-lookup] tryKnowledgeSection failed:", (e as Error).message);
  }

  // 4. Nada bateu → handoff humano (NUNCA chama LLM)
  return {
    found: false,
    text: "",
    source: "no_match",
    confidence: 0,
    shouldHandoff: true,
  };
}

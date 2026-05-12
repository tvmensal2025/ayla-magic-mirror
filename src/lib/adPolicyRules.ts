// Regras de políticas Meta para anúncios em pt-BR.
// Termos/padrões que rejeitam ou penalizam alcance.

export interface PolicyHit {
  rule: string;
  message: string;
  severity: "block" | "warn";
  suggestion?: string;
}

const FORBIDDEN: { regex: RegExp; message: string; suggestion: string }[] = [
  { regex: /\b(garantid[oa]s?|100%\s*garantid[oa])\b/i, message: '"garantido" é proibido pela Meta', suggestion: 'Troque por "comprovado" ou remova' },
  { regex: /\b100\s*%\b/, message: '"100%" gera rejeição automática', suggestion: 'Use "muito mais" ou números reais' },
  { regex: /\bmilagre|milagros[oa]\b/i, message: '"milagre" é proibido', suggestion: 'Use "resultado real"' },
  { regex: /\bganh(?:e|a|ar)\s+(dinheiro|grana|muito)\b/i, message: 'Promessa de dinheiro é proibida', suggestion: 'Foque em economia, não em ganho' },
  { regex: /\bgr[áa]tis\b/i, message: '"grátis" pode ser barrado em finanças/utilidades', suggestion: 'Troque por "sem custo" ou "incluso"' },
  { regex: /\bmelhor\s+do\s+(brasil|mundo|mercado)\b/i, message: 'Superlativos absolutos são barrados', suggestion: 'Use prova social ou números' },
  { regex: /[!?]{2,}/, message: 'Pontuação repetida (!! ou ??) reduz qualidade', suggestion: 'Use só 1 sinal' },
  { regex: /\$\$\$|💰💰/, message: 'Símbolos repetidos parecem spam', suggestion: 'Remova excesso' },
  { regex: /\b(VOC[ÊE]|SEU|SUA)\b/, message: 'Atributos pessoais em CAIXA ALTA são barrados pela Meta', suggestion: 'Use minúsculas: "você", "sua"', },
];

const SOFT_FORBIDDEN: { regex: RegExp; message: string; suggestion: string }[] = [
  { regex: /\b(perde|gordo|magro|obes[oa]|velho|jovem)\b/i, message: 'Atributo pessoal — Meta pode penalizar', suggestion: 'Foque no benefício, não na pessoa' },
  { regex: /\b(d[ií]vidas?|inadimplen|negativad[oa])\b/i, message: 'Tema sensível (dívida) — Meta restringe', suggestion: 'Foque em economia/desconto' },
  { regex: /\burgente!?\b/i, message: '"urgente" sem contexto reduz qualidade', suggestion: 'Use "novidade" ou "agora"' },
  { regex: /\bclique\s+aqui\b/i, message: '"clique aqui" é genérico — Meta penaliza CTR', suggestion: '"Fala no zap", "Garante a sua"' },
];

export function checkCopy(text: string): PolicyHit[] {
  if (!text) return [];
  const hits: PolicyHit[] = [];
  for (const r of FORBIDDEN) {
    if (r.regex.test(text)) hits.push({ rule: r.regex.source, message: r.message, severity: "block", suggestion: r.suggestion });
  }
  for (const r of SOFT_FORBIDDEN) {
    if (r.regex.test(text)) hits.push({ rule: r.regex.source, message: r.message, severity: "warn", suggestion: r.suggestion });
  }
  // CAIXA ALTA total
  const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) {
    hits.push({ rule: "all_caps", message: "Texto inteiro em CAIXA ALTA — Meta penaliza", severity: "block", suggestion: "Use capitalização normal" });
  }
  // Excesso de emojis
  const emojiCount = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emojiCount > 2) hits.push({ rule: "emoji_excess", message: `${emojiCount} emojis — máximo recomendado é 2`, severity: "warn", suggestion: "Mantenha 1 emoji bem posicionado" });
  return hits;
}

export function summarize(hits: PolicyHit[]): { blocks: number; warns: number } {
  return {
    blocks: hits.filter(h => h.severity === "block").length,
    warns: hits.filter(h => h.severity === "warn").length,
  };
}
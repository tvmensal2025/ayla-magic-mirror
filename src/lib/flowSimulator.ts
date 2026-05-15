// Frontend mirror dos extractors do backend — usado pelo simulador no FluxoCamila.
// Deve ficar SINCRONIZADO com supabase/functions/_shared/captureExtractors.ts.

const NUM_EXTENSO: Record<string, number> = {
  cem: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
  seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000,
};
const DEZ_EXTENSO: Record<string, number> = {
  dez: 10, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};

export function detectValor(text: string): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/r\$|\breais?\b|\bconta\b|\bluz\b|\bvalor\b|\bpila\b|^\s*\d{2,5}\s*$/i.test(t)) {
    const m = t.match(/(\d{2,5}(?:[.,]\d{1,2})?)/);
    if (m) {
      const v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (!isNaN(v) && v >= 30 && v <= 50000) return v;
    }
  }
  for (const [palavra, val] of Object.entries(NUM_EXTENSO)) {
    if (t.includes(palavra)) {
      let total = val;
      const after = t.split(palavra)[1] || "";
      const dezMatch = after.match(/\s+e\s+(\w+)/);
      if (dezMatch && DEZ_EXTENSO[dezMatch[1]]) total += DEZ_EXTENSO[dezMatch[1]];
      if (total >= 30 && total <= 50000) return total;
    }
  }
  return null;
}

export function detectTelefone(text: string): boolean {
  return /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/.test(text || "");
}
export function detectCPF(text: string): boolean {
  return /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(text || "");
}
export function detectNome(text: string): boolean {
  return /(?:sou|me chamo|meu nome [eé]|aqui [eé]?o?\s?|nome:?\s?)\s+([a-zà-ÿ]{2,})/i.test(text || "");
}

export function detectRegexIntentsFE(text: string): string[] {
  const out: string[] = [];
  if (detectValor(text) != null) out.push("valor_brl");
  if (detectTelefone(text)) out.push("telefone_br");
  if (detectCPF(text)) out.push("cpf_br");
  if (detectNome(text)) out.push("nome_proprio");
  return out;
}

// Simulador: dado uma mensagem + lista de regras, retorna qual dispara.
export type SimRule = {
  trigger_intent: string;
  trigger_phrases: string[];
};

export function simulateMatch(message: string, rules: SimRule[]): { index: number; rule: SimRule } | null {
  const intents = detectRegexIntentsFE(message);
  // Heurística simples extra: SIM/NÃO
  const lower = message.toLowerCase().trim();
  if (/\b(sim|quero|vamos|claro|bora|pode|aceito)\b/.test(lower)) intents.push("afirmacao");
  if (/\b(n[ãa]o|depois|n[ãa]o quero|agora n[ãa]o)\b/.test(lower)) intents.push("negacao");
  if (/\?|\bcomo\b|\bo que [eé]\b|\bd[uú]vida\b/.test(lower)) intents.push("tem_duvida");
  if (/\bcadastr/.test(lower)) intents.push("quer_cadastrar");

  // 1) intents
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r.trigger_intent || r.trigger_intent === "palavra_chave") continue;
    if (intents.includes(r.trigger_intent)) return { index: i, rule: r };
  }
  // 2) palavras-chave
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    for (const p of r.trigger_phrases || []) {
      const needle = (p || "").toLowerCase().trim();
      if (needle && lower.includes(needle)) return { index: i, rule: r };
    }
  }
  return null;
}

// Detecta conflitos: regras com mesmo intent, ou palavras-chave duplicadas, ou intent + palavra-chave que se sobrepõem.
export function detectRuleConflicts(rules: SimRule[]): Array<{ index: number; reason: string }> {
  const out: Array<{ index: number; reason: string }> = [];
  const seenIntents = new Map<string, number>();
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.trigger_intent && r.trigger_intent !== "palavra_chave") {
      if (seenIntents.has(r.trigger_intent)) {
        out.push({ index: i, reason: `Mesma intenção da regra #${seenIntents.get(r.trigger_intent)! + 1}. A de cima ganha.` });
      } else {
        seenIntents.set(r.trigger_intent, i);
      }
    }
  }
  // Palavras-chave duplicadas
  const seenPhrase = new Map<string, number>();
  for (let i = 0; i < rules.length; i++) {
    for (const p of rules[i].trigger_phrases || []) {
      const k = p.toLowerCase().trim();
      if (!k) continue;
      if (seenPhrase.has(k)) {
        out.push({ index: i, reason: `Palavra "${p}" já está na regra #${seenPhrase.get(k)! + 1}.` });
      } else {
        seenPhrase.set(k, i);
      }
    }
  }
  return out;
}

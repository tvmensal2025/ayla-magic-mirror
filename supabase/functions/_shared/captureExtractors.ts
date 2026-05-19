// Capture extractors com cascata: regex → números por extenso → validação.
// Usado pelo Fluxo da Camila para extrair dados da mensagem do lead.

const NUM_EXTENSO: Record<string, number> = {
  cem: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
  seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000,
};
const DEZ_EXTENSO: Record<string, number> = {
  dez: 10, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};

const DDDS_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19, 21,22,24, 27,28, 31,32,33,34,35,37,38,
  41,42,43,44,45,46, 47,48,49, 51,53,54,55, 61, 62,64, 63, 65,66, 67,
  68, 69, 71,73,74,75,77, 79, 81,87, 82, 83, 84, 85,88, 86,89, 91,93,94,
  92,97, 95, 96, 98,99,
]);

function cpfValido(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(digits[i]) * (10 - i);
  let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(digits[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(digits[i]) * (11 - i);
  let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === parseInt(digits[10]);
}

export function extractValor(text: string): number | null {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  // 1) Regex direto: "R$ 380,50", "$380", "380 reais", "uns 400", "umas 500 pila", "minha conta vem 450"
  const rx = /(?:r?\$\s*|reais?\s*|conta\s+(?:de|vem|tá|é|cerca de|uns|umas|aproximadamente)?\s*|valor\s+(?:de|é)?\s*)?(\d{2,5}(?:[.,]\d{1,2})?)/i;
  // dispara se houver indício de dinheiro (R$, $, reais, conta, luz, valor, pila)
  // OU se a mensagem for praticamente só um número (resposta direta a "qual o valor?")
  // OU se contiver expressões de aproximação ("uns 200", "200 mais ou menos", "cerca de 300")
  const moneyHint = /r?\$|\breais?\b|\bconta\b|\bluz\b|\bvalor\b|\bpila\b|\bmangos?\b|\bcontos?\b/i.test(t);
  const approxHint = /\b(uns|umas|cerca\s+de|aproximadamente|aprox|por\s+volta|em\s+torno|quase|talvez|ma[is]?\s+ou\s+menos)\b/i.test(t);
  const bareNumber = /^\s*\d{2,5}(?:[.,]\d{1,2})?\s*(?:reais?|pila|mangos?|contos?|r?\$)?\s*$/i.test(t);
  if (moneyHint || bareNumber || approxHint) {
    const m = t.match(rx);
    if (m) {
      const v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (!isNaN(v) && v >= 30 && v <= 50000) return v;
    }
  }
  // 2) Extenso: "trezentos", "quinhentos e cinquenta"
  for (const [palavra, val] of Object.entries(NUM_EXTENSO)) {
    if (t.includes(palavra)) {
      let total = val;
      // pega "e cinquenta" depois
      const after = t.split(palavra)[1] || "";
      const dezMatch = after.match(/\s+e\s+(\w+)/);
      if (dezMatch && DEZ_EXTENSO[dezMatch[1]]) total += DEZ_EXTENSO[dezMatch[1]];
      if (total >= 30 && total <= 50000) return total;
    }
  }
  return null;
}

/** Fallback permissivo para o contexto "valor da conta": qualquer número 30..50000 na mensagem. */
export function extractValorPermissivo(text: string): number | null {
  if (!text) return null;
  const direct = extractValor(text);
  if (direct != null) return direct;
  const m = text.match(/\b(\d{2,5}(?:[.,]\d{1,2})?)\b/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (!isNaN(v) && v >= 30 && v <= 50000) return v;
  return null;
}

export function extractTelefone(text: string): string | null {
  if (!text) return null;
  const m = text.match(/(?:\+?55\s*)?\(?(\d{2})\)?\s*9?\s*(\d{4})[-\s]?(\d{4})/);
  if (!m) return null;
  const ddd = parseInt(m[1]);
  if (!DDDS_VALIDOS.has(ddd)) return null;
  const digits = (m[0].replace(/\D/g, "")).replace(/^55/, "");
  // normaliza pra 10 ou 11 dígitos (com 9 na frente do número)
  if (digits.length === 10 || digits.length === 11) return digits;
  return null;
}

export function extractCPF(text: string): string | null {
  if (!text) return null;
  const m = text.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return cpfValido(digits) ? digits : null;
}

const PALAVROES = /\b(merda|porra|caralho|fdp|puta|cu|viado|otario)\b/i;

const STOPWORDS_NOME = new Set([
  // saudações / confirmações
  "sim","nao","não","ok","oi","ola","olá","bom","boa","dia","tarde","noite",
  "eu","obrigado","obrigada","valeu","beleza","blz","claro","talvez","quero","posso",
  "pode","manda","vamos","bora","entao","então","como","qual","quanto","quem",
  "que","quê","hein","hum","hmm","ah","ahn","tudo","bem","tbm","tambem","também",
  // negações / hesitações que vinham capturadas como "nome"
  "ainda","agora","depois","hoje","amanha","amanhã","ontem",
  "sei","sabe","quase","mais","menos","muito","pouco","nada","nunca","nenhum","nenhuma",
  "talvez","acho","creio","penso","tipo","meio","tudo","nadica",
  "tava","estava","esta","está","estou","to","tô","fui","fiz","tem","tinha",
  "fala","falar","manda","mandar","ver","vendo","vou","vai","vamos",
  "humano","atendente","consultor","robo","robô","bot",
  // tokens curtos / lixo
  "n","s","ne","né","ta","tá","oq","pq","vc","tb","tbm",
]);

function capitalizeName(raw: string): string {
  return raw.trim().split(/\s+/).slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isValidNameCandidate(cleaned: string): boolean {
  if (!cleaned || cleaned.length < 2) return false;
  if (/\d/.test(cleaned)) return false;
  if (PALAVROES.test(cleaned)) return false;
  const parts = cleaned.toLowerCase().split(/\s+/);
  // Rejeita partes com menos de 2 letras (ex: "Ainda N" gerado de "ainda não")
  if (parts.some(p => p.length < 2)) return false;
  // Rejeita se qualquer palavra for stopword comum
  if (parts.some(p => STOPWORDS_NOME.has(p))) return false;
  return true;
}


export function extractNome(text: string): string | null {
  if (!text) return null;
  // 1) Frase estruturada: "sou X", "me chamo X", "meu nome é X"
  const m = text.match(/(?:sou|me chamo|meu nome [eé]|aqui [eé]?o?\s?|nome:?\s?)\s+([a-zà-ÿ]{2,}(?:\s+[a-zà-ÿ]{2,}){0,3})/i);
  if (m) {
    const cleaned = capitalizeName(m[1]);
    if (isValidNameCandidate(cleaned)) return cleaned;
  }
  // 2) Resposta crua à pergunta "qual seu nome?": 1-3 palavras só com letras
  const trimmed = text.trim().replace(/[.!?,;:]+$/g, "");
  if (trimmed.length > 0 && trimmed.length <= 60) {
    const onlyLetters = /^[a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}$/i.test(trimmed);
    if (onlyLetters) {
      const cleaned = capitalizeName(trimmed);
      if (isValidNameCandidate(cleaned)) return cleaned;
    }
  }
  return null;
}

// Detecta intents puramente por regex (não dependem de IA).
export function detectRegexIntents(text: string): string[] {
  const intents: string[] = [];
  if (!text) return intents;
  if (extractValor(text) != null) intents.push("valor_brl");
  if (extractTelefone(text)) intents.push("telefone_br");
  if (extractCPF(text)) intents.push("cpf_br");
  if (extractNome(text)) intents.push("nome_proprio");
  if (detectHandoffIntent(text)) intents.push("quer_humano");
  return intents;
}

/**
 * Detecta pedido explícito de handoff humano.
 * Cobre variações comuns: "falar com humano", "atendente", "consultor",
 * "pessoa de verdade", "isso é robô?", "quero falar com alguém", etc.
 */
const HANDOFF_PATTERNS: RegExp[] = [
  /\b(falar|conversar|atendimento)\s+(com|por)\s+(um[ao]?\s+)?(humano|pessoa|atendente|consultor[ae]?|gerente|respons[áa]vel|alguém|algu[eé]m\s+de\s+verdade)\b/i,
  /\bquer[oa]?\s+(falar|conversar|atendimento)\s+com\b/i,
  /\b(é|eh|isso|voc[eê])\s+(um\s+)?(rob[oôó]|bot|m[aá]quina|ia|ai)\??/i,
  /\b(n[ãa]o\s+(é|eh)\s+rob[oôó]|n[ãa]o\s+sou\s+rob[oôó])\b/i,
  /\b(atendimento|atendente|suporte)\s+(humano|real)\b/i,
  /\bme\s+passa\s+(para|pro|pra)\s+(um[ao]?\s+)?(humano|atendente|consultor|pessoa)\b/i,
  /\bchama[r]?\s+(um[ao]?\s+)?(consultor|atendente|gerente|humano)\b/i,
];

export function detectHandoffIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return HANDOFF_PATTERNS.some(rx => rx.test(t));
}

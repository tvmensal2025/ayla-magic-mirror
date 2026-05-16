// Detecta automaticamente o tipo de documento (CNH / RG novo / RG antigo)
// a partir de uma imagem (base64 ou URL pública). Usa Gemini Vision.
//
// Estratégia profissional:
//   1. 1ª passada com prompt estruturado pedindo JSON {tipo, confianca}.
//   2. Se confiança < 0.7 ou parsing falhar → 2ª passada com prompt detalhado.
//   3. Se ainda incerto → retorna "rg_antigo" (fallback que pede verso — mais seguro).
//
// O cliente NUNCA precisa escolher. O bot decide pela foto.

import { normalizeDocumentType, type DocumentTypeCanonical } from "./document-type.ts";

interface DetectInput {
  base64?: string;
  mimeType?: string;
  imageUrl?: string;
  geminiApiKey: string | undefined;
}

interface DetectResult {
  tipo: DocumentTypeCanonical;
  confianca: number; // 0..1
  source: "gemini_pass1" | "gemini_pass2" | "fallback";
}

const PROMPT_PASS1 = `Você é um especialista em documentos brasileiros. Olhe esta foto e classifique como UM destes três tipos:

- "cnh": Carteira Nacional de Habilitação. Sinais: tem categoria (A, B, AB...), validade, "PERMISSÃO PARA DIRIGIR" ou "HABILITAÇÃO", geralmente formato carteira com foto, assinatura e impressão digital, costuma ter QR code.
- "rg_novo": RG no formato moderno em policarbonato (cartão tipo cartão de crédito), com chip ou QR code, layout horizontal, "CARTEIRA DE IDENTIDADE NACIONAL" ou CIN.
- "rg_antigo": RG tradicional em papel laminado, sem chip, layout antigo, pode estar amarelado/gasto, "REGISTRO GERAL".

Responda APENAS com JSON válido (sem markdown, sem texto extra):
{"tipo":"cnh"|"rg_novo"|"rg_antigo","confianca":0.0-1.0}`;

const PROMPT_PASS2 = `Análise detalhada de documento brasileiro. Examine com cuidado:

1. Tem categoria de habilitação (A, B, C, D, E, AB, AC, AD, AE)? → cnh
2. Diz "CARTEIRA NACIONAL DE HABILITAÇÃO" ou "PERMISSÃO PARA DIRIGIR"? → cnh
3. É formato policarbonato moderno tipo cartão de crédito (com chip/QR/layout horizontal recente)? → rg_novo
4. Diz "CARTEIRA DE IDENTIDADE NACIONAL" / "CIN"? → rg_novo
5. É papel laminado antigo, layout vertical, "REGISTRO GERAL" / "SSP"? → rg_antigo

Responda APENAS JSON: {"tipo":"cnh"|"rg_novo"|"rg_antigo","confianca":0.0-1.0,"motivo":"breve"}`;

async function fetchImagePart(input: DetectInput): Promise<any | null> {
  if (input.base64 && input.base64.length > 100) {
    return { inline_data: { mime_type: input.mimeType || "image/jpeg", data: input.base64 } };
  }
  if (input.imageUrl && /^https?:/.test(input.imageUrl)) {
    try {
      const r = await fetch(input.imageUrl);
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const ct = r.headers.get("content-type") || "image/jpeg";
      return { inline_data: { mime_type: ct, data: b64 } };
    } catch (e) {
      console.warn("[detectDocumentType] falha baixando imagem:", (e as Error).message);
      return null;
    }
  }
  return null;
}

function parseDetectJson(raw: string): { tipo: DocumentTypeCanonical; confianca: number } | null {
  try {
    const clean = raw.replace(/```json|```/gi, "").trim();
    const match = clean.match(/\{[^}]+\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    const tipo = normalizeDocumentType(obj?.tipo);
    const confianca = typeof obj?.confianca === "number"
      ? Math.max(0, Math.min(1, obj.confianca))
      : 0.5;
    return { tipo, confianca };
  } catch {
    return null;
  }
}

async function callGemini(prompt: string, imagePart: any, apiKey: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, imagePart] }],
          generationConfig: { temperature: 0, maxOutputTokens: 120, responseMimeType: "application/json" },
        }),
        signal: ctrl.signal,
      },
    );
    if (!resp.ok) {
      console.warn("[detectDocumentType] gemini status", resp.status);
      return "";
    }
    const json: any = await resp.json();
    return (json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch (e) {
    console.warn("[detectDocumentType] erro chamando gemini:", (e as Error).message);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Versão estruturada que retorna tipo + confiança + origem da decisão. */
export async function detectDocumentTypeDetailed(input: DetectInput): Promise<DetectResult> {
  if (!input.geminiApiKey) {
    return { tipo: "rg_antigo", confianca: 0, source: "fallback" };
  }
  const imagePart = await fetchImagePart(input);
  if (!imagePart) {
    return { tipo: "rg_antigo", confianca: 0, source: "fallback" };
  }

  // 1ª passada
  const raw1 = await callGemini(PROMPT_PASS1, imagePart, input.geminiApiKey);
  const parsed1 = parseDetectJson(raw1);
  if (parsed1 && parsed1.confianca >= 0.7) {
    console.log(`🤖 [detectDoc] pass1 confiante: ${parsed1.tipo} (${parsed1.confianca.toFixed(2)})`);
    return { tipo: parsed1.tipo, confianca: parsed1.confianca, source: "gemini_pass1" };
  }

  // 2ª passada (prompt mais detalhado)
  console.log(`🤖 [detectDoc] pass1 ambíguo (${parsed1 ? parsed1.confianca.toFixed(2) : "no-parse"}) — rodando pass2`);
  const raw2 = await callGemini(PROMPT_PASS2, imagePart, input.geminiApiKey);
  const parsed2 = parseDetectJson(raw2);
  if (parsed2 && parsed2.confianca >= 0.5) {
    console.log(`🤖 [detectDoc] pass2 decidiu: ${parsed2.tipo} (${parsed2.confianca.toFixed(2)})`);
    return { tipo: parsed2.tipo, confianca: parsed2.confianca, source: "gemini_pass2" };
  }

  // Último recurso: usa o melhor que tiver, ou fallback seguro (rg_antigo pede verso)
  const best = parsed2 || parsed1;
  if (best) {
    console.log(`🤖 [detectDoc] usando melhor estimativa: ${best.tipo} (${best.confianca.toFixed(2)})`);
    return { tipo: best.tipo, confianca: best.confianca, source: "gemini_pass2" };
  }
  console.warn(`⚠️ [detectDoc] sem parse — fallback rg_antigo`);
  return { tipo: "rg_antigo", confianca: 0, source: "fallback" };
}

/** API compatível com o código antigo. */
export async function detectDocumentType(input: DetectInput): Promise<DocumentTypeCanonical> {
  const r = await detectDocumentTypeDetailed(input);
  return r.tipo;
}

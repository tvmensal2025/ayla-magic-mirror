// Detecta automaticamente o tipo de documento (CNH / RG novo / RG antigo)
// a partir de uma imagem (base64 ou URL pública). Usa Gemini Vision.
// Default seguro: rg_antigo (pede frente + verso, formato mais comum).

import { normalizeDocumentType, type DocumentTypeCanonical } from "./document-type.ts";

interface DetectInput {
  base64?: string;
  mimeType?: string;
  imageUrl?: string;
  geminiApiKey: string | undefined;
}

export async function detectDocumentType({
  base64, mimeType, imageUrl, geminiApiKey,
}: DetectInput): Promise<DocumentTypeCanonical> {
  if (!geminiApiKey) return "rg_antigo";

  // Prepara a parte da imagem
  let imagePart: any = null;
  if (base64 && base64.length > 100) {
    imagePart = { inline_data: { mime_type: mimeType || "image/jpeg", data: base64 } };
  } else if (imageUrl && /^https?:/.test(imageUrl)) {
    try {
      const r = await fetch(imageUrl);
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const ct = r.headers.get("content-type") || "image/jpeg";
      imagePart = { inline_data: { mime_type: ct, data: b64 } };
    } catch (e) {
      console.warn("[detectDocumentType] falha baixando imagem:", (e as Error).message);
      return "rg_antigo";
    }
  }
  if (!imagePart) return "rg_antigo";

  const prompt = `Olhe esta foto de documento de identidade brasileiro e responda APENAS com uma palavra:
- "cnh" se for Carteira Nacional de Habilitação (geralmente tem foto, validade, categoria de habilitação A/B/C/D/E)
- "rg_novo" se for RG no formato moderno de cartão policarbonato (parecido com cartão de crédito, com chip ou QR code)
- "rg_antigo" se for RG no formato tradicional de papel/laminado (mais antigo, sem chip)

Responda só uma dessas três palavras, em minúsculo, sem explicação.`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, imagePart] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 },
        }),
        signal: ctrl.signal,
      }
    );
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn("[detectDocumentType] gemini status", resp.status);
      return "rg_antigo";
    }
    const json: any = await resp.json();
    const txt = (json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toLowerCase();
    return normalizeDocumentType(txt);
  } catch (e) {
    console.warn("[detectDocumentType] erro:", (e as Error).message);
    return "rg_antigo";
  }
}

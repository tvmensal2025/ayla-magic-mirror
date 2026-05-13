// Validação de imagem com Gemini Vision antes do upload pro Facebook.
// Detecta problemas que matam aprovação ou performance:
// - rosto cortado / fora do enquadramento
// - excesso de texto (Meta penaliza >20% da imagem)
// - baixa qualidade / borrada / pixelada
// - conteúdo proibido (nudez, violência, promessa enganosa)

export interface ImageValidation {
  ok: boolean;
  score: number;          // 0-100
  format_hint?: "square" | "vertical" | "story";
  issues: string[];       // problemas críticos (bloqueiam)
  warnings: string[];     // alertas (não bloqueiam)
  suggestion?: string;    // dica pro consultor
}

const SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    face_cropped: { type: "boolean" },
    text_percent: { type: "integer", minimum: 0, maximum: 100 },
    blurry: { type: "boolean" },
    forbidden_content: { type: "boolean" },
    forbidden_reason: { type: "string" },
    aspect_hint: { type: "string", enum: ["square", "vertical", "story"] },
    suggestion: { type: "string" },
  },
  required: ["score", "face_cropped", "text_percent", "blurry", "forbidden_content", "aspect_hint"],
};

const PROMPT = `Você é um especialista em ads do Meta. Analise esta imagem de anúncio e devolva JSON.
Avalie:
1. score (0-100): nota geral de qualidade pra Facebook/Instagram Ads
2. face_cropped: true se o rosto principal está cortado, descentralizado ou fora do "safe zone"
3. text_percent: % aproximado da imagem coberto por texto (Meta penaliza >20%)
4. blurry: true se borrada, pixelada ou baixa resolução
5. forbidden_content: true se tem nudez, violência, álcool excessivo, promessa enganosa, antes-e-depois proibido, ou texto sensacionalista
6. forbidden_reason: motivo se forbidden_content=true
7. aspect_hint: "square" (1:1), "vertical" (4:5) ou "story" (9:16) — qual o formato real da imagem
8. suggestion: dica curta pro anunciante melhorar (português)

Seja rigoroso. Anúncio de energia solar profissional precisa score >= 60.`;

export async function validateAdImage(
  imageUrl: string,
  geminiApiKey: string,
): Promise<ImageValidation> {
  if (!geminiApiKey) {
    return { ok: true, score: 100, issues: [], warnings: ["GEMINI_API_KEY ausente — validação pulada"] };
  }

  try {
    // Baixa imagem como base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const mime = imgRes.headers.get("content-type") || "image/jpeg";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: b64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.2,
            response_mime_type: "application/json",
            response_schema: SCHEMA,
          },
        }),
      },
    );
    if (!res.ok) {
      console.warn("[img-validator] Gemini falhou:", res.status);
      return { ok: true, score: 100, issues: [], warnings: ["Gemini indisponível"] };
    }
    const data = await res.json();
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!txt) return { ok: true, score: 100, issues: [], warnings: ["Resposta Gemini vazia"] };

    const parsed = JSON.parse(txt);
    const issues: string[] = [];
    const warnings: string[] = [];

    // BLOQUEIO apenas para conteúdo realmente proibido pela política Meta
    // (nudez, violência, drogas, promessa claramente enganosa). Tudo o resto
    // vira AVISO — a regra dos 20% de texto foi descontinuada pela Meta em 2020,
    // e "rosto cortado" gera muito falso-positivo em arte de marketing estilizada.
    if (parsed.forbidden_content) {
      issues.push(`Conteúdo proibido pela política da Meta: ${parsed.forbidden_reason || "violação detectada"}`);
    }
    if (parsed.face_cropped) warnings.push("Rosto pode estar cortado — pode reduzir performance, mas não bloqueia.");
    if (parsed.blurry) warnings.push("Imagem parece de baixa resolução — pode reduzir performance.");
    if (typeof parsed.text_percent === "number" && parsed.text_percent > 20) {
      warnings.push(`Imagem com bastante texto (~${parsed.text_percent}%). A Meta não bloqueia mais isso, mas pode entregar menos.`);
    }
    const score = typeof parsed.score === "number" ? parsed.score : 100;
    if (score < 40) warnings.push(`Qualidade geral baixa (${score}/100) — considere trocar a foto.`);

    return {
      ok: issues.length === 0,
      score,
      format_hint: parsed.aspect_hint,
      issues,
      warnings,
      suggestion: parsed.suggestion,
    };
  } catch (e) {
    console.warn("[img-validator] erro:", (e as Error).message);
    return { ok: true, score: 100, issues: [], warnings: [`Validação falhou: ${(e as Error).message}`] };
  }
}
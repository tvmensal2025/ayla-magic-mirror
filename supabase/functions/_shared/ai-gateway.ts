// Lovable AI Gateway helper (OpenAI-compatible).
// Server-side only. Reads LOVABLE_API_KEY from env.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; [k: string]: any }>;
}

export interface AIChatOptions {
  model?: string;
  messages: AIChatMessage[];
  temperature?: number;
  responseFormat?: "text" | "json_object";
  jsonSchema?: { name: string; schema: Record<string, any> };
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AIChatResult {
  text: string;
  json?: any;
  usage?: any;
  raw: any;
}

export async function aiChat(opts: AIChatOptions): Promise<AIChatResult> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");

  const body: Record<string, any> = {
    model: opts.model || "google/gemini-3-flash-preview",
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
    };
  } else if (opts.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "lovable-shared",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error(`AI rate limited (429): ${errText}`);
    if (res.status === 402) throw new Error(`AI credits exhausted (402): ${errText}`);
    throw new Error(`AI gateway ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  let json: any = undefined;
  if ((opts.jsonSchema || opts.responseFormat === "json_object") && typeof text === "string") {
    try { json = JSON.parse(text); } catch { /* ignore */ }
  }
  return { text: typeof text === "string" ? text : "", json, usage: data?.usage, raw: data };
}

// Multimodal helper for transcription / vision via inline base64.
export async function aiMultimodal(opts: {
  model?: string;
  prompt: string;
  base64: string;
  mimeType: string;
  signal?: AbortSignal;
}): Promise<string> {
  const result = await aiChat({
    model: opts.model || "google/gemini-3-flash-preview",
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: opts.prompt },
          { type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${opts.base64}` } },
        ],
      },
    ],
    signal: opts.signal,
  });
  return result.text;
}
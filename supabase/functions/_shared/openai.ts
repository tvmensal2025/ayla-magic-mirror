// OpenAI chat helper (direct platform.openai.com).
// Server-side only. Reads OPENAI_API_KEY from env.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; [k: string]: any }>;
}

export interface OpenAIChatOptions {
  apiKey?: string;
  model?: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  responseFormat?: "text" | "json_object";
  jsonSchema?: { name: string; schema: Record<string, any> };
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface OpenAIChatResult {
  text: string;
  json?: any;
  usage?: any;
  raw: any;
}

export async function openaiChat(opts: OpenAIChatOptions): Promise<OpenAIChatResult> {
  const key = opts.apiKey || Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  const model = opts.model || "gpt-5-mini";
  // gpt-5 / o1 family rejeitam temperature != 1 (default da OpenAI). Omitimos
  // o campo nesses modelos para evitar 400 "Unsupported value: 'temperature'".
  const modelLocksTemperature = /^(gpt-5|o1|o3|o4)/i.test(model);
  const body: Record<string, any> = {
    model,
    messages: opts.messages,
  };
  if (!modelLocksTemperature) {
    body.temperature = opts.temperature ?? 0.2;
  } else if (typeof opts.temperature === "number" && opts.temperature !== 1) {
    // caller passou explicitamente — silenciosamente normaliza para 1
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
    };
  } else if (opts.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error(`OpenAI rate limited (429): ${errText}`);
    if (res.status === 401) throw new Error(`OpenAI auth failed (401): ${errText}`);
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  let json: any = undefined;
  if ((opts.jsonSchema || opts.responseFormat === "json_object") && typeof text === "string") {
    try { json = JSON.parse(text); } catch { /* ignore */ }
  }
  return { text: typeof text === "string" ? text : "", json, usage: data?.usage, raw: data };
}

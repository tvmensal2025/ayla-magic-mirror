// Track AI cost + decisions in ai_costs and ai_decisions.
// Best-effort: never throws. Pricing in USD/1M tokens (rough Lovable Gateway estimates).

const PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-3-flash-preview":      { input: 0.075, output: 0.30 },
  "google/gemini-3.1-flash-lite-preview":{ input: 0.05,  output: 0.20 },
  "google/gemini-3.5-flash":            { input: 0.10,  output: 0.40 },
  "google/gemini-2.5-flash-lite":       { input: 0.05,  output: 0.20 },
  "google/gemini-2.5-flash":            { input: 0.075, output: 0.30 },
  "google/gemini-2.5-pro":              { input: 1.25,  output: 5.00 },
  "google/gemini-3.1-pro-preview":      { input: 1.50,  output: 6.00 },
  "openai/gpt-5-nano":                  { input: 0.10,  output: 0.40 },
  "openai/gpt-5-mini":                  { input: 0.30,  output: 1.20 },
  "openai/gpt-5":                       { input: 2.50,  output: 10.00 },
  "openai/gpt-5.2":                     { input: 3.00,  output: 12.00 },
  "openai/gpt-5.4-mini":                { input: 0.40,  output: 1.60 },
  "openai/gpt-5.4":                     { input: 3.00,  output: 12.00 },
  "openai/gpt-5.4-pro":                 { input: 6.00,  output: 24.00 },
  "openai/gpt-5.5":                     { input: 4.00,  output: 16.00 },
  "openai/gpt-5.5-pro":                 { input: 8.00,  output: 32.00 },
};

export type AIPhase =
  | "triage" | "orchestrator" | "faq" | "extract" | "intent"
  | "button" | "ocr" | "other";

export interface UsageTokens { input?: number; output?: number; total?: number; }

export function estimateUsd(model: string, usage?: UsageTokens): number {
  const p = PRICING[model];
  if (!p || !usage) return 0;
  const inTok = Number(usage.input || 0);
  const outTok = Number(usage.output || 0);
  return Number(((inTok * p.input + outTok * p.output) / 1_000_000).toFixed(6));
}

export async function trackAIUsage(opts: {
  supabase: any;
  consultantId?: string | null;
  model: string;
  phase: AIPhase;
  usage?: UsageTokens;
}): Promise<void> {
  try {
    const usd = estimateUsd(opts.model, opts.usage);
    const day = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
      .toISOString().slice(0, 10);
    // Upsert daily counter
    const { data: existing } = await opts.supabase
      .from("ai_costs")
      .select("id, calls, input_tokens, output_tokens, usd_est")
      .eq("consultant_id", opts.consultantId ?? null)
      .eq("day", day).eq("model", opts.model).eq("phase", opts.phase)
      .maybeSingle();
    if (existing?.id) {
      await opts.supabase.from("ai_costs").update({
        calls: (existing.calls || 0) + 1,
        input_tokens: (existing.input_tokens || 0) + Number(opts.usage?.input || 0),
        output_tokens: (existing.output_tokens || 0) + Number(opts.usage?.output || 0),
        usd_est: Number(((existing.usd_est || 0) + usd).toFixed(6)),
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await opts.supabase.from("ai_costs").insert({
        consultant_id: opts.consultantId ?? null,
        day, model: opts.model, phase: opts.phase, calls: 1,
        input_tokens: Number(opts.usage?.input || 0),
        output_tokens: Number(opts.usage?.output || 0),
        usd_est: usd,
      });
    }
  } catch (e) {
    console.warn("[ai-cost-tracker] track failed:", (e as Error).message);
  }
}

export async function logAIDecision(opts: {
  supabase: any;
  customerId?: string | null;
  consultantId?: string | null;
  phase: AIPhase;
  toolCalled?: string | null;
  model: string;
  userInput?: string;
  aiOutput?: string;
  intentDetected?: string | null;
  confidence?: number | null;
  latencyMs?: number | null;
  stepBefore?: string | null;
  stepAfter?: string | null;
  replySent?: boolean;
  suppressed?: boolean;
  reasoning?: string;
}): Promise<void> {
  try {
    await opts.supabase.from("ai_decisions").insert({
      customer_id: opts.customerId ?? null,
      consultant_id: opts.consultantId ?? null,
      phase: opts.phase,
      tool_called: opts.toolCalled ?? null,
      model: opts.model,
      user_input: (opts.userInput || "").slice(0, 2000),
      ai_output: (opts.aiOutput || "").slice(0, 4000),
      intent_detected: opts.intentDetected ?? null,
      confidence: opts.confidence ?? null,
      latency_ms: opts.latencyMs ?? null,
      step_before: opts.stepBefore ?? null,
      step_after: opts.stepAfter ?? null,
      reply_sent: !!opts.replySent,
      suppressed: !!opts.suppressed,
      reasoning: (opts.reasoning || "").slice(0, 2000),
      source: "orchestrator",
    });
  } catch (e) {
    console.warn("[ai-cost-tracker] logDecision failed:", (e as Error).message);
  }
}

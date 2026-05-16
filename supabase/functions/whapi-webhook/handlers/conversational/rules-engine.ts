// Global keyword Rules Engine for the conversational flow.
// Evaluates `bot_flow_rules` against an incoming message and decides whether
// to: (a) respond inline and KEEP the current step ('stay'),
//     (b) go to another step (saving previous_conversation_step for return),
//     (c) restart the flow,
//     (d) hand off to a human.
//
// Hard guarantees:
// - Never runs in CADASTRO_STEPS or aguardando_humano (caller already checks).
// - Regex is wrapped in try/catch + length cap to avoid ReDoS pinning the webhook.
// - Cooldown per (customer, rule) prevents loops.
// - max_fires_per_conversation enforced via bot_flow_rule_fires count.
// - Idempotency: media dedupe goes through existing try_log_media_send.

export interface BotFlowRule {
  id: string;
  flow_id: string;
  consultant_id: string;
  name: string;
  match_mode: "contains" | "exact" | "regex";
  keywords: string[];
  regex_pattern: string | null;
  normalize: boolean;
  min_word_boundary: boolean;
  priority: number;
  scope: "global" | "step";
  scoped_step_ids: string[];
  excluded_step_ids: string[];
  response_text: string | null;
  media_id: string | null;
  return_behavior: "stay" | "goto_step" | "restart" | "handoff";
  goto_step_id: string | null;
  cooldown_seconds: number;
  max_fires_per_conversation: number | null;
  is_active: boolean;
}

export interface RuleMatchResult {
  rule: BotFlowRule;
  matchedKeyword: string;
}

const REGEX_MAX_LEN = 200;     // pattern length cap (defensive)
const TEXT_MAX_LEN  = 4000;    // message length cap for matching

export function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pure matcher — no I/O. Returns the keyword that matched, or null. */
export function tryMatchRule(rule: BotFlowRule, rawMessage: string): string | null {
  if (!rule.is_active) return null;
  const message = String(rawMessage || "").slice(0, TEXT_MAX_LEN);
  if (!message) return null;

  const haystack = rule.normalize ? normalize(message) : message;

  if (rule.match_mode === "regex") {
    const pat = String(rule.regex_pattern || "").slice(0, REGEX_MAX_LEN);
    if (!pat) return null;
    try {
      const re = new RegExp(pat, rule.normalize ? "i" : "");
      const m = re.exec(haystack);
      return m ? (m[0] || pat) : null;
    } catch (_e) {
      return null;
    }
  }

  for (const kwRaw of rule.keywords || []) {
    const kw = rule.normalize ? normalize(kwRaw) : String(kwRaw || "").trim();
    if (!kw || kw.length < 2) continue; // evita keyword de 1 caractere matchando qualquer coisa

    if (rule.match_mode === "exact") {
      if (haystack === kw) return kwRaw;
      continue;
    }
    // contains
    if (rule.min_word_boundary) {
      try {
        const re = new RegExp(`(^|\\s|\\p{P})${escapeRegex(kw)}(?=$|\\s|\\p{P})`, "u");
        if (re.test(haystack)) return kwRaw;
      } catch (_e) {
        if (haystack.includes(kw)) return kwRaw;
      }
    } else if (haystack.includes(kw)) {
      return kwRaw;
    }
  }
  return null;
}

/** Filters rules by scope vs currentStepId. */
export function isRuleApplicable(rule: BotFlowRule, currentStepId: string): boolean {
  if (!rule.is_active) return false;
  if ((rule.excluded_step_ids || []).includes(currentStepId)) return false;
  if (rule.scope === "step") {
    return (rule.scoped_step_ids || []).includes(currentStepId);
  }
  return true; // global
}

export interface EvaluateArgs {
  supabase: any;
  flowId: string;
  consultantId: string;
  customerId: string | null;
  currentStepId: string;         // the step the customer is in right now
  messageText: string;
  lastRuleFireAt?: string | null;
  lastRuleId?: string | null;
  hasCapture?: boolean;          // mensagem produziu uma captura (valor/nome/telefone) — pula regras globais
}

/**
 * Loads active rules for the flow and returns the first match (by priority).
 * Applies cooldown and max_fires_per_conversation guards.
 */
export async function evaluateRules(args: EvaluateArgs): Promise<RuleMatchResult | null> {
  const { supabase, flowId, consultantId, customerId, currentStepId, messageText, hasCapture } = args;
  if (!messageText || messageText.trim().length < 2) return null;

  let rules: BotFlowRule[] = [];
  try {
    const { data, error } = await supabase
      .from("bot_flow_rules")
      .select(
        "id,flow_id,consultant_id,name,match_mode,keywords,regex_pattern,normalize,min_word_boundary,priority,scope,scoped_step_ids,excluded_step_ids,response_text,media_id,return_behavior,goto_step_id,cooldown_seconds,max_fires_per_conversation,is_active"
      )
      .eq("flow_id", flowId)
      .eq("is_active", true)
      .order("priority", { ascending: true });
    if (error) {
      console.error("[rules-engine] load failed", error);
      return null;
    }
    rules = (data as BotFlowRule[]) || [];
  } catch (e) {
    console.error("[rules-engine] load threw", e);
    return null;
  }

  const nowMs = Date.now();
  const lastFireMs = args.lastRuleFireAt ? new Date(args.lastRuleFireAt).getTime() : 0;

  for (const rule of rules) {
    if (!isRuleApplicable(rule, currentStepId)) continue;
    // Se a mensagem disparou captura legítima, regras GLOBAIS não interceptam
    if (hasCapture && rule.scope === "global") continue;
    // Cooldown: same rule fired within cooldown_seconds → skip
    if (
      rule.cooldown_seconds > 0 &&
      args.lastRuleId === rule.id &&
      lastFireMs > 0 &&
      nowMs - lastFireMs < rule.cooldown_seconds * 1000
    ) {
      continue;
    }

    const matched = tryMatchRule(rule, messageText);
    if (!matched) continue;

    // Max fires per conversation
    if (rule.max_fires_per_conversation && rule.max_fires_per_conversation > 0 && customerId) {
      try {
        const { count } = await supabase
          .from("bot_flow_rule_fires")
          .select("id", { count: "exact", head: true })
          .eq("rule_id", rule.id)
          .eq("customer_id", customerId);
        if ((count || 0) >= rule.max_fires_per_conversation) continue;
      } catch (e) {
        console.error("[rules-engine] count fires failed", e);
      }
    }

    return { rule, matchedKeyword: matched };
  }

  return null;
}

/** Logs a fire (best-effort, never throws to caller). */
export async function logRuleFire(
  supabase: any,
  args: {
    ruleId: string;
    consultantId: string;
    customerId: string | null;
    matchedKeyword: string;
    messageText: string;
    stepBefore: string;
    stepAfter: string;
    returnBehavior: string;
  },
): Promise<void> {
  try {
    await supabase.from("bot_flow_rule_fires").insert({
      rule_id: args.ruleId,
      consultant_id: args.consultantId,
      customer_id: args.customerId,
      matched_keyword: args.matchedKeyword,
      message_text: (args.messageText || "").slice(0, 2000),
      step_before: args.stepBefore,
      step_after: args.stepAfter,
      return_behavior: args.returnBehavior,
    });
  } catch (e) {
    console.error("[rules-engine] logRuleFire failed", e);
  }
}

// Conversational flow entrypoint — Part 3 of the dynamic flow migration.
// Loads steps + transitions from `bot_flow_steps` (the table the FluxoCamila UI edits)
// and decides the next step from there. Falls back to the legacy hardcoded
// state machine if the consultant has no flow configured.

import type { BotContext, BotResult } from "../types.ts";
import { CONVERSATIONAL_STEPS, decideTransition, type ConversationalStep } from "./state-machine.ts";
import { classifyIntent } from "./intent-classifier.ts";
import { getTemplate, renderTemplate } from "./templates.ts";

export { CONVERSATIONAL_STEPS };

interface DbTransition {
  trigger_intent?: string | null;
  trigger_phrases?: string[] | null;
  goto_step_id?: string | null;
  goto_special?: string | null; // 'cadastro' | 'humano' | 'repeat' | null
}

interface DbCapture {
  field: "name" | "electricity_bill_value" | "phone_whatsapp" | "cpf";
  enabled?: boolean;
}

interface DbFallback {
  mode?: "repeat" | "goto" | "ai";
  goto_step_id?: string | null;
  ai_prompt?: string | null;
}

interface DbStep {
  id: string;
  step_key: string;
  message_text: string | null;
  slot_key: string | null;
  is_active: boolean;
  position: number;
  transitions: DbTransition[] | null;
  captures: DbCapture[] | null;
  fallback: DbFallback | null;
}

// Steps the bot must NEVER override (cadastro pipeline owns them)
const CADASTRO_STEPS = new Set([
  "aguardando_conta", "processando_ocr_conta", "confirmando_dados_conta",
  "ask_tipo_documento", "aguardando_doc_frente", "aguardando_doc_verso",
  "confirmando_dados_doc", "ask_name", "ask_cpf", "ask_rg", "ask_birth_date",
  "ask_phone_confirm", "ask_phone", "ask_email", "ask_cep", "ask_number",
  "ask_complement", "ask_installation_number", "ask_bill_value",
  "ask_doc_frente_manual", "ask_doc_verso_manual", "ask_finalizar",
  "finalizando", "portal_submitting", "aguardando_otp", "validando_otp",
  "aguardando_assinatura", "complete",
]);

async function loadFlow(supabase: any, consultantId: string): Promise<DbStep[] | null> {
  try {
    const { data: flow } = await supabase
      .from("bot_flows")
      .select("id")
      .eq("consultant_id", consultantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!flow?.id) return null;

    const { data: steps } = await supabase
      .from("bot_flow_steps")
      .select("id, step_key, message_text, slot_key, is_active, position, transitions, captures, fallback")
      .eq("flow_id", flow.id)
      .order("position", { ascending: true });
    return (steps || []) as DbStep[];
  } catch (e) {
    console.error("[conversational] loadFlow failed", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Capture extractors — detect data in the lead's message
// ---------------------------------------------------------------------------
const CAPTURE_RX = {
  electricity_bill_value: /(?:R?\$\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:reais|conta|de luz|R\$)?/i,
  phone_whatsapp: /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\s*\d{4}[-\s]?\d{4}/,
  cpf: /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
  // nome: heurística "sou X", "me chamo X Y", "meu nome é X"
  name: /(?:sou|me chamo|meu nome [eé]|aqui [eé]?|nome:?)\s+([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})/i,
};

interface ExtractedCaptures {
  electricity_bill_value?: number;
  phone_whatsapp?: string;
  cpf?: string;
  name?: string;
}

function extractCaptures(messageText: string, configured: DbCapture[]): ExtractedCaptures {
  const out: ExtractedCaptures = {};
  if (!messageText) return out;
  const enabled = new Set((configured || []).filter(c => c.enabled !== false).map(c => c.field));

  if (enabled.has("electricity_bill_value")) {
    // Só captura se mensagem parece falar de dinheiro/conta — evita pegar idade etc.
    if (/r\$|\bconta\b|\breais?\b|\bluz\b|\bvalor\b|^\s*\d{2,4}\s*$/i.test(messageText)) {
      const m = messageText.match(/\d{1,4}(?:[.,]\d{1,2})?/);
      if (m) {
        const v = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
        if (!isNaN(v) && v >= 30 && v <= 5000) out.electricity_bill_value = v;
      }
    }
  }
  if (enabled.has("phone_whatsapp")) {
    const m = messageText.match(CAPTURE_RX.phone_whatsapp);
    if (m) out.phone_whatsapp = m[0].replace(/\D/g, "");
  }
  if (enabled.has("cpf")) {
    const m = messageText.match(CAPTURE_RX.cpf);
    if (m) out.cpf = m[0].replace(/\D/g, "");
  }
  if (enabled.has("name")) {
    const m = messageText.match(CAPTURE_RX.name);
    if (m && m[1]) {
      const cleaned = m[1].trim().split(/\s+/).slice(0, 3).join(" ");
      if (cleaned.length >= 2) out.name = cleaned;
    }
  }
  return out;
}

// Detect "regex-only" intents (não dependem do LLM) — usadas para casar com transitions.
function detectRegexIntents(messageText: string): string[] {
  const intents: string[] = [];
  if (!messageText) return intents;
  if (/r\$\s*\d|\b\d{2,4}\s*reais?\b|\bconta de \d|\bvalor\b.*\d/i.test(messageText)) intents.push("valor_brl");
  else if (/^\s*\d{2,4}([.,]\d{1,2})?\s*$/.test(messageText)) intents.push("valor_brl");
  if (CAPTURE_RX.phone_whatsapp.test(messageText)) intents.push("telefone_br");
  if (CAPTURE_RX.cpf.test(messageText)) intents.push("cpf_br");
  if (CAPTURE_RX.name.test(messageText)) intents.push("nome_proprio");
  return intents;
}

function matchTransition(step: DbStep, intents: string[], messageText: string): DbTransition | null {
  const transitions = Array.isArray(step.transitions) ? step.transitions : [];
  const text = (messageText || "").toLowerCase();
  // 1) match against any of the candidate intents (regex-derived + classifier-derived)
  for (const t of transitions) {
    if (!t.trigger_intent || t.trigger_intent === "default" || t.trigger_intent === "palavra_chave") continue;
    if (intents.includes(t.trigger_intent)) return t;
  }
  // 2) keyword match (palavra_chave OR any rule with phrases)
  for (const t of transitions) {
    const phrases = Array.isArray(t.trigger_phrases) ? t.trigger_phrases : [];
    for (const p of phrases) {
      const needle = (p || "").toLowerCase().trim();
      if (needle && text.includes(needle)) return t;
    }
  }
  return null;
}

async function aiDecideFallback(
  prompt: string,
  messageText: string,
  candidates: { id: string; step_key: string; title?: string }[],
  geminiApiKey: string | undefined,
): Promise<string | null> {
  if (!geminiApiKey || !prompt) return null;
  try {
    const sys = `Você decide o próximo passo de um fluxo de WhatsApp.
Instrução do consultor: ${prompt}

Mensagem do cliente: "${messageText}"

Passos disponíveis (responda APENAS com o step_key exato, ou "REPEAT" pra repetir, ou "HUMANO" pra mandar pra humano, ou "CADASTRO" pra ir ao cadastro):
${candidates.map(c => `- ${c.step_key}`).join("\n")}

Responda com 1 palavra (o step_key escolhido).`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sys }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 30 },
        }),
      },
    );
    const json: any = await res.json();
    const out = (json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().split(/\s+/)[0];
    return out || null;
  } catch (e) {
    console.error("[conversational] aiDecideFallback failed", e);
    return null;
  }
}

export async function runConversationalFlow(ctx: BotContext): Promise<BotResult> {
  const stepKey = (ctx.customer.conversation_step || "welcome") as string;

  // Cadastro steps are NEVER handled here — defensive guard
  if (CADASTRO_STEPS.has(stepKey)) {
    return { reply: "", updates: {} };
  }

  const consultantId = (ctx as any).consultorId || ctx.customer?.consultant_id;
  const dbSteps = consultantId ? await loadFlow(ctx.supabase, consultantId) : null;

  // Fallback to legacy hardcoded machine if no flow seeded
  if (!dbSteps || dbSteps.length === 0) {
    return runLegacyConversational(ctx);
  }

  const currentStep = dbSteps.find((s) => s.step_key === stepKey);
  if (!currentStep) {
    // Unknown step → if it's a legacy known step, run legacy; else reset to first
    if (CONVERSATIONAL_STEPS.has(stepKey)) return runLegacyConversational(ctx);
    const firstActive = dbSteps.find((s) => s.is_active) || dbSteps[0];
    return {
      reply: renderTemplate(firstActive.message_text || "", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: firstActive.step_key },
    };
  }

  const cls = await classifyIntent(ctx.messageText, stepKey as ConversationalStep, ctx.geminiApiKey);

  // Global overrides: cadastro / humano keywords win in any step
  if (cls.intent === "quer_cadastrar") {
    return {
      reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_conta", __intent: cls.intent, __confidence: cls.confidence },
    };
  }
  if (cls.intent === "quer_humano") {
    return {
      reply: await getTemplate(ctx.supabase, "aguardando_humano", "avisado", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_humano", __intent: cls.intent, __confidence: cls.confidence },
    };
  }

  const transition = matchTransition(currentStep, cls.intent, ctx.messageText);

  // No transition matched → repeat current step
  if (!transition) {
    return {
      reply: renderTemplate(currentStep.message_text || "", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: stepKey, __intent: cls.intent, __confidence: cls.confidence },
    };
  }

  // Special destinations
  if (transition.goto_special === "cadastro") {
    return {
      reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence },
    };
  }
  if (transition.goto_special === "humano") {
    return {
      reply: await getTemplate(ctx.supabase, "aguardando_humano", "avisado", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_humano", __intent: cls.intent, __confidence: cls.confidence },
    };
  }
  if (transition.goto_special === "repeat" || (!transition.goto_step_id && !transition.goto_special)) {
    return {
      reply: renderTemplate(currentStep.message_text || "", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: stepKey, __intent: cls.intent, __confidence: cls.confidence },
    };
  }

  // Resolve goto_step_id → step_key
  const nextStep = dbSteps.find((s) => s.id === transition.goto_step_id);
  if (!nextStep || !nextStep.is_active) {
    return {
      reply: renderTemplate(currentStep.message_text || "", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: stepKey, __intent: cls.intent, __confidence: cls.confidence },
    };
  }

  // If destination is cadastro step, route through cadastro entry
  if (nextStep.step_key === "cadastro" || CADASTRO_STEPS.has(nextStep.step_key)) {
    return {
      reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence },
    };
  }

  return {
    reply: renderTemplate(nextStep.message_text || "", {
      nome: ctx.customer.name, representante: ctx.nomeRepresentante,
    }),
    updates: {
      conversation_step: nextStep.step_key,
      __intent: cls.intent,
      __confidence: cls.confidence,
    },
  };
}

// Legacy hardcoded path — preserved for consultants without a custom flow.
async function runLegacyConversational(ctx: BotContext): Promise<BotResult> {
  const step = (ctx.customer.conversation_step || "welcome") as ConversationalStep;
  if (!CONVERSATIONAL_STEPS.has(step)) return { reply: "", updates: {} };

  const cls = await classifyIntent(ctx.messageText, step, ctx.geminiApiKey);
  const transition = decideTransition(step, cls.intent, ctx.customer);
  const vars = { nome: ctx.customer.name, representante: ctx.nomeRepresentante };
  let reply = "";
  if (transition.action.type === "send_template") {
    reply = await getTemplate(ctx.supabase, transition.action.step_key, transition.action.template_key, vars);
  }
  return {
    reply,
    updates: {
      conversation_step: transition.nextStep,
      __intent: cls.intent,
      __confidence: cls.confidence,
    },
  };
}

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

interface DbStep {
  id: string;
  step_key: string;
  message_text: string | null;
  slot_key: string | null;
  is_active: boolean;
  position: number;
  transitions: DbTransition[] | null;
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
      .select("id, step_key, message_text, slot_key, is_active, position, transitions")
      .eq("flow_id", flow.id)
      .order("position", { ascending: true });
    return (steps || []) as DbStep[];
  } catch (e) {
    console.error("[conversational] loadFlow failed", e);
    return null;
  }
}

function matchTransition(step: DbStep, intent: string, messageText: string): DbTransition | null {
  const transitions = Array.isArray(step.transitions) ? step.transitions : [];
  const text = (messageText || "").toLowerCase();
  // 1) exact intent match
  for (const t of transitions) {
    if (t.trigger_intent && t.trigger_intent !== "default" && t.trigger_intent === intent) return t;
  }
  // 2) keyword match
  for (const t of transitions) {
    const phrases = Array.isArray(t.trigger_phrases) ? t.trigger_phrases : [];
    for (const p of phrases) {
      const needle = (p || "").toLowerCase().trim();
      if (needle && text.includes(needle)) return t;
    }
  }
  // 3) default
  for (const t of transitions) {
    if (t.trigger_intent === "default") return t;
  }
  return null;
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

// Conversational flow entrypoint — DORMANT.
// Wired into runBotFlow only behind a feature flag in step 2 of the migration.
// Until then, this file is built and tested but never executed in production.

import type { BotContext, BotResult } from "../types.ts";
import { CONVERSATIONAL_STEPS, decideTransition, type ConversationalStep } from "./state-machine.ts";
import { classifyIntent } from "./intent-classifier.ts";
import { getTemplate } from "./templates.ts";

export { CONVERSATIONAL_STEPS };

export async function runConversationalFlow(ctx: BotContext): Promise<BotResult> {
  const step = (ctx.customer.conversation_step || "welcome") as ConversationalStep;

  if (!CONVERSATIONAL_STEPS.has(step)) {
    // Defensive: caller should have checked. Don't touch cadastro.
    return { reply: "", updates: {} };
  }

  const cls = await classifyIntent(ctx.messageText, step, ctx.geminiApiKey);
  const transition = decideTransition(step, cls.intent, ctx.customer);

  const vars = { nome: ctx.customer.name, representante: ctx.nomeRepresentante };
  let reply = "";

  if (transition.action.type === "send_template") {
    reply = await getTemplate(
      ctx.supabase,
      transition.action.step_key,
      transition.action.template_key,
      vars,
    );
  } else if (transition.action.type === "send_video") {
    // Video sending is delegated to the existing media pipeline upstream.
    // Here we only set the followup step so the orchestrator knows where to land.
    reply = "";
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

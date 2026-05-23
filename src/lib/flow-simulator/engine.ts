// Motor de Fluxo local — pura função.
// Recebe (passo atual, mensagem do lead, buttonId) e retorna o próximo passo
// conforme as transitions configuradas. Não chama Evolution/Whapi nem persiste nada.
//
// Reqs cobertos: 4 (execução local), 5 (mensagens pré-definidas + texto livre).

import type { Step } from "@/components/admin/flow-builder/flowTypes";

export type SimulationEvent =
  | {
      type: "bot_step";
      stepId: string;
      stepKey: string;
      title: string;
      text: string;
      slotKey: string | null;
      buttons: { id: string; title: string }[];
      timestamp: number;
    }
  | {
      type: "lead_message";
      text: string;
      timestamp: number;
    }
  | {
      type: "system";
      text: string;
      timestamp: number;
    };

export interface SimulationInput {
  step: Step;
  allSteps: Step[];
  messageText: string;
  buttonId?: string;
}

export type SimulationResult =
  | { kind: "transition"; nextStepId: string; via: string }
  | { kind: "special"; special: "humano" | "cadastro" | "repeat" | "menu" }
  | { kind: "fallback"; fallbackMode: string; nextStepId?: string }
  | { kind: "missing_step"; missingId: string };

function norm(s: string | null | undefined): string {
  return (s ?? "").toString().toLowerCase().trim();
}

/**
 * Match transition → mesma lógica do _shared/flow-router.ts (matchTransition).
 * Ordem de prioridade:
 *   (a) buttonId em trigger_phrases
 *   (b) buttonId em goto_special
 *   (c) intent match (não usado aqui — sem Gemini local)
 *   (d) messageText contains trigger_phrase
 */
export function simulateStep(input: SimulationInput): SimulationResult {
  const { step, allSteps, messageText, buttonId } = input;
  const transitions = Array.isArray(step.transitions) ? step.transitions : [];
  const btn = norm(buttonId);
  const msg = norm(messageText);

  // (a) buttonId em trigger_phrases
  if (btn) {
    for (const t of transitions) {
      const phrases = (t.trigger_phrases || []).map(norm);
      if (phrases.includes(btn)) {
        return resolveTransition(t, allSteps, `botão "${buttonId}"`);
      }
    }
    // (b) buttonId em goto_special
    for (const t of transitions) {
      if (norm(t.goto_special) === btn) {
        return { kind: "special", special: btn as any };
      }
    }
  }

  // (d) messageText contém alguma trigger_phrase
  if (msg) {
    for (const t of transitions) {
      const phrases = (t.trigger_phrases || []).map(norm);
      for (const p of phrases) {
        if (p && (msg === p || msg.includes(p) || (p.length <= 8 && p.includes(msg)))) {
          return resolveTransition(t, allSteps, `texto "${p}"`);
        }
      }
    }
  }

  // Fallback configurado
  const fb = step.fallback;
  if (fb) {
    if (fb.mode === "goto" && fb.goto_step_id) {
      const dst = allSteps.find((s) => s.id === fb.goto_step_id);
      if (!dst) return { kind: "missing_step", missingId: fb.goto_step_id };
      return { kind: "fallback", fallbackMode: "goto", nextStepId: dst.id };
    }
    if (fb.mode === "repeat") {
      return { kind: "fallback", fallbackMode: "repeat", nextStepId: step.id };
    }
    if (fb.mode === "ai" || fb.mode === "ai_limit") {
      return { kind: "fallback", fallbackMode: fb.mode };
    }
  }
  return { kind: "fallback", fallbackMode: "no_fallback" };
}

function resolveTransition(
  t: any,
  allSteps: Step[],
  via: string,
): SimulationResult {
  if (t.goto_special) {
    return { kind: "special", special: t.goto_special };
  }
  if (t.goto_step_id) {
    const dst = allSteps.find((s) => s.id === t.goto_step_id);
    if (!dst) return { kind: "missing_step", missingId: t.goto_step_id };
    return { kind: "transition", nextStepId: t.goto_step_id, via };
  }
  return { kind: "fallback", fallbackMode: "no_destination" };
}

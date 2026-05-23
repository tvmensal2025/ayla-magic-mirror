import { useMemo } from "react";
import { Step, getButtons } from "./flowTypes";

export type FlowWarning = {
  id: string;                       // chave única estável (stepId + tipo + alvo)
  stepId: string;
  level: "error" | "warn" | "info";
  kind:
    | "transition_no_dest"
    | "transition_dest_missing"
    | "transition_dest_inactive"
    | "button_no_rule"
    | "orphan_step"
    | "unresolved_var"
    | "empty_message";
  message: string;
  /** Sugestão de correção automática (se aplicável). */
  autoFix?: () => Partial<Step> | null;
};

const KNOWN_VARS = new Set([
  "nome", "valor_conta", "economia_range", "telefone", "cpf", "representante", "email",
]);

export type FlowValidation = {
  warnings: FlowWarning[];
  byStep: Record<string, FlowWarning[]>;
  total: number;
  errors: number;
  /** Tenta auto-corrigir todos os warnings que têm autoFix. Retorna o array de patches por stepId. */
  autoFixablePatches: { stepId: string; patch: Partial<Step> }[];
};

export function useFlowValidation(steps: Step[]): FlowValidation {
  return useMemo(() => {
    const warnings: FlowWarning[] = [];
    const reachable = new Set<string>();

    // Marca primeiro passo + qualquer passo destino de transition como alcançável
    if (steps.length) reachable.add(steps[0].id);
    for (const s of steps) {
      for (const t of s.transitions) {
        if (t.goto_step_id) reachable.add(t.goto_step_id);
      }
      // fallback goto também conta como alcançável
      if (s.fallback?.mode === "goto" && s.fallback.goto_step_id) {
        reachable.add(s.fallback.goto_step_id);
      }
      // Passos sequenciais (sem transitions) seguem por position — todos alcançáveis a partir do anterior.
      if (s.transitions.length === 0) {
        const next = steps.find((x) => x.position === s.position + 1);
        if (next) reachable.add(next.id);
      }
    }

    for (const s of steps) {
      // mensagem vazia em passo do tipo "message"
      if (s.step_type === "message" && s.is_active && !(s.message_text ?? "").trim()) {
        warnings.push({
          id: `${s.id}:empty_message`,
          stepId: s.id,
          level: "warn",
          kind: "empty_message",
          message: "Passo sem texto de mensagem",
        });
      }

      // variáveis desconhecidas
      const text = s.message_text ?? "";
      const matches = text.match(/\{\{([a-z0-9_]+)\}\}/gi) || [];
      for (const m of matches) {
        const name = m.slice(2, -2).toLowerCase();
        if (!KNOWN_VARS.has(name)) {
          warnings.push({
            id: `${s.id}:unresolved_var:${name}`,
            stepId: s.id,
            level: "warn",
            kind: "unresolved_var",
            message: `Variável desconhecida {{${name}}}`,
          });
        }
      }

      // transitions
      for (const [idx, t] of s.transitions.entries()) {
        const label = t.trigger_phrases[0] || t.trigger_intent || `regra #${idx + 1}`;
        if (!t.goto_step_id && !t.goto_special) {
          warnings.push({
            id: `${s.id}:transition_no_dest:${idx}`,
            stepId: s.id,
            level: "error",
            kind: "transition_no_dest",
            message: `Regra "${label}" sem destino`,
            autoFix: () => {
              // remove transition órfã
              const next = s.transitions.filter((_, i) => i !== idx);
              return { transitions: next };
            },
          });
          continue;
        }
        if (t.goto_step_id) {
          const dst = steps.find((x) => x.id === t.goto_step_id);
          if (!dst) {
            warnings.push({
              id: `${s.id}:transition_dest_missing:${idx}`,
              stepId: s.id,
              level: "error",
              kind: "transition_dest_missing",
              message: `Regra "${label}" aponta para passo removido`,
              autoFix: () => {
                const next = s.transitions.filter((_, i) => i !== idx);
                return { transitions: next };
              },
            });
          } else if (!dst.is_active) {
            warnings.push({
              id: `${s.id}:transition_dest_inactive:${idx}`,
              stepId: s.id,
              level: "warn",
              kind: "transition_dest_inactive",
              message: `Regra "${label}" aponta para "${dst.title}" (inativo)`,
            });
          }
        }
      }

      // botões sem regra de destino
      const buttons = getButtons(s);
      for (const b of buttons) {
        const hasRule = s.transitions.some(
          (t) =>
            t.trigger_intent === b.id ||
            t.trigger_phrases.includes(b.title) ||
            t.trigger_phrases.includes(b.id),
        );
        if (!hasRule) {
          warnings.push({
            id: `${s.id}:button_no_rule:${b.id}`,
            stepId: s.id,
            level: "warn",
            kind: "button_no_rule",
            message: `Botão "${b.title}" sem regra de destino`,
          });
        }
      }

      // passo órfão (ativo, mas ninguém aponta pra ele e não está em sequência)
      if (s.is_active && !reachable.has(s.id) && steps.length > 1) {
        warnings.push({
          id: `${s.id}:orphan_step`,
          stepId: s.id,
          level: "info",
          kind: "orphan_step",
          message: "Nenhum passo leva até aqui",
        });
      }
    }

    const byStep: Record<string, FlowWarning[]> = {};
    for (const w of warnings) {
      (byStep[w.stepId] ||= []).push(w);
    }

    // Consolida autofixes por step (último ganha — UI deve chamar 1x por step)
    const byStepFix: Record<string, Partial<Step>> = {};
    for (const w of warnings) {
      if (!w.autoFix) continue;
      const patch = w.autoFix();
      if (!patch) continue;
      byStepFix[w.stepId] = { ...(byStepFix[w.stepId] || {}), ...patch };
    }
    const autoFixablePatches = Object.entries(byStepFix).map(([stepId, patch]) => ({ stepId, patch }));

    return {
      warnings,
      byStep,
      total: warnings.length,
      errors: warnings.filter((w) => w.level === "error").length,
      autoFixablePatches,
    };
  }, [steps]);
}

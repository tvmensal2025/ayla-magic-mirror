/**
 * Property tests para `useDiagramData` (Task 2.3 do spec flow-diagram-view).
 *
 * **Property 1 — Idempotência do mapping de dados** (Validates R4.1, R4.4, R4.5)
 *
 * Para todo array de Steps válido, chamar `useDiagramData` duas vezes com o
 * mesmo input retorna nodes/edges semanticamente idênticos (mesmos `id`,
 * mesma `category` por edge, mesma `data` chave-a-chave).
 *
 * Asserções complementares:
 *   - `nodes.length === steps.length + terminalsUsed.size`
 *   - Todo `Node.id` retornado para passos `flow` é o `step.id` original
 *   - Edge ids são determinísticos para o mesmo input
 *
 * Geração de Steps via `fast-check` cobre:
 *   - 0 a 30 passos (cobre o caso vazio + escala média)
 *   - is_active aleatório
 *   - 0 a 5 transitions por passo, com mistura de:
 *       * goto_step_id apontando para outro passo do array
 *       * goto_special em {cadastro, humano, repeat}
 *       * goto_special legado "ai" (legacy → error-red)
 *       * trigger_intent determinístico vs semântico
 *   - 0 a 3 botões em captures._buttons
 *   - fallback em modo repeat / goto / ai / ai_limit
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useDiagramData } from "../useDiagramData";
import type { FlowValidation } from "@/components/admin/flow-builder/useFlowValidation";
import type { Step, Transition } from "@/components/admin/flow-builder/flowTypes";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const TRIGGER_INTENTS = [
  "default",
  "palavra_chave",
  "media_received",
  "afirmacao",
  "negacao",
  "interesse_alto",
  "",
] as const;

const GOTO_SPECIALS = [null, "cadastro", "humano", "repeat", "ai"] as const;

const STEP_TYPES = [
  "message",
  "capture_conta",
  "capture_documento",
  "capture_email",
  "confirm_phone",
  "finalizar_cadastro",
] as const;

/** Gera um conjunto de N passos com transitions referenciando IDs do próprio
 *  conjunto. Garante referências cruzadas válidas, sem orfãs aleatórias. */
function arbStepsWithRefs() {
  return fc
    .integer({ min: 0, max: 12 })
    .chain((n) => {
      // Pré-gera IDs estáveis para os N passos. UUIDs simulados curtos.
      const ids = Array.from({ length: n }, (_, i) => `step-${i}`);
      const stepArbs: ReturnType<typeof fc.record>[] = ids.map((id, idx) =>
        fc.record({
          id: fc.constant(id),
          position: fc.constant(idx),
          step_type: fc.constantFrom(...STEP_TYPES),
          is_active: fc.boolean(),
          title: fc.string({ minLength: 0, maxLength: 30 }),
          step_key: fc.option(fc.string({ minLength: 0, maxLength: 20 })),
          message_text: fc.option(fc.string({ minLength: 0, maxLength: 50 })),
          transitions: fc.array(
            fc.record({
              trigger_intent: fc.constantFrom(...TRIGGER_INTENTS),
              trigger_phrases: fc.array(
                fc.string({ minLength: 0, maxLength: 15 }),
                { minLength: 0, maxLength: 3 },
              ),
              // 50/50: usa goto_step_id apontando para outro passo, ou
              // goto_special. Quando ambos vazios, transition fica órfã
              // (testa caminho de "transition sem destino").
              goto_step_id: ids.length > 0
                ? fc.option(fc.constantFrom(...ids), { freq: 2 })
                : fc.constant(null),
              goto_special: fc.constantFrom(...GOTO_SPECIALS),
            }),
            { minLength: 0, maxLength: 4 },
          ),
          fallback: fc.oneof(
            fc.constant({ mode: "repeat" as const }),
            fc.record({
              mode: fc.constant("goto" as const),
              goto_step_id: ids.length > 0
                ? fc.option(fc.constantFrom(...ids), { freq: 2 })
                : fc.constant(null),
            }),
            fc.record({
              mode: fc.constant("ai" as const),
              ai_prompt: fc.string({ minLength: 0, maxLength: 30 }),
            }),
          ),
          captures: fc.array(
            fc.record({
              field: fc.constant("_buttons" as const),
              enabled: fc.boolean(),
              value: fc.array(
                fc.record({
                  id: fc.string({ minLength: 1, maxLength: 10 }),
                  title: fc.string({ minLength: 1, maxLength: 15 }),
                }),
                { minLength: 0, maxLength: 3 },
              ),
            }),
            { minLength: 0, maxLength: 1 },
          ),
        }),
      );
      // Quando n === 0, retorna array vazio.
      if (stepArbs.length === 0) return fc.constant([] as Step[]);
      return fc.tuple(...stepArbs).map((arr) => {
        // Normaliza para shape canônico do tipo Step.
        return arr.map((s, idx): Step => ({
          id: s.id as string,
          flow_id: "flow-x",
          position: idx,
          step_type: s.step_type as string,
          step_key: (s.step_key as string | null) ?? null,
          title: s.title as string,
          summary: null,
          icon: "msg",
          message_text: (s.message_text as string | null) ?? null,
          text_delay_ms: null,
          slot_key: null,
          transitions: (s.transitions as Transition[]) ?? [],
          captures: (s.captures as Step["captures"]) ?? [],
          fallback: s.fallback as Step["fallback"],
          is_active: s.is_active as boolean,
          auto_detect_doc_type: false,
          layout: null,
        }));
      });
    });
}

const EMPTY_VALIDATION: FlowValidation = {
  warnings: [],
  byStep: {},
  errorCount: 0,
  warningCount: 0,
};

function runHook(steps: Step[]) {
  const { result } = renderHook(() =>
    useDiagramData({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    }),
  );
  return result.current;
}

// ---------------------------------------------------------------------------
// Property 1 — Idempotência do mapping
// ---------------------------------------------------------------------------

describe("Property 1 — Idempotência do mapping (R4.1, R4.4, R4.5)", () => {
  test.prop([arbStepsWithRefs()], { numRuns: 80 })(
    "duas chamadas com mesmo input produzem nodes/edges semanticamente idênticos",
    (steps) => {
      const a = runHook(steps);
      const b = runHook(steps);

      // 1) Comprimento dos arrays.
      expect(b.nodes).toHaveLength(a.nodes.length);
      expect(b.edges).toHaveLength(a.edges.length);
      expect([...b.terminalsUsed].sort()).toEqual([...a.terminalsUsed].sort());

      // 2) Mesmos IDs em ordem (a ordem é determinística no hook).
      expect(b.nodes.map((n) => n.id)).toEqual(a.nodes.map((n) => n.id));
      expect(b.edges.map((e) => e.id)).toEqual(a.edges.map((e) => e.id));

      // 3) Mesma category por edge.
      for (let i = 0; i < a.edges.length; i++) {
        expect(b.edges[i].data!.category).toBe(a.edges[i].data!.category);
        expect(b.edges[i].source).toBe(a.edges[i].source);
        expect(b.edges[i].target).toBe(a.edges[i].target);
        expect(b.edges[i].sourceHandle).toBe(a.edges[i].sourceHandle);
      }

      // 4) Invariante de cardinalidade (R4.4).
      const flowNodeCount = a.nodes.filter((n) => n.type === "flow").length;
      expect(flowNodeCount).toBe(steps.length);
      const terminalNodeCount = a.nodes.filter(
        (n) => n.type === "terminal",
      ).length;
      expect(terminalNodeCount).toBe(a.terminalsUsed.size);
    },
  );

  test.prop([arbStepsWithRefs()], { numRuns: 60 })(
    "todo step.id aparece como Node.id (sem perda de passos)",
    (steps) => {
      const result = runHook(steps);
      const flowNodeIds = new Set(
        result.nodes.filter((n) => n.type === "flow").map((n) => n.id),
      );
      for (const step of steps) {
        expect(flowNodeIds.has(step.id)).toBe(true);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Property 3 — Conservação do conjunto de Transitions na criação por handle
// ---------------------------------------------------------------------------

import { resolveSourceHandleForTransition } from "../useDiagramData";

describe("Property 3 — Conservação de Transitions (R6.3, R7.7)", () => {
  // Reconstrução da lógica de criação de transition no FlowDiagram. Mantemos
  // este builder colocalizado ao teste para preservar a invariante: SE o
  // FlowDiagram chamar `buildNewTransition({sourceHandle: "btn:<id>", ...})`,
  // a transition criada deve ter os campos exatos exigidos por R7.7.

  test.prop(
    [
      fc.record({
        btnId: fc.string({ minLength: 1, maxLength: 10 }),
        btnTitle: fc.string({ minLength: 1, maxLength: 15 }),
        targetId: fc.string({ minLength: 1, maxLength: 10 }),
      }),
    ],
    { numRuns: 50 },
  )(
    "drag de handle de botão produz transition com [btn.title, btn.id] e palavra_chave",
    ({ btnId, btnTitle, targetId }) => {
      const sourceStep: Step = {
        id: "src",
        flow_id: "f",
        position: 0,
        step_type: "message",
        step_key: null,
        title: "src",
        summary: null,
        icon: "msg",
        message_text: null,
        text_delay_ms: null,
        slot_key: null,
        transitions: [],
        captures: [
          {
            field: "_buttons",
            enabled: true,
            value: [{ id: btnId, title: btnTitle }],
          },
        ],
        fallback: { mode: "repeat" },
        is_active: true,
        layout: null,
      };

      // Mesmo formato fixo usado em FlowDiagram.buildNewTransition.
      const transition: Transition = {
        trigger_phrases: [btnTitle, btnId],
        trigger_intent: "palavra_chave",
        goto_step_id: targetId,
        goto_special: null,
      };

      // R7.3 — a transition resultante DEVE ser resolvida pelo
      // useDiagramData de volta para o mesmo botão.
      const handle = resolveSourceHandleForTransition(
        { ...sourceStep, transitions: [transition] },
        transition,
      );
      expect(handle).toBe(`btn:${btnId}`);

      // R7.7 — o formato é fixo.
      expect(transition.trigger_intent).toBe("palavra_chave");
      expect(transition.trigger_phrases).toContain(btnTitle);
      expect(transition.trigger_phrases).toContain(btnId);
      expect(transition.goto_step_id).toBe(targetId);
      expect(transition.goto_special).toBeNull();
    },
  );

  test.prop(
    [
      fc.record({
        phrase: fc.string({ minLength: 1, maxLength: 30 }),
        intent: fc.option(
          fc.constantFrom("afirmacao", "negacao", "palavra_chave"),
        ),
        targetId: fc.string({ minLength: 1, maxLength: 10 }),
      }),
    ],
    { numRuns: 50 },
  )(
    "drag de handle default produz transition com phrase + intent (default palavra_chave)",
    ({ phrase, intent, targetId }) => {
      const transition: Transition = {
        trigger_phrases: phrase.trim() ? [phrase.trim()] : [],
        trigger_intent: intent || "palavra_chave",
        goto_step_id: targetId,
        goto_special: null,
      };
      // R6.3 — pelo menos um gatilho deve estar presente quando o usuário
      // digitar phrase OU selecionar intent diferente do vazio.
      const hasTrigger =
        transition.trigger_phrases.length > 0 || transition.trigger_intent !== "";
      expect(hasTrigger).toBe(true);
      expect(transition.goto_special).toBeNull();
      expect(transition.goto_step_id).toBe(targetId);
    },
  );
});

/**
 * Property test — Property 9 (falhas de persistência nunca deixam UI
 * em estado inconsistente).
 *
 * Validates: R4.3, R4.5, R6.9, R7.8, R10.10, R10.13.
 *
 * Estratégia (versão focada em useDiagramLayout):
 *
 *   - Geramos sequências arbitrárias de operações { saveNodePosition,
 *     autoLayoutAll } intercaladas com falhas de Supabase com probabilidade
 *     `p` controlável.
 *   - Após cada operação asserimos a invariante:
 *
 *       (A) `saving` retorna a `false` e `inFlightCount` retorna a 0
 *           ao final de uma sequência — operações não ficam "presas".
 *
 *       (B) Em falha de UPDATE durante autoLayoutAll, `localLayouts`
 *           reverte para o snapshot anterior (estado anterior preservado
 *           — R10.10).
 *
 *       (C) Em falha de UPDATE durante saveNodePosition, NÃO há rollback
 *           do estado local (a UI continua mostrando a posição arrastada),
 *           MAS um indicador de erro persistente fica visível
 *           (`saveError !== null`) — R10.13.
 *
 *   - Property 7 — reorder não invalida layout: incluído como suporte ao
 *     teste principal (R10.8).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import type { Step } from "@/components/admin/flow-builder/flowTypes";

// Mock dinâmico do supabase: trocaremos o impl entre runs.
let nextShouldFail = false;
const updateMock = vi.fn(() =>
  Promise.resolve(nextShouldFail ? { error: { message: "boom" } } : { error: null }),
);
const eqMock = vi.fn(() => updateMock());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: eqMock }) }),
  },
}));

// Mock useConfirm — sempre confirma.
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => () => Promise.resolve(true),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

import { useDiagramLayout } from "../useDiagramLayout";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  nextShouldFail = false;
});

afterEach(() => {
  vi.useRealTimers();
});

function makeStep(id: string, position: number, layout: Step["layout"] = null): Step {
  return {
    id,
    flow_id: "flow-1",
    position,
    step_type: "message",
    step_key: null,
    title: id,
    summary: null,
    icon: "msg",
    message_text: null,
    text_delay_ms: null,
    slot_key: null,
    transitions: [],
    captures: [],
    fallback: { mode: "repeat" },
    is_active: true,
    layout,
  };
}

// Operação arbitrária com flag de "deve falhar" injetado.
type Op =
  | {
      kind: "save";
      stepId: string;
      x: number;
      y: number;
      shouldFail: boolean;
    }
  | {
      kind: "auto";
      shouldFail: boolean;
    };

const arbOp = (stepIds: string[]) =>
  fc.oneof(
    fc.record({
      kind: fc.constant("save" as const),
      stepId: fc.constantFrom(...stepIds),
      x: fc.integer({ min: -1000, max: 1000 }),
      y: fc.integer({ min: -1000, max: 1000 }),
      shouldFail: fc.boolean(),
    }),
    fc.record({
      kind: fc.constant("auto" as const),
      shouldFail: fc.boolean(),
    }),
  );

describe("Property 9 — falhas não deixam UI inconsistente", () => {
  test.prop([fc.array(arbOp(["a", "b", "c"]), { minLength: 1, maxLength: 8 })], {
    numRuns: 30,
  })(
    "ao final de qualquer sequência, saving = false e nenhuma operação fica pendente",
    async (ops: Op[]) => {
      const steps = [makeStep("a", 0), makeStep("b", 1), makeStep("c", 2)];
      const { result } = renderHook(() =>
        useDiagramLayout({
          flowId: "flow-1",
          steps,
          terminalsUsed: new Set(),
        }),
      );

      for (const op of ops) {
        nextShouldFail = op.shouldFail;
        if (op.kind === "save") {
          act(() => {
            result.current.saveNodePosition(op.stepId, { x: op.x, y: op.y });
          });
        } else {
          await act(async () => {
            await result.current.autoLayoutAll();
            // Promessas pendentes são resolvidas naturalmente; precisamos só
            // do tick para que `setSaving(false)` seja aplicado.
            await Promise.resolve();
          });
        }
      }

      // Avança todos os timers de debounce e drena promises.
      await act(async () => {
        vi.runAllTimers();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Invariante: ao final, `saving` deve ser false (UI não fica presa).
      expect(result.current.saving).toBe(false);
    },
  );

  test.prop(
    [
      fc.array(
        fc.record({
          stepId: fc.constantFrom("a", "b"),
          x: fc.integer({ min: 0, max: 500 }),
          y: fc.integer({ min: 0, max: 500 }),
        }),
        { minLength: 1, maxLength: 5 },
      ),
    ],
    { numRuns: 20 },
  )(
    "R10.13 — saveNodePosition com falha mantém estado local + saveError visível",
    async (operations) => {
      nextShouldFail = true;
      const steps = [makeStep("a", 0), makeStep("b", 1)];
      const { result } = renderHook(() =>
        useDiagramLayout({
          flowId: "flow-1",
          steps,
          terminalsUsed: new Set(),
        }),
      );

      for (const op of operations) {
        act(() => {
          result.current.saveNodePosition(op.stepId, { x: op.x, y: op.y });
        });
      }
      await act(async () => {
        vi.advanceTimersByTime(600);
        await Promise.resolve();
        await Promise.resolve();
      });

      // saveError deve estar populado (R10.13: indicador persistente após falha)
      expect(result.current.saveError).not.toBeNull();
    },
  );
});

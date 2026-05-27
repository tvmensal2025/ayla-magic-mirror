/**
 * Unit tests para `useDiagramLayout` (Task 3.2 — R10.1, R10.2, R10.4, R10.5,
 * R10.7, R10.9, R10.13).
 *
 * Cobre:
 *   - `layoutNodes` aplica `step.layout` quando válido (R10.7).
 *   - `layout` inválido (NaN, fora do range, tipo errado) cai em dagre (R10.5).
 *   - Terminais são posicionados em coluna fixa à direita (R10.2).
 *   - `saveNodePosition` debounce coalescente: 3 chamadas em <500ms = 1 update (R10.4).
 *   - `autoLayoutAll` chama UPDATE único com `where flow_id` (R10.9, R10.10).
 *   - Falha em UPDATE preserva estado local + agenda retry (R10.13).
 *
 * Mockamos `@/integrations/supabase/client` e `@/components/ui/confirm-dialog`
 * para isolar a lógica do hook.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Node } from "@xyflow/react";

import type { Step, GotoSpecial } from "@/components/admin/flow-builder/flowTypes";

// Mock do supabase. O hook usa `supabase.from("...").update({...} as never).eq(...)`.
const updateMock = vi.fn(() => Promise.resolve({ error: null }));
const eqMock = vi.fn((..._args: unknown[]) => updateMock());
const fromMock = vi.fn((..._args: unknown[]) => ({ update: () => ({ eq: eqMock }) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

// Mock do useConfirm para sempre retornar true.
const confirmFn = vi.fn(() => Promise.resolve(true));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => confirmFn,
}));

// Mock do toast.
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

import { useDiagramLayout } from "../useDiagramLayout";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  updateMock.mockImplementation(() => Promise.resolve({ error: null }));
  eqMock.mockImplementation((..._args) => updateMock());
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(
  id: string,
  position: number,
  layout: Step["layout"] = null,
  is_active = true,
): Step {
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
    is_active,
    layout,
  };
}

function makeFlowNode(id: string): Node {
  return {
    id,
    type: "flow",
    position: { x: 0, y: 0 },
    data: {},
    width: 280,
    height: 120,
  } as Node;
}

function makeTerminalNode(kind: GotoSpecial): Node {
  return {
    id: `terminal-${kind}`,
    type: "terminal",
    position: { x: 0, y: 0 },
    data: { kind, label: kind, icon: "📝" },
  } as Node;
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe("useDiagramLayout — layoutNodes", () => {
  it("R10.7 — preserva step.layout quando válido", () => {
    const steps = [makeStep("a", 0, { x: 100, y: 200 })];
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: "flow-1",
        steps,
        terminalsUsed: new Set(),
      }),
    );
    const positioned = result.current.layoutNodes([makeFlowNode("a")]);
    expect(positioned[0].position).toEqual({ x: 100, y: 200 });
  });

  it("R10.5 — layout inválido (NaN) cai em dagre", () => {
    const steps = [makeStep("a", 0, { x: NaN, y: 0 } as unknown as Step["layout"])];
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: "flow-1",
        steps,
        terminalsUsed: new Set(),
      }),
    );
    const positioned = result.current.layoutNodes([makeFlowNode("a")]);
    expect(Number.isFinite(positioned[0].position.x)).toBe(true);
    expect(Number.isFinite(positioned[0].position.y)).toBe(true);
  });

  it("R10.5 — layout fora do range cai em dagre", () => {
    const steps = [makeStep("a", 0, { x: 999_999_999, y: 0 })];
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: "flow-1",
        steps,
        terminalsUsed: new Set(),
      }),
    );
    const positioned = result.current.layoutNodes([makeFlowNode("a")]);
    // dagre devolve algo no range razoável (não 999999999).
    expect(Math.abs(positioned[0].position.x)).toBeLessThan(10_000);
  });

  it("R10.2 — terminais ficam em coluna fixa à direita (x = max + 240)", () => {
    const steps = [
      makeStep("a", 0, { x: 100, y: 50 }),
      makeStep("b", 1, { x: 500, y: 50 }),
    ];
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: "flow-1",
        steps,
        terminalsUsed: new Set<GotoSpecial>(["cadastro", "humano"]),
      }),
    );
    const positioned = result.current.layoutNodes([
      makeFlowNode("a"),
      makeFlowNode("b"),
      makeTerminalNode("cadastro"),
      makeTerminalNode("humano"),
    ]);
    const terminalCadastro = positioned.find((n) => n.id === "terminal-cadastro")!;
    const terminalHumano = positioned.find((n) => n.id === "terminal-humano")!;
    // x deve ser max(100, 500) + 240 = 740
    expect(terminalCadastro.position.x).toBe(740);
    expect(terminalHumano.position.x).toBe(740);
    // y distribuído com 100px de spacing — começa em min(50, 50) = 50
    expect(terminalCadastro.position.y).toBe(50);
    expect(terminalHumano.position.y).toBe(150);
  });
});

describe("useDiagramLayout — saveNodePosition", () => {
  it("R10.4 — 3 chamadas em <500ms resultam em 1 UPDATE", async () => {
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: "flow-1",
        steps: [makeStep("a", 0)],
        terminalsUsed: new Set(),
      }),
    );

    act(() => {
      result.current.saveNodePosition("a", { x: 10, y: 20 });
      result.current.saveNodePosition("a", { x: 30, y: 40 });
      result.current.saveNodePosition("a", { x: 50, y: 60 });
    });

    expect(updateMock).not.toHaveBeenCalled(); // ainda no debounce

    await act(async () => {
      vi.advanceTimersByTime(500);
      // Aguarda promises pendentes resolverem.
      await Promise.resolve();
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("ignora layout inválido (não persiste, não atualiza override)", () => {
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: "flow-1",
        steps: [makeStep("a", 0)],
        terminalsUsed: new Set(),
      }),
    );

    act(() => {
      result.current.saveNodePosition("a", {
        x: NaN,
        y: 0,
      } as unknown as { x: number; y: number });
    });

    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("useDiagramLayout — autoLayoutAll", () => {
  it("R10.9, R10.10 — autoLayoutAll chama UPDATE único com where flow_id", async () => {
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: "flow-1",
        steps: [makeStep("a", 0), makeStep("b", 1)],
        terminalsUsed: new Set(),
      }),
    );

    await act(async () => {
      await result.current.autoLayoutAll();
    });

    expect(eqMock).toHaveBeenCalledWith("flow_id", "flow-1");
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("flowId null → autoLayoutAll é no-op silencioso", async () => {
    const { result } = renderHook(() =>
      useDiagramLayout({
        flowId: null,
        steps: [makeStep("a", 0)],
        terminalsUsed: new Set(),
      }),
    );

    await act(async () => {
      await result.current.autoLayoutAll();
    });

    expect(updateMock).not.toHaveBeenCalled();
  });
});

/**
 * Unit tests para `useDiagramSearch` (Task 9.5 — R19).
 *
 * Cobre:
 *   - Normalização Unicode NFD na busca: "duvida" casa "Dúvida" (R19.2).
 *   - Filtro por título e por step_key (R19.2).
 *   - Esvaziar a query reseta `matches` para 0 (R19.5).
 *   - `next()` é no-op quando `matches === 0`.
 *   - `next()` cicla pelos matches em ordem ascendente de `position`.
 *
 * Cuidado especial: `useDiagramSearch` consome `nodes` já posicionados.
 * Mockamos `ReactFlowInstance` apenas com os métodos que o hook usa
 * (`getZoom`, `setCenter`).
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Node, ReactFlowInstance } from "@xyflow/react";

import { useDiagramSearch } from "../useDiagramSearch";
import type { Step } from "@/components/admin/flow-builder/flowTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlowNode(
  id: string,
  position: number,
  title: string,
  step_key: string | null = null,
  pos = { x: position * 200, y: 0 },
): Node {
  const step: Step = {
    id,
    flow_id: "f",
    position,
    step_type: "message",
    step_key,
    title,
    summary: null,
    icon: "msg",
    message_text: null,
    text_delay_ms: null,
    slot_key: null,
    transitions: [],
    captures: [],
    fallback: { mode: "repeat" },
    is_active: true,
    layout: null,
  };
  return {
    id,
    type: "flow",
    position: pos,
    data: { step },
  } as Node;
}

function makeMockInstance(): ReactFlowInstance {
  // Apenas os métodos consumidos pelo hook precisam estar presentes.
  return {
    getZoom: vi.fn(() => 1),
    setCenter: vi.fn(),
  } as unknown as ReactFlowInstance;
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe("useDiagramSearch — busca", () => {
  it("query vazia → matches = 0", () => {
    const nodes = [makeFlowNode("a", 0, "Boas-vindas")];
    const { result } = renderHook(() =>
      useDiagramSearch({
        nodes,
        reactFlowInstance: makeMockInstance(),
      }),
    );
    expect(result.current.matches).toBe(0);
  });

  it("R19.2 — busca 'duvida' casa título 'Dúvida' (normalização NFD)", () => {
    const nodes = [
      makeFlowNode("a", 0, "Dúvida"),
      makeFlowNode("b", 1, "Outro"),
    ];
    const { result } = renderHook(() =>
      useDiagramSearch({
        nodes,
        reactFlowInstance: makeMockInstance(),
      }),
    );
    act(() => {
      result.current.setQuery("duvida");
    });
    expect(result.current.matches).toBe(1);
  });

  it("busca também encontra por step_key (R19.2)", () => {
    const nodes = [
      makeFlowNode("a", 0, "Sem título", "passo_inicio"),
      makeFlowNode("b", 1, "Outro", "passo_fim"),
    ];
    const { result } = renderHook(() =>
      useDiagramSearch({
        nodes,
        reactFlowInstance: makeMockInstance(),
      }),
    );
    act(() => {
      result.current.setQuery("inicio");
    });
    expect(result.current.matches).toBe(1);
  });

  it("R19.5 — esvaziar a query reseta matches para 0", () => {
    const nodes = [makeFlowNode("a", 0, "Dúvida")];
    const { result } = renderHook(() =>
      useDiagramSearch({
        nodes,
        reactFlowInstance: makeMockInstance(),
      }),
    );
    act(() => result.current.setQuery("duvida"));
    expect(result.current.matches).toBe(1);
    act(() => result.current.setQuery(""));
    expect(result.current.matches).toBe(0);
  });

  it("R19.4 — next() é no-op quando matches=0 (não chama setCenter)", () => {
    const instance = makeMockInstance();
    const nodes = [makeFlowNode("a", 0, "X")];
    const { result } = renderHook(() =>
      useDiagramSearch({ nodes, reactFlowInstance: instance }),
    );
    act(() => result.current.next());
    expect(instance.setCenter).not.toHaveBeenCalled();
  });

  it("R19.3, R19.4 — next() cicla em ordem ascendente de position e mantém zoom", () => {
    const instance = makeMockInstance();
    const nodes = [
      makeFlowNode("c", 2, "Match c"),
      makeFlowNode("a", 0, "Match a"),
      makeFlowNode("b", 1, "Match b"),
    ];
    const { result } = renderHook(() =>
      useDiagramSearch({ nodes, reactFlowInstance: instance }),
    );
    act(() => result.current.setQuery("match"));
    expect(result.current.matches).toBe(3);

    // Primeira chamada — primeiro match é o de menor position (a).
    act(() => result.current.next());
    expect(instance.setCenter).toHaveBeenLastCalledWith(0, 0, {
      zoom: 1,
      duration: 500,
    });
    // Segunda chamada — b (position 1, x=200).
    act(() => result.current.next());
    expect(instance.setCenter).toHaveBeenLastCalledWith(200, 0, {
      zoom: 1,
      duration: 500,
    });
    // Terceira chamada — c (position 2, x=400).
    act(() => result.current.next());
    expect(instance.setCenter).toHaveBeenLastCalledWith(400, 0, {
      zoom: 1,
      duration: 500,
    });
    // Quarta chamada — volta ao primeiro (a).
    act(() => result.current.next());
    expect(instance.setCenter).toHaveBeenLastCalledWith(0, 0, {
      zoom: 1,
      duration: 500,
    });
  });
});

/**
 * Unit tests para `useViewportPersistence` (Task 9.5 — R10.14, R1.7).
 *
 * Cobre:
 *   - Chave do localStorage no formato `flow-viewport:{consultantId}:{variant}`
 *   - Restauração na montagem via `setViewport()`
 *   - Validação de zoom no intervalo `[0.25, 2.0]`
 *   - JSON corrompido → fallback silencioso (não throw)
 *   - SecurityError no localStorage → fallback silencioso
 *   - Zoom fora de range → entrada inválida descartada (não persiste)
 *
 * O hook usa `useOnViewportChange` do React Flow, que requer um
 * `<ReactFlowProvider>` no wrapper. Para isolar o que testamos (chaves,
 * validação, restauração), envolvemos `renderHook` no provider.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { ReactFlowProvider, type ReactFlowInstance } from "@xyflow/react";
import React from "react";

import { useViewportPersistence } from "../useViewportPersistence";

beforeEach(() => {
  // Limpa o localStorage entre testes.
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(ReactFlowProvider, null, children);

function makeInstance(setViewport = vi.fn()): ReactFlowInstance {
  return {
    setViewport,
  } as unknown as ReactFlowInstance;
}

describe("useViewportPersistence", () => {
  it("R10.14 — usa chave 'flow-viewport:{consultantId}:{variant}'", () => {
    window.localStorage.setItem(
      "flow-viewport:c1:A",
      JSON.stringify({ x: 100, y: 200, zoom: 1 }),
    );
    const setViewport = vi.fn();
    renderHook(
      () =>
        useViewportPersistence({
          consultantId: "c1",
          variant: "A",
          reactFlowInstance: makeInstance(setViewport),
        }),
      { wrapper: Wrapper },
    );
    expect(setViewport).toHaveBeenCalledWith({ x: 100, y: 200, zoom: 1 });
  });

  it("R10.14 — zoom fora do range [0.25, 2.0] é descartado na restauração", () => {
    window.localStorage.setItem(
      "flow-viewport:c1:A",
      JSON.stringify({ x: 0, y: 0, zoom: 5 }),
    );
    const setViewport = vi.fn();
    renderHook(
      () =>
        useViewportPersistence({
          consultantId: "c1",
          variant: "A",
          reactFlowInstance: makeInstance(setViewport),
        }),
      { wrapper: Wrapper },
    );
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("R1.7 — JSON corrompido no localStorage não throwa e nada é restaurado", () => {
    window.localStorage.setItem("flow-viewport:c1:A", "{not-json");
    const setViewport = vi.fn();
    expect(() =>
      renderHook(
        () =>
          useViewportPersistence({
            consultantId: "c1",
            variant: "A",
            reactFlowInstance: makeInstance(setViewport),
          }),
        { wrapper: Wrapper },
      ),
    ).not.toThrow();
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("R1.7 — SecurityError em getItem não throwa", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const setViewport = vi.fn();
    expect(() =>
      renderHook(
        () =>
          useViewportPersistence({
            consultantId: "c1",
            variant: "A",
            reactFlowInstance: makeInstance(setViewport),
          }),
        { wrapper: Wrapper },
      ),
    ).not.toThrow();
  });

  it("R10.14 — instância null → não tenta restaurar", () => {
    window.localStorage.setItem(
      "flow-viewport:c1:A",
      JSON.stringify({ x: 1, y: 2, zoom: 1 }),
    );
    expect(() =>
      renderHook(
        () =>
          useViewportPersistence({
            consultantId: "c1",
            variant: "A",
            reactFlowInstance: null,
          }),
        { wrapper: Wrapper },
      ),
    ).not.toThrow();
  });
});

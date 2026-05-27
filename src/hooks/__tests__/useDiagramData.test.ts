/**
 * Unit tests para `useDiagramData`.
 *
 * Cobre as decisões de mapping puro `Step[] → { nodes, edges, terminalsUsed }`
 * exigidas pelas tarefas 2.2 e 2.3 da spec `flow-diagram-view`:
 *
 *   - Categorias de aresta (R3.1 a R3.5):
 *       solid (Trigger_Determinístico) vs ai-purple (Trigger_Semantico)
 *       dashed-amber (fallback goto) vs dotted-gray (Sequencia_Por_Posicao)
 *       error-red (destino inválido / inativo / goto_special legado)
 *   - Colapso de transitions duplicadas em uma única edge (R3.8)
 *   - Resolução de `sourceHandle = btn:<id>` (R7.3)
 *   - Normalização Unicode NFD na busca (R19.2)
 *   - `terminalsUsed` derivado de transitions (R3.2)
 *
 * Rodamos o hook com `renderHook` para que o `useMemo` interno seja exercido,
 * mas as asserções são sobre os arrays retornados (sem depender do DOM).
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDiagramData } from "../useDiagramData";
import type { FlowValidation } from "@/components/admin/flow-builder/useFlowValidation";
import type { Step, Transition } from "@/components/admin/flow-builder/flowTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_VALIDATION: FlowValidation = {
  warnings: [],
  byStep: {},
  errorCount: 0,
  warningCount: 0,
};

function makeStep(overrides: Partial<Step> & { id: string; position: number }): Step {
  return {
    flow_id: "flow-1",
    step_type: "message",
    step_key: null,
    title: "Step",
    summary: null,
    icon: "msg",
    message_text: "Mensagem",
    text_delay_ms: null,
    slot_key: null,
    transitions: [],
    captures: [],
    fallback: { mode: "repeat" },
    is_active: true,
    auto_detect_doc_type: false,
    layout: null,
    ...overrides,
  };
}

function makeTransition(over: Partial<Transition> = {}): Transition {
  return {
    trigger_intent: "",
    trigger_phrases: [],
    goto_step_id: null,
    goto_special: null,
    ...over,
  };
}

function callHook(args: Parameters<typeof useDiagramData>[0]) {
  return renderHook(() => useDiagramData(args)).result.current;
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe("useDiagramData — mapping puro", () => {
  it("gera 1 node por step e nenhum terminal quando não há goto_special", () => {
    const steps = [
      makeStep({ id: "a", position: 0 }),
      makeStep({ id: "b", position: 1 }),
    ];
    const result = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.terminalsUsed.size).toBe(0);
  });

  it("transition com goto_step_id válido gera Aresta_Solida", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        transitions: [
          makeTransition({
            trigger_intent: "palavra_chave",
            trigger_phrases: ["sim"],
            goto_step_id: "b",
          }),
        ],
      }),
      makeStep({ id: "b", position: 1 }),
    ];
    const result = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });

    const edge = result.edges.find((e) => e.source === "a" && e.target === "b");
    expect(edge).toBeDefined();
    expect(edge!.data!.category).toBe("solid");
  });

  it("trigger_intent não-determinístico gera Aresta_IA", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        transitions: [
          makeTransition({
            trigger_intent: "afirmacao",
            goto_step_id: "b",
          }),
        ],
      }),
      makeStep({ id: "b", position: 1 }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    expect(edges[0].data!.category).toBe("ai-purple");
  });

  it("goto_special válido (cadastro) gera terminal_used + edge para terminal-cadastro", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        transitions: [
          makeTransition({
            trigger_intent: "palavra_chave",
            goto_special: "cadastro",
          }),
        ],
      }),
    ];
    const { edges, terminalsUsed, nodes } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    expect(terminalsUsed.has("cadastro")).toBe(true);
    expect(nodes.find((n) => n.id === "terminal-cadastro")).toBeDefined();
    expect(edges[0].target).toBe("terminal-cadastro");
  });

  it("goto_special legado 'ai' gera Aresta_Erro", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        transitions: [
          makeTransition({
            trigger_intent: "palavra_chave",
            goto_special: "ai" as never,
          }),
        ],
      }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    expect(edges[0].data!.category).toBe("error-red");
  });

  it("transition para passo inativo gera Aresta_Erro", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        transitions: [
          makeTransition({
            trigger_intent: "palavra_chave",
            goto_step_id: "b",
          }),
        ],
      }),
      makeStep({ id: "b", position: 1, is_active: false }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    expect(edges[0].data!.category).toBe("error-red");
  });

  it("R3.8 — duas transitions com mesmo (source, target) colapsam em 1 edge", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        transitions: [
          makeTransition({
            trigger_intent: "palavra_chave",
            trigger_phrases: ["sim"],
            goto_step_id: "b",
          }),
          makeTransition({
            trigger_intent: "palavra_chave",
            trigger_phrases: ["s"],
            goto_step_id: "b",
          }),
        ],
      }),
      makeStep({ id: "b", position: 1 }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    const aToB = edges.filter((e) => e.source === "a" && e.target === "b");
    expect(aToB).toHaveLength(1);
    expect(aToB[0].data!.collapsedTriggers).toEqual(["sim", "s"]);
  });

  it("R7.3 — trigger_phrases casando título do botão resolve sourceHandle = btn:<id>", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        captures: [
          {
            field: "_buttons",
            enabled: true,
            value: [{ id: "btn-sim", title: "Sim" }],
          },
        ],
        transitions: [
          makeTransition({
            trigger_intent: "palavra_chave",
            trigger_phrases: ["sim"],
            goto_step_id: "b",
          }),
        ],
      }),
      makeStep({ id: "b", position: 1 }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    expect(edges[0].sourceHandle).toBe("btn:btn-sim");
  });

  it("R19.2 — busca com NFD casa título com acento", () => {
    const steps = [
      makeStep({ id: "a", position: 0, title: "Dúvida" }),
      makeStep({ id: "b", position: 1, title: "Outro" }),
    ];
    const { nodes } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "duvida",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    const flowNodes = nodes.filter((n) => n.type === "flow");
    const a = flowNodes.find((n) => n.id === "a")!;
    const b = flowNodes.find((n) => n.id === "b")!;
    expect((a.data as { searchState: string }).searchState).toBe("match");
    expect((b.data as { searchState: string }).searchState).toBe("dim");
  });

  it("R3.4 — Sequencia_Por_Posicao: passo sem transitions e dottedEdgesVisible=true gera dotted-gray", () => {
    const steps = [
      makeStep({ id: "a", position: 0 }),
      makeStep({ id: "b", position: 1 }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: true,
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].data!.category).toBe("dotted-gray");
  });

  it("R3.6 — dottedEdgesVisible=false omite arestas de Sequencia_Por_Posicao", () => {
    const steps = [
      makeStep({ id: "a", position: 0 }),
      makeStep({ id: "b", position: 1 }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    expect(edges).toHaveLength(0);
  });

  it("R8.4 — fallback ai_limit em passo sem transitions gera auto-loop ai-purple", () => {
    const steps = [
      makeStep({
        id: "a",
        position: 0,
        fallback: { mode: "ai_limit", max_questions: 3, then: "humano" },
      }),
    ];
    const { edges } = callHook({
      steps,
      validation: EMPTY_VALIDATION,
      mediaCounts: {},
      metricsData: null,
      searchQuery: "",
      selectedId: null,
      dottedEdgesVisible: false,
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("a");
    expect(edges[0].target).toBe("a");
    expect(edges[0].data!.category).toBe("ai-purple");
  });
});

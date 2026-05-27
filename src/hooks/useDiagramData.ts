/**
 * Hook puro de mapeamento `Step[]` → `{ nodes, edges }` para o Modo_Diagrama.
 *
 * Responsabilidade única: dado o array de passos da Variante atual e
 * dependências de UI (busca, seleção, métricas, validação), retorna nodes e
 * edges já normalizados para o `<ReactFlow>` consumir.
 *
 * **Importante**: o hook é 100% puro e memoizado. Não toca em Supabase, não
 * chama `useState`, não dispara efeitos. Todas as decisões de mapping são
 * derivadas exclusivamente dos argumentos.
 *
 * Cobre os requisitos R2.1, R2.2, R2.4, R2.5, R3.1 a R3.5, R3.7, R3.8, R3.9,
 * R7.3, R8.4, R19.2 conforme detalhado em `.kiro/specs/flow-diagram-view`.
 */

import { useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";

import {
  type FlowValidation,
  type FlowWarning,
} from "@/components/admin/flow-builder/useFlowValidation";
import {
  type GotoSpecial,
  type Step,
  type Transition,
  VALID_GOTO_SPECIAL,
  getButtons,
  isAiAnswerStep,
  isDeterministicIntent,
  isOcrStep,
} from "@/components/admin/flow-builder/flowTypes";

// ---------------------------------------------------------------------------
// Tipos públicos exportados pelo hook
// ---------------------------------------------------------------------------

/** Tipos de destino especial reconhecidos como Nó_Terminal. */
export type TerminalKind = GotoSpecial;

/** Categoria visual da aresta (5 variantes definidas no design). */
export type EdgeCategory =
  | "solid"
  | "dashed-amber"
  | "dotted-gray"
  | "ai-purple"
  | "error-red";

/** Estado de busca aplicado a um nó. */
export type NodeSearchState = "match" | "dim" | null;

/** Linha de métricas vinda da view `v_flow_step_funnel`. */
export type FunnelRow = {
  step_key: string;
  abandonment_rate_pct: number | null;
  avg_duration_ms: number | null;
  avg_confidence: number | null;
};

/** `data` do nó padrão (`type: "flow"`). */
export type FlowDiagramNodeData = {
  step: Step;
  selected: boolean;
  mediaCount?: { audio: number; image: number; video: number };
  warnings: FlowWarning[];
  isAiAnswer: boolean;
  ocrKind: "conta" | "documento" | null;
  metrics?: {
    abandonmentPct?: number;
    avgConfidence?: number;
    avgDurationS?: number;
  };
  /** Estado de busca: "match" realça, "dim" atenua, null neutro (R19.2). */
  searchState: NodeSearchState;
  /**
   * Opacidade efetiva já calculada combinando faixa "inativa" (R2.4) com
   * atenuação por seleção (R3.7) — escolhe-se a menor (R2.5).
   */
  opacity: number;
};

/** `data` do nó terminal sintético. */
export type TerminalNodeData = {
  kind: TerminalKind;
  label: string;
  icon: string;
};

/** `data` da aresta unificada (5 categorias). */
export type FlowDiagramEdgeData = {
  category: EdgeCategory;
  /** Rótulo truncado em até 40 chars com reticências. */
  label: string;
  /** Texto completo (tooltip). */
  fullLabel: string;
  /** Quando true, a aresta deve ser atenuada para 30% (R3.7). */
  dimmed: boolean;
  /** Lista completa de triggers quando colapso por (source,target) ocorreu (R3.8). */
  collapsedTriggers?: string[];
};

export type FlowDiagramNode = Node<FlowDiagramNodeData, "flow">;
export type TerminalDiagramNode = Node<TerminalNodeData, "terminal">;
export type DiagramNode = FlowDiagramNode | TerminalDiagramNode;
export type DiagramEdge = Edge<FlowDiagramEdgeData>;

export type UseDiagramDataArgs = {
  steps: Step[];
  validation: FlowValidation;
  mediaCounts: Record<
    string,
    { audio: number; image: number; video: number }
  >;
  metricsData: Map<string, FunnelRow> | null;
  searchQuery: string;
  selectedId: string | null;
  /** Quando false, omite as Arestas_Pontilhadas de Sequencia_Por_Posicao (R3.6). */
  dottedEdgesVisible: boolean;
};

export type UseDiagramDataResult = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  terminalsUsed: Set<TerminalKind>;
};

// ---------------------------------------------------------------------------
// Constantes internas
// ---------------------------------------------------------------------------

const LABEL_MAX_LEN = 40;
const TRANSITION_LABEL_FALLBACK = "transition";

const TERMINAL_META: Record<TerminalKind, { label: string; icon: string }> = {
  cadastro: { label: "Cadastro", icon: "📝" },
  humano: { label: "Humano", icon: "👤" },
  repeat: { label: "Repetir", icon: "🔁" },
};

// Faixa "inativa" (R2.4): opacidade entre 40% e 60%. Escolhemos 50% (centro).
const INACTIVE_OPACITY = 0.5;
// Atenuação por seleção (R3.7): "demais Arestas e Nós para no máximo 30%".
// Aplicamos exatamente 30% — esse é o teto explícito da spec. O nó perde
// legibilidade, o que é intencional: é assim que o Consultor identifica
// imediatamente que o nó NÃO está conectado ao selecionado. Para "trazer
// de volta", basta clicar fora ou em outro nó (R5.1 limpa selectedId).
const SELECTED_DIM_OPACITY = 0.3;

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/** Trunca um texto preservando o início, com reticências unicode "…". */
function truncate(text: string, max = LABEL_MAX_LEN): string {
  if (!text) return "";
  if (text.length <= max) return text;
  // Se max <= 1, somente reticências.
  if (max <= 1) return "…";
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Normalização Unicode NFD removendo acentos e convertendo para minúsculas.
 * Usado para busca case-insensitive (R19.2).
 */
function normalizeForSearch(text: string | null | undefined): string {
  if (!text) return "";
  // Remove diacríticos via NFD e exclui combining marks.
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Extrai o rótulo principal de uma transition (R3.1). */
function pickTransitionLabel(t: Transition): string {
  const firstPhrase = t.trigger_phrases.find((p) => p && p.trim() !== "");
  if (firstPhrase) return firstPhrase;
  const intent = (t.trigger_intent ?? "").trim();
  if (intent) return intent;
  return TRANSITION_LABEL_FALLBACK;
}

/**
 * Decide a categoria visual de uma transition (sem considerar destino quebrado
 * — esse caso é resolvido depois e sobrescreve a categoria para `error-red`).
 */
function transitionCategory(t: Transition): EdgeCategory {
  return isDeterministicIntent(t.trigger_intent) ? "solid" : "ai-purple";
}

/**
 * Resolve qual handle do nó de origem deve ser usado para uma transition.
 *
 * Quando a transition casa com algum `Botao_Interativo` do passo, retorna
 * `btn:<button.id>`. Caso contrário, retorna `default`. (R7.3)
 *
 * - Comparação por `title`: case-insensitive.
 * - Comparação por `id`: exata.
 */
export function resolveSourceHandleForTransition(
  step: Step,
  transition: Transition,
): string {
  const buttons = getButtons(step);
  if (buttons.length === 0) return "default";

  const phrasesLower = transition.trigger_phrases.map((p) =>
    String(p ?? "").toLowerCase(),
  );
  const phrasesRaw = transition.trigger_phrases.map((p) => String(p ?? ""));
  const intentRaw = String(transition.trigger_intent ?? "");
  const intentLower = intentRaw.toLowerCase();

  for (const btn of buttons) {
    const titleLower = String(btn.title ?? "").toLowerCase();
    const idRaw = String(btn.id ?? "");

    // Title casa case-insensitive em phrases ou intent.
    const titleMatchesPhrases =
      titleLower !== "" && phrasesLower.includes(titleLower);
    const titleMatchesIntent =
      titleLower !== "" && intentLower === titleLower;

    // Id casa exato em phrases ou intent.
    const idMatchesPhrases =
      idRaw !== "" && phrasesRaw.includes(idRaw);
    const idMatchesIntent = idRaw !== "" && intentRaw === idRaw;

    if (
      titleMatchesPhrases ||
      titleMatchesIntent ||
      idMatchesPhrases ||
      idMatchesIntent
    ) {
      return `btn:${idRaw}`;
    }
  }
  return "default";
}

/** Verifica se um valor de `goto_special` está no conjunto reconhecido pelo runtime. */
function isValidGotoSpecial(value: unknown): value is TerminalKind {
  return (
    typeof value === "string" &&
    (VALID_GOTO_SPECIAL as readonly string[]).includes(value)
  );
}

/** Calcula a opacidade efetiva do nó conforme R2.4, R2.5 e R3.7. */
function computeNodeOpacity(args: {
  isActive: boolean;
  hasSelection: boolean;
  isSelected: boolean;
  isAdjacentToSelection: boolean;
}): number {
  const { isActive, hasSelection, isSelected, isAdjacentToSelection } = args;
  // Sem seleção, só importa a faixa "inativa".
  if (!hasSelection) {
    return isActive ? 1 : INACTIVE_OPACITY;
  }
  // O nó selecionado e seus vizinhos diretos ficam em 100% (ainda que
  // inativos? — R3.7 diz "demais Arestas e Nós para no máximo 30%". Para o
  // próprio selecionado mantemos a opacidade base do passo: ativos em 1,
  // inativos na faixa "inativa" — R2.5: a regra de menor opacidade só se
  // aplica quando o nó está sendo atenuado pela seleção).
  if (isSelected || isAdjacentToSelection) {
    return isActive ? 1 : INACTIVE_OPACITY;
  }
  // Nó atenuado pela seleção: aplica a menor opacidade entre faixa "inativa"
  // (R2.4) e atenuação por seleção (R3.7), conforme R2.5.
  if (!isActive) {
    return Math.min(SELECTED_DIM_OPACITY, INACTIVE_OPACITY);
  }
  return SELECTED_DIM_OPACITY;
}

// ---------------------------------------------------------------------------
// Estrutura intermediária para acumular edges antes do colapso
// ---------------------------------------------------------------------------

type RawEdgeOrigin =
  | "transition"
  | "fallback"
  | "sequence"
  | "ai-self-loop"
  | "invalid-special";

type RawEdge = {
  /**
   * Chave usada para colapsar transitions que partem do mesmo passo para o
   * mesmo destino (R3.8 — design diz "mesmo (source, target)"). Edges de
   * outras origens (fallback, sequence, ai-self-loop) usam keys exclusivas
   * com sufixo de origem para nunca colapsarem com transitions.
   */
  key: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  /** Índice da transition no array original — usado para precedência em colapso. */
  transitionIdx: number;
  /** Origem desta edge — controla precedência de tipo. */
  origin: RawEdgeOrigin;
  category: EdgeCategory;
  label: string;
  fullLabel: string;
  /** Edge id estável conforme design: `${stepId}-${targetId}-${transitionIdx}`. */
  id: string;
};

/**
 * Decide se uma transition tem destino "resolvido" (válido, leva a passo ativo
 * ou a um terminal reconhecido). Mantido como helper exportado para testes.
 */
export function transitionHasResolvedDestination(
  t: Transition,
  stepIdToActiveMap: Map<string, boolean>,
): boolean {
  if (isValidGotoSpecial(t.goto_special)) return true;
  if (t.goto_special && !isValidGotoSpecial(t.goto_special)) return false;
  if (t.goto_step_id) {
    const isActive = stepIdToActiveMap.get(t.goto_step_id);
    return isActive === true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

export function useDiagramData(
  args: UseDiagramDataArgs,
): UseDiagramDataResult {
  const {
    steps,
    validation,
    mediaCounts,
    metricsData,
    searchQuery,
    selectedId,
    dottedEdgesVisible,
  } = args;

  return useMemo(() => {
    // ---------------------------------------------------------------------
    // 1) Indexação básica
    // ---------------------------------------------------------------------
    const stepById = new Map<string, Step>();
    for (const s of steps) {
      stepById.set(s.id, s);
    }

    // Próximo passo ativo por ordem de `position` (Sequencia_Por_Posicao).
    // Critério: passos ordenados por position; o "próximo" de um passo é o
    // primeiro com position > step.position e is_active = true.
    const sortedByPosition = [...steps].sort(
      (a, b) => a.position - b.position,
    );
    const nextActiveByStepId = new Map<string, Step | null>();
    for (let i = 0; i < sortedByPosition.length; i++) {
      const s = sortedByPosition[i];
      let next: Step | null = null;
      for (let j = i + 1; j < sortedByPosition.length; j++) {
        if (sortedByPosition[j].is_active) {
          next = sortedByPosition[j];
          break;
        }
      }
      nextActiveByStepId.set(s.id, next);
    }

    // ---------------------------------------------------------------------
    // 2) Detectar terminais usados (R3.2)
    // ---------------------------------------------------------------------
    const terminalsUsed = new Set<TerminalKind>();
    for (const s of steps) {
      for (const t of s.transitions) {
        if (isValidGotoSpecial(t.goto_special)) {
          terminalsUsed.add(t.goto_special);
        }
      }
    }

    // ---------------------------------------------------------------------
    // 3) Construção de edges (acumuladas em RawEdge[])
    // ---------------------------------------------------------------------
    const rawEdges: RawEdge[] = [];

    const normalizedQuery = normalizeForSearch(searchQuery);
    const hasSearch = normalizedQuery.length > 0;

    // Helper: registra raw edge.
    const pushEdge = (e: RawEdge) => {
      rawEdges.push(e);
    };

    for (const step of steps) {
      // -------------------------------------------------------------
      // 3a) Transitions explícitas
      // -------------------------------------------------------------
      let stepResolvedAny = false;

      step.transitions.forEach((t, idx) => {
        const sourceHandle = resolveSourceHandleForTransition(step, t);
        const baseLabel = pickTransitionLabel(t);
        const baseCategory = transitionCategory(t);

        // 3a.i) goto_special inválido (R3.2 — caso "ai" legado ou outro fora do conjunto)
        if (t.goto_special && !isValidGotoSpecial(t.goto_special)) {
          const fullLabel = `goto_special inválido: ${t.goto_special}`;
          const targetId = `__warning_${step.id}_${idx}`;
          pushEdge({
            id: `${step.id}-${targetId}-${idx}`,
            source: step.id,
            target: targetId,
            sourceHandle,
            transitionIdx: idx,
            origin: "invalid-special",
            category: "error-red",
            label: truncate(fullLabel),
            fullLabel,
            // targetId já é único (inclui idx) — não colapsa.
            key: `${step.id}|${targetId}`,
          });
          return;
        }

        // 3a.ii) goto_special válido → terminal node
        if (isValidGotoSpecial(t.goto_special)) {
          const targetId = `terminal-${t.goto_special}`;
          pushEdge({
            id: `${step.id}-${targetId}-${idx}`,
            source: step.id,
            target: targetId,
            sourceHandle,
            transitionIdx: idx,
            origin: "transition",
            category: baseCategory,
            label: truncate(baseLabel),
            fullLabel: baseLabel,
            // R3.8: colapsa por (source, target). Múltiplas transitions com mesmo
            // goto_special compartilham o mesmo terminal — devem colapsar em 1.
            key: `${step.id}|${targetId}`,
          });
          stepResolvedAny = true;
          return;
        }

        // 3a.iii) goto_step_id presente
        if (t.goto_step_id) {
          const target = stepById.get(t.goto_step_id);
          if (!target) {
            // R3.5 — destino removido. Aresta_Erro com nó-warning sintético.
            const stepWarnings = validation.byStep[step.id] ?? [];
            const matched = stepWarnings.find(
              (w) =>
                w.kind === "transition_dest_missing" &&
                w.id.endsWith(`:${idx}`),
            );
            const warnMsg = matched?.message ?? "Destino removido";
            const targetId = `__warning_${step.id}_${idx}`;
            pushEdge({
              id: `${step.id}-${targetId}-${idx}`,
              source: step.id,
              target: targetId,
              sourceHandle,
              transitionIdx: idx,
              origin: "transition",
              category: "error-red",
              label: truncate(warnMsg, 80),
              fullLabel: warnMsg,
              // targetId já é único (inclui idx).
              key: `${step.id}|${targetId}`,
            });
            return;
          }

          if (!target.is_active) {
            // R3.5 — destino inativo.
            const stepWarnings = validation.byStep[step.id] ?? [];
            const matched = stepWarnings.find(
              (w) =>
                w.kind === "transition_dest_inactive" &&
                w.id.endsWith(`:${idx}`),
            );
            const warnMsg =
              matched?.message ?? `Destino "${target.title}" inativo`;
            const targetId = `__warning_${step.id}_${idx}`;
            pushEdge({
              id: `${step.id}-${targetId}-${idx}`,
              source: step.id,
              target: targetId,
              sourceHandle,
              transitionIdx: idx,
              origin: "transition",
              category: "error-red",
              label: truncate(warnMsg, 80),
              fullLabel: warnMsg,
              key: `${step.id}|${targetId}`,
            });
            return;
          }

          // Destino válido — aresta normal.
          pushEdge({
            id: `${step.id}-${target.id}-${idx}`,
            source: step.id,
            target: target.id,
            sourceHandle,
            transitionIdx: idx,
            origin: "transition",
            category: baseCategory,
            label: truncate(baseLabel),
            fullLabel: baseLabel,
            // R3.8: colapsa por (source, target).
            key: `${step.id}|${target.id}`,
          });
          stepResolvedAny = true;
          return;
        }

        // 3a.iv) Transition sem destino — não renderiza aresta nova
        // (`useFlowValidation` já reporta como warning; o nó exibe o ⚠ via R3.9).
      });

      // -------------------------------------------------------------
      // 3b) Fallback (R3.3 e R8.4 ai_answer/ai_limit)
      // -------------------------------------------------------------
      const fb = step.fallback;
      let fallbackResolved = false;
      if (fb) {
        if (fb.mode === "goto" && fb.goto_step_id) {
          const target = stepById.get(fb.goto_step_id);
          if (target && target.is_active) {
            pushEdge({
              id: `${step.id}-${target.id}-fallback`,
              source: step.id,
              target: target.id,
              sourceHandle: "default",
              transitionIdx: -1,
              origin: "fallback",
              category: "dashed-amber",
              label: "fallback",
              fullLabel: "fallback",
              key: `${step.id}|default|${target.id}|fallback`,
            });
            fallbackResolved = true;
          } else {
            // Destino removido ou inativo — Aresta_Erro (R3.5).
            const stepWarnings = validation.byStep[step.id] ?? [];
            const matched = stepWarnings.find(
              (w) =>
                w.kind === "transition_dest_missing" ||
                w.kind === "transition_dest_inactive",
            );
            const warnMsg =
              matched?.message ?? "Fallback aponta para passo inválido";
            const targetId = `__warning_${step.id}_fallback`;
            pushEdge({
              id: `${step.id}-${targetId}-fallback`,
              source: step.id,
              target: targetId,
              sourceHandle: "default",
              transitionIdx: -1,
              origin: "fallback",
              category: "error-red",
              label: truncate(warnMsg, 80),
              fullLabel: warnMsg,
              key: `${step.id}|default|${targetId}|fallback`,
            });
          }
        } else if (
          fb.mode === "ai" ||
          (fb as { mode?: string }).mode === "ai_answer" ||
          fb.mode === "ai_limit"
        ) {
          // R8.4 — fallback IA renderizado como Aresta_IA em auto-loop.
          pushEdge({
            id: `${step.id}-${step.id}-ai-fallback`,
            source: step.id,
            target: step.id,
            sourceHandle: "default",
            transitionIdx: -1,
            origin: "ai-self-loop",
            category: "ai-purple",
            label: "ia",
            fullLabel: "fallback IA",
            key: `${step.id}|default|${step.id}|ai-fallback`,
          });
        }
        // mode === "repeat" não gera aresta.
      }

      // -------------------------------------------------------------
      // 3c) Sequencia_Por_Posicao (R3.4)
      // -------------------------------------------------------------
      // Renderiza somente quando o passo não tem nenhuma transition resolvida
      // E não tem fallback `goto` resolvido.
      if (!stepResolvedAny && !fallbackResolved) {
        const next = nextActiveByStepId.get(step.id) ?? null;
        if (next && dottedEdgesVisible) {
          pushEdge({
            id: `${step.id}-${next.id}-sequence`,
            source: step.id,
            target: next.id,
            sourceHandle: "default",
            transitionIdx: -1,
            origin: "sequence",
            category: "dotted-gray",
            label: "sequência",
            fullLabel: "sequência",
            key: `${step.id}|default|${next.id}|sequence`,
          });
        }
      }
    }

    // ---------------------------------------------------------------------
    // 4) Colapso de transitions com mesmo (source, sourceHandle, target) (R3.8)
    // ---------------------------------------------------------------------
    // Agrupamos por `key`. Quando há mais de uma transition com mesmo key,
    // mantemos a de menor `transitionIdx`. Edges de fallback/sequence/ai-self
    // têm transitionIdx negativo e não colapsam com transitions reais.
    const grouped = new Map<string, RawEdge[]>();
    for (const e of rawEdges) {
      const arr = grouped.get(e.key);
      if (arr) arr.push(e);
      else grouped.set(e.key, [e]);
    }

    const finalEdges: DiagramEdge[] = [];
    const hasSelection = !!selectedId;

    // Nodes adjacentes ao selecionado (R3.7) — conjunto computado em paralelo
    // ao processamento de edges para usarmos depois na opacidade dos nós.
    const adjacentToSelection = new Set<string>();

    for (const group of grouped.values()) {
      // Para colapso, ordenamos por transitionIdx (asc) — o de menor índice
      // ganha a categoria/label. Edges não-transition (idx=-1) são tratadas
      // como elementos isolados e não colapsam entre si exceto se a key for
      // idêntica (o que indicamos na key com sufixo de origem).
      const sorted = [...group].sort(
        (a, b) => a.transitionIdx - b.transitionIdx,
      );
      const winner = sorted[0];

      const collapsedTriggers =
        sorted.length > 1
          ? sorted.map((e) => e.fullLabel)
          : undefined;

      let label = winner.label;
      let fullLabel = winner.fullLabel;
      if (collapsedTriggers && collapsedTriggers.length > 1) {
        const joined = collapsedTriggers.join(", ");
        label = truncate(joined);
        fullLabel = joined;
      }

      // Detecta adjacência para R3.7 (nó selecionado).
      const touchesSelection =
        hasSelection &&
        (winner.source === selectedId || winner.target === selectedId);
      if (touchesSelection) {
        adjacentToSelection.add(winner.source);
        adjacentToSelection.add(winner.target);
      }

      const dimmed = hasSelection && !touchesSelection;

      finalEdges.push({
        id: winner.id,
        source: winner.source,
        target: winner.target,
        sourceHandle: winner.sourceHandle,
        type: "default",
        data: {
          category: winner.category,
          label,
          fullLabel,
          dimmed,
          collapsedTriggers,
        },
      });
    }

    // ---------------------------------------------------------------------
    // 5) Construção de nodes
    // ---------------------------------------------------------------------
    const flowNodes: DiagramNode[] = steps.map((step) => {
      const warnings = validation.byStep[step.id] ?? [];
      const isAiAnswer = isAiAnswerStep(step);
      const ocrKind = isOcrStep(step);
      const mediaCount = mediaCounts[step.id];
      const metricsRow = metricsData?.get(step.step_key ?? "") ?? null;
      const metrics = metricsRow
        ? {
            abandonmentPct: metricsRow.abandonment_rate_pct ?? undefined,
            avgConfidence: metricsRow.avg_confidence ?? undefined,
            avgDurationS:
              metricsRow.avg_duration_ms != null
                ? metricsRow.avg_duration_ms / 1000
                : undefined,
          }
        : undefined;

      // Estado de busca: match se `title` ou `step_key` contém a query (R19.2).
      let searchState: NodeSearchState = null;
      if (hasSearch) {
        const titleNorm = normalizeForSearch(step.title);
        const keyNorm = normalizeForSearch(step.step_key);
        const matches =
          titleNorm.includes(normalizedQuery) ||
          keyNorm.includes(normalizedQuery);
        searchState = matches ? "match" : "dim";
      }

      const isSelected = selectedId === step.id;
      const isAdjacent = adjacentToSelection.has(step.id);
      const opacity = computeNodeOpacity({
        isActive: !!step.is_active,
        hasSelection,
        isSelected,
        isAdjacentToSelection: isAdjacent,
      });

      // Pré-cálculo do preview de message_text é responsabilidade do
      // componente de nó (`FlowDiagramNode`), via `renderVarsPreview`. Aqui
      // apenas expomos o `step` cru.

      const data: FlowDiagramNodeData = {
        step,
        selected: isSelected,
        mediaCount,
        warnings,
        isAiAnswer,
        ocrKind,
        metrics,
        searchState,
        opacity,
      };

      const node: FlowDiagramNode = {
        id: step.id,
        type: "flow",
        position: { x: 0, y: 0 }, // posicionamento real é responsabilidade de useDiagramLayout.
        data,
      };
      return node;
    });

    // Terminais sintéticos (apenas os usados — R3.2).
    const terminalNodes: DiagramNode[] = [];
    for (const kind of VALID_GOTO_SPECIAL) {
      if (!terminalsUsed.has(kind)) continue;
      const meta = TERMINAL_META[kind];
      const id = `terminal-${kind}`;
      terminalNodes.push({
        id,
        type: "terminal",
        position: { x: 0, y: 0 },
        data: {
          kind,
          label: meta.label,
          icon: meta.icon,
        },
      });
    }

    return {
      nodes: [...flowNodes, ...terminalNodes],
      edges: finalEdges,
      terminalsUsed,
    };
  }, [
    steps,
    validation,
    mediaCounts,
    metricsData,
    searchQuery,
    selectedId,
    dottedEdgesVisible,
  ]);
}

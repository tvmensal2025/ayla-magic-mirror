// useDiagramSearch — hook de busca por título / `step_key` no Modo_Diagrama.
//
// Responsabilidades (Requisito 19 do spec `flow-diagram-view`):
//   • Manter o estado controlado da query (`query` + `setQuery`).
//   • Calcular os Nós_Diagrama que casam com a busca, ordenados por
//     `data.step.position` ascendente (R19.3, R19.4).
//   • Expor um `inputRef` para o `DiagramToolbar` plugar no `<input>` do
//     campo de busca.
//   • Registrar listener global `Ctrl+K` / `Cmd+K` que foca o input
//     (R19.1).
//   • Limpar a busca ao pressionar `Esc` com o input focado, restaurando a
//     opacidade dos nós (R19.5). O esvaziamento via `setQuery("")` também é
//     suficiente para restaurar — a opacidade real é calculada por
//     `useDiagramData` em função de `searchQuery`.
//   • Em `next()`, centralizar a viewport no próximo match em ordem de
//     `position` ciclicamente, sem alterar o zoom (R19.3, R19.4).
//   • Manter `matches` como número de nós casados — o consumidor (toolbar)
//     usa esse número para exibir "Nenhum passo encontrado" quando 0
//     (R19.6).
//
// O hook é puro do ponto de vista de dados: não lê Supabase, não escreve em
// `localStorage`, não consome React Flow além de `setCenter`/`getZoom` para
// a navegação. Toda a lógica de realce visual é feita no `useDiagramData`
// (já implementado): aqui só centralizamos a viewport.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node, ReactFlowInstance } from "@xyflow/react";

import type { Step } from "@/components/admin/flow-builder/flowTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalização Unicode NFD removendo acentos e convertendo para minúsculas.
 *
 * Mantém paridade exata com a função homônima de `useDiagramData` (R19.2):
 * a busca "duvida" casa um passo cujo título é "Dúvida" — ambas as fontes
 * de verdade precisam normalizar do mesmo jeito para que a borda colorida
 * (computada em `useDiagramData`) coincida com o set de matches usado por
 * `next()` aqui.
 */
function normalizeForSearch(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Type guard que estreita um `Node` qualquer para o nó `flow` (passo real).
 *
 * O canvas mistura nós `flow` (registros de `bot_flow_steps`) e `terminal`
 * (sintéticos: 📝 Cadastro / 👤 Humano / 🔁 Repetir). A busca só faz
 * sentido sobre nós `flow`, pois apenas eles têm `data.step` com `title`,
 * `step_key` e `position`.
 */
type FlowSearchNode = Node<{ step: Step }>;

function isFlowNode(node: Node): node is FlowSearchNode {
  if (node.type !== "flow") return false;
  const data = node.data as { step?: Step } | undefined;
  return !!data && !!data.step;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export interface UseDiagramSearchArgs {
  /**
   * Nós já posicionados (após `useDiagramLayout.layoutNodes`). Esperamos que
   * `node.position.{x,y}` esteja preenchido para que `setCenter` funcione.
   */
  nodes: Node[];
  /**
   * Instância do React Flow (via `useReactFlow()`). Pode ser `null` durante
   * a montagem do `<ReactFlowProvider>`; nesse caso, `next()` é no-op.
   */
  reactFlowInstance: ReactFlowInstance | null;
  /**
   * Callback opcional disparado sincronamente sempre que a query muda
   * (digitação, Esc, etc.). Permite ao consumidor manter um state externo
   * em sincronia sem o atraso de 1 frame de um `useEffect` reativo.
   */
  onQueryChange?: (q: string) => void;
}

export interface UseDiagramSearchResult {
  /** Query atual (controlada). */
  query: string;
  /** Atualiza a query e reinicia o cursor de ciclagem. */
  setQuery: (q: string) => void;
  /**
   * Avança para o próximo match em ordem de `position` ascendente.
   * Retorna ao primeiro após o último (R19.4).
   * No-op quando `matches === 0` ou `reactFlowInstance === null`.
   */
  next: () => void;
  /** Quantidade de nós que casam com a query atual (R19.6). */
  matches: number;
  /** Ref a ser plugado no `<input>` do campo de busca (R19.1). */
  inputRef: React.RefObject<HTMLInputElement>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDiagramSearch({
  nodes,
  reactFlowInstance,
  onQueryChange,
}: UseDiagramSearchArgs): UseDiagramSearchResult {
  const [query, setQueryState] = useState<string>("");
  // Cursor da ciclagem: índice do *próximo* match a centralizar. Após cada
  // `next()` avança 1, com módulo aplicado em tempo de uso para tolerar
  // mudanças no tamanho da lista entre chamadas.
  const [cursor, setCursor] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mantém o callback estável dentro de closures sem recriá-las.
  const onQueryChangeRef = useRef(onQueryChange);
  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);

  /**
   * Atualiza a query e zera o cursor. Zerar é importante para que o primeiro
   * `Enter` após digitar centralize no primeiro match em ordem de
   * `position`, e não num índice "vazado" da busca anterior.
   */
  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setCursor(0);
    onQueryChangeRef.current?.(q);
  }, []);

  /**
   * Lista de nós `flow` que casam com a query, ordenada por
   * `data.step.position` ascendente. Memoizada para evitar recomputação
   * desnecessária quando o consumidor re-renderiza por outro motivo.
   */
  const matchedNodes = useMemo<FlowSearchNode[]>(() => {
    const normalizedQuery = normalizeForSearch(query);
    if (!normalizedQuery) return [];

    const result: FlowSearchNode[] = [];
    for (const node of nodes) {
      if (!isFlowNode(node)) continue;
      const step = node.data.step;
      const titleNorm = normalizeForSearch(step.title);
      const keyNorm = normalizeForSearch(step.step_key);
      if (
        titleNorm.includes(normalizedQuery) ||
        keyNorm.includes(normalizedQuery)
      ) {
        result.push(node);
      }
    }

    result.sort((a, b) => {
      const posA = a.data.step.position ?? 0;
      const posB = b.data.step.position ?? 0;
      return posA - posB;
    });

    return result;
  }, [nodes, query]);

  const matches = matchedNodes.length;

  /**
   * Centraliza a viewport no próximo match (R19.3, R19.4).
   *
   * Detalhes:
   *   • Mantemos o zoom atual via `getZoom()`; o critério explicitamente
   *     proíbe alterar zoom em `Enter`.
   *   • Animação de 500ms casa com a meta "≤500ms" do critério.
   *   • Aplicamos `cursor % matches` para tolerar reduções no tamanho da
   *     lista entre chamadas (ex.: usuário deletou um passo enquanto
   *     ciclava).
   */
  const next = useCallback(() => {
    if (matches === 0 || !reactFlowInstance) return;
    const safeIndex = ((cursor % matches) + matches) % matches;
    const node = matchedNodes[safeIndex];
    if (!node) return;
    const zoom = reactFlowInstance.getZoom();
    void reactFlowInstance.setCenter(node.position.x, node.position.y, {
      zoom,
      duration: 500,
    });
    setCursor(safeIndex + 1);
  }, [matchedNodes, matches, reactFlowInstance, cursor]);

  /**
   * Listener global de teclado:
   *   • `Ctrl+K` / `Cmd+K`  → foca o input de busca (R19.1).
   *   • `Esc` (com input focado) → limpa a query e tira o foco (R19.5).
   *
   * Usamos `window` (e não `document`) por consistência com o restante do
   * projeto (e por ser o alvo natural para atalhos globais em Vite/React).
   * O listener é registrado em montagem e removido em desmontagem; o array
   * de dependências é vazio porque a função não captura nenhum valor
   * mutável (refs são estáveis, e `setQueryState`/`setCursor` são
   * setters do React garantidamente estáveis).
   */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.ctrlKey || event.metaKey;

      // Ctrl+K / Cmd+K — foca e seleciona o conteúdo atual do input.
      if (isCmdOrCtrl && (event.key === "k" || event.key === "K")) {
        // Não interferir em IME/composing.
        if (event.isComposing) return;
        event.preventDefault();
        const input = inputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }

      // Esc — só age quando o input está focado (R19.5).
      if (
        event.key === "Escape" &&
        inputRef.current !== null &&
        document.activeElement === inputRef.current
      ) {
        event.preventDefault();
        setQueryState("");
        setCursor(0);
        onQueryChangeRef.current?.("");
        inputRef.current.blur();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return {
    query,
    setQuery,
    next,
    matches,
    inputRef,
  };
}

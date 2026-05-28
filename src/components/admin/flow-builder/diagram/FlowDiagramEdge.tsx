/**
 * `FlowDiagramEdge` — aresta unificada do Modo_Diagrama.
 *
 * Cobre as 5 categorias visuais derivadas em `useDiagramData`:
 * `solid`, `dashed-amber`, `dotted-gray`, `ai-purple`, `error-red` (ver tabela
 * em `Component 5` do design).
 *
 * Detalhes de renderização:
 * - Traçado: `getSmoothStepPath` para arestas que avançam (forward) e
 *   `getBezierPath` para arestas que voltam (`targetX < sourceX`, R13.1).
 * - Auto-laço (`source === target`, R6.7): caminho bezier explícito com
 *   diâmetro de ~60 px (≥ 40 px exigidos).
 * - Label: `EdgeLabelRenderer` posiciona o rótulo já truncado em 40 chars
 *   (responsabilidade de `useDiagramData`) com `Tooltip` exibindo `fullLabel`
 *   na íntegra (R3.1).
 * - Precedência visual (R8.9): `solid` recebe `strokeWidth = 3` e `ai-purple`
 *   recebe `strokeWidth = 1.5`, garantindo a razão ≥ 2:1 exigida pelo design.
 *   A decisão de qual aresta vence em colapsos é feita em `useDiagramData`.
 * - Atenuação (R3.7): quando `data.dimmed === true`, todo o desenho da aresta
 *   (linha + rótulo) cai para 30% de opacidade.
 * - Acessibilidade (R14.8): o rótulo usa `bg-background` + `text-foreground`,
 *   tokens do Tailwind que respeitam contraste mínimo WCAG 2.1 AA (4.5:1)
 *   tanto no tema claro quanto no escuro.
 */

import { memo } from "react";
import type { CSSProperties } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from "@xyflow/react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  DiagramEdge,
  EdgeCategory,
  FlowDiagramEdgeData,
} from "@/hooks/useDiagramData";

// ---------------------------------------------------------------------------
// Estilos visuais por categoria (tabela do design)
// ---------------------------------------------------------------------------

type CategoryStyle = {
  /** Cor do traço (HSL via tokens do Tailwind quando aplicável). */
  stroke: string;
  /** Padrão de traço SVG (`undefined` = linha contínua). */
  strokeDasharray?: string;
  /** Espessura base do traço. */
  strokeWidth: number;
};

/**
 * Paleta visual das arestas. Reformulada para contrastar mais entre si
 * (o `solid` original usava `--primary`, igual à borda de seleção, o que
 * fazia toda a tela "ficar verde"). Larguras seguem o requisito R8.9:
 * `solid` ≥ 2× `ai-purple`. Mantemos `solid` em 3 e `ai-purple` em 1.5
 * (razão exata 2:1).
 */
const CATEGORY_STYLES: Record<EdgeCategory, CategoryStyle> = {
  // Arestas determinísticas (regras com gatilho explícito) — azul vibrante,
  // a cor "de fluxo" universalmente reconhecida. Se diferencia do verde
  // primary (que é reservado para seleção/ações). Espessura mantida em 3
  // para satisfazer R8.9 (solid ≥ 2× ai-purple = 1.5).
  solid: {
    stroke: "hsl(217 91% 55%)",
    strokeWidth: 3,
  },
  // Arestas de fallback (rota alternativa) — âmbar tracejado.
  "dashed-amber": {
    stroke: "hsl(38 92% 50%)",
    strokeDasharray: "8 4",
    strokeWidth: 2,
  },
  // Sequência por posição (visual auxiliar) — cinza médio bem discreto.
  "dotted-gray": {
    stroke: "hsl(220 8% 60%)",
    strokeDasharray: "2 5",
    strokeWidth: 1.25,
  },
  // IA — roxo, mais saturado para reforçar "rota não-determinística".
  "ai-purple": {
    stroke: "hsl(270 80% 60%)",
    strokeDasharray: "4 3",
    strokeWidth: 1.5,
  },
  // Erro / regra órfã — vermelho do tema.
  "error-red": {
    stroke: "hsl(var(--destructive))",
    strokeWidth: 2,
  },
};

// Diâmetro do auto-laço (R6.7): mínimo 40 px; usamos 60 px para folga visual.
const SELF_LOOP_OFFSET = 60;

// ---------------------------------------------------------------------------
// Geometria do auto-laço
// ---------------------------------------------------------------------------

/**
 * Constrói um caminho SVG para auto-laço (source === target). Faz um arco "D"
 * para a direita do nó, garantindo curvatura visível e independente da
 * posição relativa de outras arestas. Retorna também o ponto sugerido para
 * posicionar o rótulo (centro do bojo do arco).
 */
function buildSelfLoopPath(
  sourceX: number,
  sourceY: number,
): { path: string; labelX: number; labelY: number } {
  const o = SELF_LOOP_OFFSET;
  // Bezier cúbico que parte e volta ao mesmo ponto, abrindo um bojo à direita.
  // Os pontos de controle são deslocados em (+o, ±o) — produzindo um laço
  // simétrico com diâmetro horizontal ≈ o.
  const path =
    `M ${sourceX},${sourceY} ` +
    `C ${sourceX + o},${sourceY - o} ` +
    `${sourceX + o},${sourceY + o} ` +
    `${sourceX},${sourceY}`;
  return {
    path,
    labelX: sourceX + o * 0.75,
    labelY: sourceY,
  };
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

function FlowDiagramEdgeImpl(props: EdgeProps<DiagramEdge>) {
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
    selected,
  } = props;

  // Defaults defensivos: se `data` vier vazio, tratamos como `solid` neutro.
  const safeData: FlowDiagramEdgeData = data ?? {
    category: "solid",
    label: "",
    fullLabel: "",
    dimmed: false,
  };

  const styleSpec = CATEGORY_STYLES[safeData.category] ?? CATEGORY_STYLES.solid;
  const dimmed = safeData.dimmed === true;

  // Decisão de tipo de caminho:
  // - Auto-laço: source === target → bezier explícito (R6.7)
  // - "Volta": target à esquerda da origem (rankdir LR) → bezier (R13.1)
  // - Caso contrário: smoothstep horizontal/vertical
  const isSelfLoop = source === target;
  const isBackEdge = !isSelfLoop && targetX < sourceX;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (isSelfLoop) {
    const sl = buildSelfLoopPath(sourceX, sourceY);
    edgePath = sl.path;
    labelX = sl.labelX;
    labelY = sl.labelY;
  } else if (isBackEdge) {
    // R13.1 — back-edge precisa de curvatura ampla para não cruzar os
    // contornos dos nós de origem/destino. Construímos um bezier cúbico
    // explícito que primeiro "sobe" da origem (y - vSwing) e "sobe" do
    // destino (y - vSwing), com vSwing dimensionado pela distância
    // horizontal — garante afastamento mínimo de 20px de cada nó mesmo
    // quando os centros estão próximos verticalmente.
    const dx = Math.abs(sourceX - targetX);
    const vSwing = Math.max(40, Math.min(160, 20 + dx * 0.25));
    const c1x = sourceX + Math.max(40, dx * 0.4);
    const c1y = sourceY - vSwing;
    const c2x = targetX - Math.max(40, dx * 0.4);
    const c2y = targetY - vSwing;
    edgePath = `M ${sourceX},${sourceY} C ${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`;
    // Label posicionado no apex da curva (ponto médio com offset vertical).
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2 - vSwing * 0.65;
  } else {
    const [path, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 8,
    });
    edgePath = path;
    labelX = lx;
    labelY = ly;
  }

  // Atenuação por seleção (R3.7): demais arestas caem para 30%.
  const opacity = dimmed ? 0.3 : 1;

  const baseStyle: CSSProperties = {
    stroke: styleSpec.stroke,
    strokeWidth: styleSpec.strokeWidth,
    strokeDasharray: styleSpec.strokeDasharray,
    opacity,
    transition: "opacity 200ms ease-in-out, stroke-width 120ms ease-in-out",
    // `none` em fill é essencial — o caminho do auto-laço fecha de volta
    // ao ponto inicial e seria preenchido caso contrário.
    fill: "none",
  };

  // Realce sutil quando a aresta está selecionada — sem alterar a categoria.
  if (selected) {
    baseStyle.strokeWidth = (styleSpec.strokeWidth ?? 1.5) + 1;
  }

  const visibleLabel = safeData.label?.trim() ?? "";
  const fullLabel = safeData.fullLabel?.trim() ?? visibleLabel;
  const showLabel = visibleLabel.length > 0;
  const showTooltip = showLabel && fullLabel.length > 0;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={baseStyle}
        markerEnd={markerEnd}
        // Aumenta a área de hit-test sem alterar a aparência do traço,
        // facilitando o clique para edição (R6.5 fica disponível para o
        // container chamar `onEdgeClick`).
        interactionWidth={20}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            // `nodrag`/`nopan` evita que arrastar o rótulo dispare pan/drag
            // do canvas, conforme convenção do React Flow.
            className="nodrag nopan absolute pointer-events-auto"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity,
              transition: "opacity 200ms ease-in-out",
            }}
          >
            {showTooltip ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      // `bg-background` + `text-foreground` garantem contraste
                      // 4.5:1 (R14.8) em ambos os temas; a borda reforça a
                      // legibilidade contra arestas próximas.
                      className={cn(
                        "inline-block max-w-[160px] truncate rounded border border-border",
                        "bg-background/95 px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm",
                        "cursor-default select-none",
                      )}
                      tabIndex={0}
                      aria-label={fullLabel}
                    >
                      {visibleLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="whitespace-pre-wrap break-words text-xs">
                      {fullLabel}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span
                className={cn(
                  "inline-block max-w-[160px] truncate rounded border border-border",
                  "bg-background/95 px-1.5 py-0.5 text-[11px] font-medium text-foreground shadow-sm",
                  "select-none",
                )}
              >
                {visibleLabel}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowDiagramEdge = memo(FlowDiagramEdgeImpl);
FlowDiagramEdge.displayName = "FlowDiagramEdge";

export default FlowDiagramEdge;

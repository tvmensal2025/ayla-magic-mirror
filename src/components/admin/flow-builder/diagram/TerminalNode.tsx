/**
 * `TerminalNode` — Nó sintético dos três destinos especiais reconhecidos pelo
 * runtime: 📝 Cadastro, 👤 Humano, 🔁 Repetir (R3.2 / R6.8).
 *
 * Características:
 * - Apenas `Handle type="target"` à esquerda. Nunca é fonte de aresta.
 * - Não corresponde a um registro de `bot_flow_steps`. Existe um `TerminalNode`
 *   por valor de `goto_special` por Variante, compartilhado por todas as
 *   transitions com aquele valor.
 * - Visual minimalista, distinto do `FlowDiagramNode` (cinza claro com borda),
 *   para sinalizar ao Consultor que se trata de um destino terminal e não de
 *   um passo editável.
 * - `aria-label` em pt-BR no formato `"Destino especial: {label}"` (R14.6).
 *
 * Observação importante:
 * - `draggable: false` é responsabilidade do objeto de nó registrado (e do
 *   `FlowDiagram`/`useDiagramLayout`), não deste componente. Aqui apenas
 *   renderizamos a casca visual.
 * - O comportamento de "não abrir Inspector em duplo-clique" é responsabilidade
 *   do handler `onNodeDoubleClick` em `FlowDiagram`, que deve ignorar nodes do
 *   tipo `terminal` (R5.2 / R18.1).
 *
 * Layout:
 * - Posicionamento em coluna fixa à direita é responsabilidade de
 *   `useDiagramLayout` (R10.2).
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { TerminalDiagramNode } from "@/hooks/useDiagramData";

function TerminalNodeImpl({ data, selected }: NodeProps<TerminalDiagramNode>) {
  const { label, icon, kind } = data;

  // Paleta visual por tipo de terminal — antes todos eram cinza neutro,
  // o que dificultava distinguir "Humano" de "Cadastro" rapidamente.
  // Cores escolhidas para contraste em modo claro e escuro.
  const KIND_COLORS: Record<string, { container: string; iconText: string; label: string }> = {
    cadastro: {
      container:
        "border-emerald-500/50 bg-emerald-500/10 dark:border-emerald-400/40 dark:bg-emerald-950/40",
      iconText: "text-emerald-700 dark:text-emerald-400",
      label: "text-emerald-900 dark:text-emerald-200",
    },
    humano: {
      container:
        "border-sky-500/50 bg-sky-500/10 dark:border-sky-400/40 dark:bg-sky-950/40",
      iconText: "text-sky-700 dark:text-sky-300",
      label: "text-sky-900 dark:text-sky-200",
    },
    repeat: {
      container:
        "border-amber-500/50 bg-amber-500/10 dark:border-amber-400/40 dark:bg-amber-950/40",
      iconText: "text-amber-700 dark:text-amber-400",
      label: "text-amber-900 dark:text-amber-200",
    },
  };
  const palette = KIND_COLORS[kind] ?? {
    container: "border-border bg-muted/60",
    iconText: "text-muted-foreground",
    label: "text-foreground",
  };

  return (
    <div
      role="img"
      aria-label={`Destino especial: ${label}`}
      data-terminal-kind={kind}
      className={cn(
        "relative flex min-w-[140px] flex-col items-center justify-center gap-1.5",
        "rounded-lg border-2 border-dashed px-4 py-3 shadow-sm",
        "transition-[box-shadow,opacity] duration-150",
        palette.container,
        // Realce sutil quando selecionado, sem sugerir editabilidade.
        selected && "ring-2 ring-primary/40 ring-offset-1 ring-offset-background",
      )}
    >
      {/* Apenas handle do tipo target — nunca é fonte de aresta. */}
      <Handle
        type="target"
        position={Position.Left}
        id="default"
        // Mantém o handle visível mas discreto; isPortable padrão para target.
        className="!h-2.5 !w-2.5 !border !border-border !bg-background"
      />

      {/* Ícone grande + label — visual minimal. */}
      <span aria-hidden="true" className={cn("text-2xl leading-none", palette.iconText)}>
        {icon}
      </span>
      <span className={cn("text-xs font-semibold uppercase tracking-wide", palette.label)}>
        {label}
      </span>
    </div>
  );
}

const TerminalNode = memo(TerminalNodeImpl);
TerminalNode.displayName = "TerminalNode";

export default TerminalNode;

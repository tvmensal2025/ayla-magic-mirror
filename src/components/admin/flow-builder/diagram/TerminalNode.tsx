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

  return (
    <div
      role="img"
      aria-label={`Destino especial: ${label}`}
      data-terminal-kind={kind}
      className={cn(
        // Casca minimalista — cinza claro com borda, distinto do FlowDiagramNode.
        "relative flex min-w-[140px] flex-col items-center justify-center gap-1.5",
        "rounded-lg border border-dashed border-border bg-muted/60 px-4 py-3",
        "text-muted-foreground shadow-sm",
        "transition-[box-shadow,opacity] duration-150",
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
      <span aria-hidden="true" className="text-2xl leading-none">
        {icon}
      </span>
      <span className="text-xs font-medium uppercase tracking-wide text-foreground">
        {label}
      </span>
    </div>
  );
}

const TerminalNode = memo(TerminalNodeImpl);
TerminalNode.displayName = "TerminalNode";

export default TerminalNode;

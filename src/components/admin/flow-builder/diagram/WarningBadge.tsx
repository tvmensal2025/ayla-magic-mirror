import { AlertTriangle } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FlowWarning } from "@/components/admin/flow-builder/useFlowValidation";

/**
 * Limite máximo de mensagens exibidas dentro do tooltip; o restante é
 * resumido como "+N restantes" conforme R3.9.
 */
const MAX_VISIBLE_WARNINGS = 5;

export interface WarningBadgeProps {
  /**
   * Lista de warnings já filtrados pela `byStep[stepId]` em `useFlowValidation`.
   * O componente apenas renderiza; não aplica filtragem adicional.
   */
  warnings: FlowWarning[];
  /** Classes opcionais para customização posicional ou visual. */
  className?: string;
}

/**
 * Badge de alerta exibido no canto superior esquerdo de um No_Diagrama
 * quando o passo possui warnings reportados por `useFlowValidation` (R3.9).
 *
 * - Ícone destrutivo com `AlertTriangle` (lucide-react).
 * - Tooltip ao foco/hover após 300ms exibindo até 5 mensagens em pt-BR.
 * - Indicador "+N restantes" quando o total excede o limite.
 *
 * Posiciona-se via `absolute`; o nó pai deve ter `position: relative`.
 */
export function WarningBadge({ warnings, className }: WarningBadgeProps) {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  const visible = warnings.slice(0, MAX_VISIBLE_WARNINGS);
  const remaining = warnings.length - visible.length;
  const ariaLabel =
    warnings.length === 1
      ? "1 alerta neste passo"
      : `${warnings.length} alertas neste passo`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "absolute left-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full",
              "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
              "transition-colors hover:bg-destructive/20",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-1",
              className,
            )}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">⚠</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-xs whitespace-normal"
        >
          <ul className="space-y-1 text-xs leading-snug">
            {visible.map((w) => (
              <li key={w.id} className="flex items-start gap-1">
                <span aria-hidden="true" className="select-none">•</span>
                <span className="break-words">{w.message}</span>
              </li>
            ))}
            {remaining > 0 && (
              <li className="pt-1 text-[10px] text-muted-foreground">
                +{remaining} {remaining === 1 ? "restante" : "restantes"}
              </li>
            )}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default WarningBadge;

/**
 * ViewToggle
 * ----------
 * Controle segmentado de duas opções no header do `Editor_de_Fluxo`
 * (`/admin/fluxos`) que alterna entre `Modo_Lista` e `Modo_Diagrama`.
 *
 * Mapeamento → requisitos:
 * - R1.1: exatamente duas opções "Lista" e "Diagrama" mutuamente
 *   exclusivas, com uma e apenas uma ativa a qualquer momento.
 * - R1.4: a escolha é persistida em `localStorage` (chave
 *   `flow-view-mode`). A persistência é responsabilidade do consumidor:
 *   este componente apenas dispara `onChange(next)` quando o Consultor
 *   troca de opção; cabe ao `FluxoBuilder` gravar o valor antes do fim
 *   da transição.
 * - R14.7: todos os controles são focalizáveis via `Tab`, ativáveis via
 *   `Enter`/`Espaço` e expõem `aria-label` em português brasileiro. O
 *   `ToggleGroup` do Radix oferece navegação por setas dentro do
 *   `tabgroup` nativamente.
 * - R15.1: quando `diagramHint === true` (faixa 768-1023px), exibe um
 *   tooltip "Melhor visualização em desktop" sobre a opção "Diagrama".
 *
 * Observações:
 * - Radix `ToggleGroup` com `type="single"` permite, por padrão,
 *   desmarcar o item atual clicando nele de novo. Para garantir o
 *   invariante de R1.1 ("uma e apenas uma" sempre marcada), ignoramos
 *   strings vazias em `onValueChange`.
 */

import * as React from "react";
import { LayoutGrid, List } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ViewMode = "lista" | "diagrama";

export interface ViewToggleProps {
  /** Modo atualmente ativo (R1.1). */
  value: ViewMode;
  /**
   * Disparado quando o Consultor seleciona a outra opção. Nunca é
   * disparado com o mesmo valor de `value` nem com strings vazias —
   * mantém o invariante "uma e apenas uma" de R1.1.
   */
  onChange: (next: ViewMode) => void;
  /**
   * Quando `true`, exibe tooltip "Melhor visualização em desktop"
   * sobre a opção "Diagrama" (R15.1; faixa 768-1023px).
   */
  diagramHint?: boolean;
  /** Classe extra opcional para acomodar o controle no header. */
  className?: string;
}

const ITEM_BASE_CLASSES =
  "h-8 gap-1.5 px-3 text-xs font-medium data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm";

export function ViewToggle({
  value,
  onChange,
  diagramHint = false,
  className,
}: ViewToggleProps) {
  // Radix dispara strings vazias quando o item ativo é clicado de novo.
  // Ignoramos para preservar exclusividade mútua (R1.1).
  const handleValueChange = React.useCallback(
    (next: string) => {
      if (next !== "lista" && next !== "diagrama") return;
      if (next === value) return;
      onChange(next);
    },
    [onChange, value],
  );

  const diagramaItem = (
    <ToggleGroupItem
      value="diagrama"
      aria-label="Visualizar fluxo em diagrama"
      className={ITEM_BASE_CLASSES}
    >
      <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Diagrama</span>
    </ToggleGroupItem>
  );

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={handleValueChange}
      // `aria-label` sobre o grupo identifica o conjunto como um
      // controle único de seleção exclusiva.
      aria-label="Modo de visualização do fluxo"
      className={cn(
        "inline-flex rounded-lg border border-border/50 bg-muted/40 p-0.5",
        className,
      )}
    >
      <ToggleGroupItem
        value="lista"
        aria-label="Visualizar fluxo em lista"
        className={ITEM_BASE_CLASSES}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Lista</span>
      </ToggleGroupItem>

      {diagramHint ? (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            {/*
              `asChild` repassa o trigger ao próprio ToggleGroupItem,
              preservando o foco e a navegação por setas do Radix
              (R14.7) sem inserir um wrapper interativo extra.
            */}
            <TooltipTrigger asChild>{diagramaItem}</TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Melhor visualização em desktop
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        diagramaItem
      )}
    </ToggleGroup>
  );
}

export default ViewToggle;

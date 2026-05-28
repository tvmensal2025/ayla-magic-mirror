/**
 * DiagramToolbar
 * ----------------
 * Barra superior do canvas do `Modo_Diagrama` (renderizada pelo
 * `FlowDiagram` dentro de `<Panel position="top-left">`).
 *
 * Conteúdo (mapeamento → requisitos):
 * - Campo de busca por título ou `step_key` com atalho `Ctrl+K` / `Cmd+K` (R19.1).
 * - Toggle "Mostrar sequência" (R3.6).
 * - Toggle "Métricas" + label "últimos 30 dias" (R9.1, R9.3).
 * - Botão "Atualizar métricas" (R9.10).
 * - Botão "Centralizar" (R2.8).
 * - Botão "Reorganizar automaticamente" (R10.9).
 * - Menu "Exportar" → "PNG" / "SVG" (R16.1, R16.2).
 *
 * Acessibilidade (R14.7):
 * - Todos os controles são focalizáveis via `Tab`, ativáveis via
 *   `Enter` ou `Espaço` e expõem `aria-label` em português brasileiro.
 *
 * Observações:
 * - O componente é "puro de apresentação": todo o estado vive no
 *   `FlowDiagram` (ou nos hooks `useDiagramSearch`, `useDiagramMetrics`,
 *   `useDiagramExport`, `useDiagramLayout`) e é repassado via props.
 * - O wrapping com `<Panel position="top-left">` fica a cargo do
 *   `FlowDiagram`. Aqui não importamos nada de `@xyflow/react`.
 */

import * as React from "react";
import {
  Crosshair,
  Download,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DiagramToolbarProps {
  /** Termo atual da busca controlada externamente (R19.1). */
  searchQuery: string;
  /** Disparado a cada tecla digitada no campo de busca (R19.2). */
  onSearchChange: (q: string) => void;
  /**
   * Disparado quando o Consultor pressiona `Enter` no campo de busca:
   * cicla pelos matches em ordem de `position` (R19.3, R19.4).
   */
  onSearchEnter: () => void;

  /** Ref do input de busca — exposto pelo `useDiagramSearch` para que o
   *  atalho global Ctrl+K do hook possa focar o mesmo input renderizado
   *  pela toolbar (evita duplicação de listener). */
  searchInputRef?: React.RefObject<HTMLInputElement>;
  /** Quantidade de matches da busca atual (R19.6). `undefined` quando
   *  o consumidor ainda não cabou o `useDiagramSearch`. */
  searchMatches?: number;

  /** Estado atual do toggle "Mostrar sequência" (Arestas_Pontilhadas, R3.6). */
  dottedEdgesVisible: boolean;
  onDottedEdgesToggle: (v: boolean) => void;

  /** Estado atual do toggle "Métricas" (R9.1). */
  metricsEnabled: boolean;
  onMetricsToggle: (v: boolean) => void;
  /** Dispara recarga manual da view `v_flow_step_funnel` (R9.10). */
  onMetricsRefresh: () => void;

  /** Centraliza viewport (R2.8). */
  onCenter: () => void;
  /** Modal de confirmação + reset de `bot_flow_steps.layout` (R10.9). */
  onAutoLayout: () => void;
  /** Exportação local em PNG ou SVG (R16.1, R16.2). */
  onExport: (format: "png" | "svg") => void;

  /** Quantidade de Nós_Diagrama na Variante atual; usada para habilitar Exportar (R16.2). */
  nodeCount: number;
  /**
   * Indicador externo: quando `false`, "Exportar" fica desabilitado mesmo com
   * `nodeCount > 0` (ex.: o `reactFlowInstance` ainda não foi montado).
   */
  canExport: boolean;
  /** Bloqueia novos cliques no botão "Exportar" durante operação em andamento (R16.8). */
  exporting: boolean;

  /**
   * task 12.1 — quando `true`, desabilita as ações de edição via canvas
   * (R15.2): "Reorganizar automaticamente" fica esmaecida e não dispara
   * `onAutoLayout`. As ações de leitura ("Centralizar", busca, toggles de
   * sequência/métricas, "Atualizar métricas", "Exportar") permanecem
   * habilitadas porque não modificam dados.
   */
  readOnly?: boolean;

  /** Estado atual do modo Tela Cheia. */
  fullscreen: boolean;
  /** Alterna a tela cheia (responsabilidade do consumidor). */
  onFullscreenToggle: () => void;

  /** Classes opcionais para customização do container externo. */
  className?: string;
}

/** Texto auxiliar exibido em cada controle como `aria-label` em pt-BR (R14.7). */
const ARIA = {
  search: "Buscar passo por título ou step_key",
  dotted: "Mostrar arestas de sequência por posição",
  metrics: "Mostrar métricas dos últimos 30 dias",
  metricsRefresh: "Atualizar métricas",
  center: "Centralizar diagrama na viewport",
  autoLayout: "Reorganizar diagrama automaticamente",
  export: "Exportar diagrama",
  exportPng: "Exportar diagrama como PNG",
  exportSvg: "Exportar diagrama como SVG",
  fullscreenEnter: "Expandir diagrama para tela cheia",
  fullscreenExit: "Sair da tela cheia",
} as const;

export function DiagramToolbar({
  searchQuery,
  onSearchChange,
  onSearchEnter,
  searchInputRef,
  searchMatches,
  dottedEdgesVisible,
  onDottedEdgesToggle,
  metricsEnabled,
  onMetricsToggle,
  onMetricsRefresh,
  onCenter,
  onAutoLayout,
  onExport,
  nodeCount,
  canExport,
  exporting,
  readOnly = false,
  fullscreen,
  onFullscreenToggle,
  className,
}: DiagramToolbarProps) {
  const localInputRef = React.useRef<HTMLInputElement | null>(null);
  // Quando o consumidor passa um `searchInputRef` (do `useDiagramSearch`),
  // delegamos para ele para o atalho global Ctrl+K do hook focar o mesmo
  // input. Caso contrário, mantemos um ref local e registramos o listener
  // aqui (compatibilidade com consumidores antigos).
  const inputRef = searchInputRef ?? localInputRef;

  /**
   * Atalho global `Ctrl+K` / `Cmd+K` — registrado APENAS quando o consumidor
   * NÃO passou um `searchInputRef` (caso contrário, o hook `useDiagramSearch`
   * já registra o seu próprio listener). Evita duplicação de handlers.
   */
  React.useEffect(() => {
    if (searchInputRef) return; // hook externo cuida do atalho
    const handler = (e: KeyboardEvent) => {
      const isCmdK =
        (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
      if (!isCmdK) return;
      e.preventDefault();
      localInputRef.current?.focus();
      localInputRef.current?.select();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchInputRef]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearchEnter();
    }
  };

  const exportDisabled = !canExport || exporting || nodeCount === 0;
  const exportTooltip = exporting
    ? "Exportando…"
    : nodeCount === 0
      ? "Sem passos para exportar"
      : !canExport
        ? "Exportar indisponível no momento"
        : "Exportar diagrama";

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Ações do diagrama"
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-md backdrop-blur",
          "supports-[backdrop-filter]:bg-background/80",
          className,
        )}
      >
        {/* Campo de busca (R19.1) */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            type="search"
            inputMode="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar por título ou step_key"
            aria-label={ARIA.search}
            aria-describedby={
              searchQuery && typeof searchMatches === "number"
                ? "diagram-toolbar-search-status"
                : undefined
            }
            className="h-9 w-56 pl-8 pr-12"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-0.5 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground sm:inline-flex"
          >
            Ctrl+K
          </kbd>
          {/* R19.6 — texto auxiliar abaixo do input. */}
          {searchQuery && typeof searchMatches === "number" && (
            <p
              id="diagram-toolbar-search-status"
              role="status"
              aria-live="polite"
              className={cn(
                "absolute left-0 top-full mt-1 text-[10px]",
                searchMatches === 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {searchMatches === 0
                ? "Nenhum passo encontrado"
                : `${searchMatches} ${searchMatches === 1 ? "passo encontrado" : "passos encontrados"} — Enter para ciclar`}
            </p>
          )}
        </div>

        <Separator />

        {/* Toggle "Mostrar sequência" (R3.6) */}
        <div className="flex items-center gap-2">
          <Switch
            id="diagram-toolbar-dotted"
            checked={dottedEdgesVisible}
            onCheckedChange={onDottedEdgesToggle}
            aria-label={ARIA.dotted}
          />
          <Label htmlFor="diagram-toolbar-dotted" className="cursor-pointer whitespace-nowrap">
            Mostrar sequência
          </Label>
        </div>

        <Separator />

        {/* Toggle "Métricas" + "últimos 30 dias" (R9.1, R9.3) */}
        <div className="flex items-center gap-2">
          <Switch
            id="diagram-toolbar-metrics"
            checked={metricsEnabled}
            onCheckedChange={onMetricsToggle}
            aria-label={ARIA.metrics}
          />
          <Label
            htmlFor="diagram-toolbar-metrics"
            className="cursor-pointer whitespace-nowrap"
          >
            Métricas
          </Label>
          <span
            className="whitespace-nowrap text-xs text-muted-foreground"
            aria-hidden="true"
          >
            últimos 30 dias
          </span>

          {/* Atualizar métricas (R9.10) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onMetricsRefresh}
                disabled={!metricsEnabled}
                aria-label={ARIA.metricsRefresh}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Atualizar métricas</TooltipContent>
          </Tooltip>
        </div>

        <Separator />

        {/* Centralizar (R2.8) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCenter}
              aria-label={ARIA.center}
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Centralizar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Centralizar diagrama</TooltipContent>
        </Tooltip>

        {/* Tela cheia — alterna entre `fixed inset-0 z-50` e o container normal. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onFullscreenToggle}
              aria-label={fullscreen ? ARIA.fullscreenExit : ARIA.fullscreenEnter}
              aria-pressed={fullscreen}
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden md:inline">
                {fullscreen ? "Sair da tela cheia" : "Tela cheia"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {fullscreen
              ? "Voltar ao tamanho normal (Esc)"
              : "Expandir para tela cheia (F)"}
          </TooltipContent>
        </Tooltip>

        {/* Reorganizar automaticamente (R10.9) — desabilitado em modo somente leitura (R15.2). */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAutoLayout}
              disabled={readOnly}
              aria-label={ARIA.autoLayout}
              aria-disabled={readOnly}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Reorganizar automaticamente</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {readOnly
              ? "Reorganização indisponível em telas estreitas"
              : "Reorganizar automaticamente"}
          </TooltipContent>
        </Tooltip>

        {/* Menu Exportar (R16.1, R16.2) */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={exportDisabled}
                  aria-label={ARIA.export}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="hidden md:inline">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{exportTooltip}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => onExport("png")}
              disabled={exportDisabled}
              aria-label={ARIA.exportPng}
            >
              PNG
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onExport("svg")}
              disabled={exportDisabled}
              aria-label={ARIA.exportSvg}
            >
              SVG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

/**
 * Separador vertical fino entre grupos de controles.
 * Mantido como subcomponente local para não inflar o `ui/`.
 */
function Separator() {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      className="mx-1 hidden h-6 w-px shrink-0 bg-border md:inline-block"
    />
  );
}

export default DiagramToolbar;

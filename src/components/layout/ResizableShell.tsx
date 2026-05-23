import { Fragment, useEffect, useMemo, useRef } from "react";
import { PanelGroup, Panel, PanelResizeHandle, type ImperativePanelGroupHandle } from "react-resizable-panels";
import { GripVertical, GripHorizontal } from "lucide-react";
import { useLayoutLock } from "@/hooks/useLayoutLock";
import { cn } from "@/lib/utils";


export type ResizablePane = {
  id: string;
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  content: React.ReactNode;
  className?: string;
};

type Props = {
  /** Unique key per layout — persists sizes in localStorage. */
  storageKey: string;
  panels: ResizablePane[];
  direction?: "horizontal" | "vertical";
  className?: string;
};

const KEY_PREFIX = "igreen:layout:";

/**
 * Resizable multi-pane shell with a global safety lock.
 * - Default lock is ON: handles are disabled and visually hidden.
 * - Unlock via the global LayoutLockToggle in the admin header.
 * - Sizes persist in localStorage per `storageKey`.
 */
export function ResizableShell({ storageKey, panels, direction = "horizontal", className }: Props) {
  const { locked } = useLayoutLock();
  const ref = useRef<ImperativePanelGroupHandle>(null);
  const fullKey = KEY_PREFIX + storageKey;

  const initial = useMemo<number[] | null>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === panels.length && arr.every((n) => typeof n === "number")) {
        return arr;
      }
    } catch {}
    return null;
  }, [fullKey, panels.length]);

  // Restore on mount
  useEffect(() => {
    if (initial && ref.current) ref.current.setLayout(initial);
  }, [initial]);

  const handleLayout = (sizes: number[]) => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(sizes));
    } catch {}
  };

  const isV = direction === "vertical";
  const Grip = isV ? GripHorizontal : GripVertical;

  return (
    <PanelGroup
      ref={ref}
      direction={direction}
      onLayout={handleLayout}
      autoSaveId={undefined}
      className={cn("h-full w-full", className)}
    >
      {panels.map((p, i) => (
        <Fragment key={p.id}>
          <Panel
            id={p.id}
            order={i}
            defaultSize={initial?.[i] ?? p.defaultSize}
            minSize={p.minSize ?? 12}
            maxSize={p.maxSize ?? 88}
            className={cn("min-h-0 min-w-0", p.className)}
          >
            {p.content}
          </Panel>
          {i < panels.length - 1 && (
            <PanelResizeHandle
              disabled={locked}
              className={cn(
                "group relative flex items-center justify-center transition-all",
                isV ? "h-1" : "w-1",
                locked
                  ? "pointer-events-none opacity-0"
                  : isV
                    ? "h-1.5 bg-border/60 hover:bg-primary/60 cursor-row-resize"
                    : "w-1.5 bg-border/60 hover:bg-primary/60 cursor-col-resize",
              )}
            >
              {!locked && (
                <div
                  className={cn(
                    "z-10 flex items-center justify-center rounded-md border border-primary/40 bg-card text-primary shadow-md opacity-0 group-hover:opacity-100 transition-opacity",
                    isV ? "h-3 w-8" : "h-8 w-3",
                  )}
                >
                  <Grip className="h-3 w-3" />
                </div>
              )}
            </PanelResizeHandle>
          )}
        </Fragment>
      ))}

    </PanelGroup>
  );
}

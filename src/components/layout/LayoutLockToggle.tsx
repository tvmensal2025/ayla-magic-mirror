import { Lock, Unlock } from "lucide-react";
import { useLayoutLock } from "@/hooks/useLayoutLock";
import { cn } from "@/lib/utils";

export function LayoutLockToggle({ className }: { className?: string }) {
  const { locked, toggle } = useLayoutLock();
  return (
    <button
      type="button"
      onClick={toggle}
      title={locked ? "Layout travado — clique para liberar o ajuste das colunas" : "Layout liberado — arraste as bordas para redimensionar"}
      aria-label={locked ? "Destravar layout" : "Travar layout"}
      className={cn(
        "relative p-1.5 sm:p-2 rounded-xl transition-all duration-200",
        locked
          ? "text-muted-foreground hover:text-foreground hover:bg-secondary"
          : "text-primary bg-primary/10 hover:bg-primary/20 ring-1 ring-primary/40",
        className,
      )}
    >
      {locked ? <Lock className="h-4 w-4 sm:h-5 sm:w-5" /> : <Unlock className="h-4 w-4 sm:h-5 sm:w-5" />}
    </button>
  );
}

import { ArrowRight } from "lucide-react";

export function CaptureMissionHint({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/40">
      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" strokeWidth={2} />
      <span className="text-[11px] font-medium text-muted-foreground truncate">{label}</span>
    </div>
  );
}

import { Target } from "lucide-react";

export function CaptureMissionHint({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/30">
      <Target className="w-3 h-3 text-primary shrink-0" />
      <span className="text-[11px] font-semibold text-primary truncate">{label}</span>
    </div>
  );
}

import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { adGlossary, type AdMetricKey } from "@/lib/adGlossary";

export function MetricTooltip({ metric, className }: { metric: AdMetricKey; className?: string }) {
  const g = adGlossary[metric];
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={`inline-flex text-muted-foreground hover:text-foreground transition ${className || ""}`}>
            <HelpCircle className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          <div className="font-semibold mb-1">{g.short}</div>
          <div className="text-muted-foreground">{g.long}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

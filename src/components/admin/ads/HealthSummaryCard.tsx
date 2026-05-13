import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { evaluateAdHealth } from "@/lib/adGlossary";

interface Props {
  spend_cents: number;
  leads: number;
  impressions: number;
  registrations: number;
}

export function HealthSummaryCard(p: Props) {
  const h = evaluateAdHealth(p);
  const Icon = h.color === "green" ? CheckCircle2 : h.color === "yellow" ? AlertTriangle : AlertCircle;
  const styles = {
    green: "border-primary/40 bg-primary/10 text-primary",
    yellow: "border-warning/40 bg-warning/10 text-warning",
    red: "border-destructive/40 bg-destructive/10 text-destructive",
  }[h.color];

  return (
    <Card className={`p-4 border-2 ${styles}`}>
      <div className="flex items-start gap-3">
        <Icon className="w-6 h-6 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-foreground">{h.label}</div>
          <div className="text-xs text-muted-foreground mt-1">{h.message}</div>
        </div>
      </div>
    </Card>
  );
}

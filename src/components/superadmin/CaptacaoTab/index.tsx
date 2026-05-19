import { IntelDiagnostic } from "./IntelDiagnostic";
import { CompetitorsPanel } from "@/components/admin/ads/CompetitorsPanel";

export function CaptacaoTab() {
  return (
    <div className="space-y-6">
      <IntelDiagnostic />

      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur p-1">
        <CompetitorsPanel />
      </div>
    </div>
  );
}

import { ResultsDashboard } from "./ResultsDashboard";
import { WalletChip } from "./WalletChip";
import { TrendingUp } from "lucide-react";

interface Props {
  consultantId: string;
  onGoToCentral?: () => void;
}

export function PerformanceTab({ consultantId, onGoToCentral }: Props) {
  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            Performance dos Anúncios
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Visão clara dos seus resultados: cliques, leads no WhatsApp, clientes convertidos e custo real por etapa.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <WalletChip consultantId={consultantId} />
        </div>
      </header>

      <ResultsDashboard
        consultantId={consultantId}
        onCreateClick={onGoToCentral}
      />
    </div>
  );
}

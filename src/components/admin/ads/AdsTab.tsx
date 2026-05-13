import { useEffect, useState } from "react";
import { CreateCampaignWizard } from "./CreateCampaignWizard";
import { CampaignsList } from "./CampaignsList";
import { ResultsDashboard } from "./ResultsDashboard";
import { WalletChip } from "./WalletChip";
import { AdTemplatesGallery } from "./AdTemplatesGallery";
import { IntelligenceTab } from "./IntelligenceTab";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Plus, BarChart3, ListChecks, LayoutGrid, Brain, Sparkles } from "lucide-react";

interface Props { consultantId: string }

export function AdsTab({ consultantId }: Props) {
  const { toast } = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<"gallery" | "results" | "campaigns" | "intel">("gallery");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topup = params.get("topup");
    if (topup === "ok") {
      toast({ title: "Recarga concluída!", description: "Seu saldo já foi creditado." });
    } else if (topup === "cancel") {
      toast({ title: "Recarga cancelada", description: "Você pode tentar novamente quando quiser." });
    } else {
      return;
    }
    params.delete("topup");
    const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", clean);
  }, [toast]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            Anúncios iGreen
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Escolha um modelo pronto e publique em 1 clique. Os leads chegam direto no seu WhatsApp já conectado.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <WalletChip consultantId={consultantId} />
          <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5 h-8">
            <Plus className="w-3.5 h-3.5" /> Criar do zero
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-1 rounded-lg bg-secondary p-1 w-full sm:w-fit overflow-x-auto">
        <Button size="sm" variant={view === "gallery" ? "default" : "ghost"} onClick={() => setView("gallery")} className="h-8 gap-1.5 shrink-0">
          <LayoutGrid className="w-3.5 h-3.5" /> Modelos
        </Button>
        <Button size="sm" variant={view === "results" ? "default" : "ghost"} onClick={() => setView("results")} className="h-8 gap-1.5 shrink-0">
          <BarChart3 className="w-3.5 h-3.5" /> Resultados
        </Button>
        <Button size="sm" variant={view === "campaigns" ? "default" : "ghost"} onClick={() => setView("campaigns")} className="h-8 gap-1.5 shrink-0">
          <ListChecks className="w-3.5 h-3.5" /> Campanhas
        </Button>
        <Button size="sm" variant={view === "intel" ? "default" : "ghost"} onClick={() => setView("intel")} className="h-8 gap-1.5 shrink-0">
          <Brain className="w-3.5 h-3.5" /> Inteligência
        </Button>
      </div>

      {view === "gallery" && (
        <AdTemplatesGallery consultantId={consultantId} onPublished={() => { setRefreshKey(k => k + 1); setView("campaigns"); }} />
      )}
      {view === "results" && (
        <ResultsDashboard
          consultantId={consultantId}
          onCreateClick={() => setView("gallery")}
        />
      )}
      {view === "campaigns" && <CampaignsList consultantId={consultantId} refreshKey={refreshKey} />}
      {view === "intel" && <IntelligenceTab consultantId={consultantId} />}

      <div className="rounded-xl border border-dashed border-border/50 bg-card/30 p-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        <div>
          Recarregue sua carteira no botão acima e escolha um modelo pronto na <strong className="text-foreground">Galeria</strong>. A campanha sobe pré-otimizada em seu nome
          e os leads caem no WhatsApp já conectado em <strong className="text-foreground">Dados</strong>.
        </div>
      </div>

      <CreateCampaignWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        consultantId={consultantId}
        onCreated={() => setRefreshKey(k => k + 1)}
      />
    </div>
  );
}

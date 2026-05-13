import { useEffect, useState } from "react";
import { CreateCampaignWizard } from "./CreateCampaignWizard";
import { CreateCampaignExpress } from "./CreateCampaignExpress";
import { CampaignsList } from "./CampaignsList";
import { ResultsDashboard } from "./ResultsDashboard";
import { WalletCard } from "./WalletCard";
import { ConsultantAdSettingsCard } from "./ConsultantAdSettingsCard";
import { AdTemplatesGallery } from "./AdTemplatesGallery";
import { IntelligenceTab } from "./IntelligenceTab";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Sparkles, Plus, BarChart3, ListChecks, LayoutGrid, Brain } from "lucide-react";

interface Props { consultantId: string }

export function AdsTab({ consultantId }: Props) {
  const { toast } = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expressOpen, setExpressOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState<"campaigns" | "results" | "gallery" | "intel">("results");
  const [ready, setReady] = useState(false);

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
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" />
            Anúncios iGreen
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Campanhas no Facebook e Instagram pré-otimizadas pela plataforma. Você só recarrega, escolhe cidades e fotos.
          </p>
        </div>
        {ready && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView("gallery")} className="gap-2">
            <LayoutGrid className="w-4 h-4" /> Galeria de modelos
          </Button>
          <Button onClick={() => setExpressOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nova campanha
          </Button>
        </div>
        )}
      </header>

      <div className="grid lg:grid-cols-2 gap-4">
        <WalletCard consultantId={consultantId} />
        <ConsultantAdSettingsCard consultantId={consultantId} onReady={setReady} />
      </div>

      {!ready ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-primary/60 mx-auto" />
          <h3 className="font-bold text-foreground">Como funciona</h3>
          <ol className="text-sm text-muted-foreground space-y-1.5 max-w-md mx-auto text-left list-decimal list-inside">
            <li>Recarregue sua carteira (a partir de R$ 50)</li>
            <li>Configure o WhatsApp para onde os leads chegam</li>
            <li>Escolha as cidades onde quer anunciar</li>
            <li>Solte 3-10 fotos do seu trabalho</li>
            <li>Sua campanha sobe pré-otimizada e leads chegam direto no seu WhatsApp</li>
          </ol>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 rounded-lg bg-secondary p-1 w-fit">
            <Button size="sm" variant={view === "results" ? "default" : "ghost"} onClick={() => setView("results")} className="h-8 gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Resultados
            </Button>
            <Button size="sm" variant={view === "campaigns" ? "default" : "ghost"} onClick={() => setView("campaigns")} className="h-8 gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Campanhas
            </Button>
            <Button size="sm" variant={view === "gallery" ? "default" : "ghost"} onClick={() => setView("gallery")} className="h-8 gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" /> Modelos
            </Button>
          </div>
          {view === "results" && <ResultsDashboard consultantId={consultantId} />}
          {view === "campaigns" && <CampaignsList consultantId={consultantId} refreshKey={refreshKey} />}
          {view === "gallery" && (
            <AdTemplatesGallery consultantId={consultantId} onPublished={() => { setRefreshKey(k => k + 1); setView("campaigns"); }} />
          )}
        </>
      )}

      <CreateCampaignWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        consultantId={consultantId}
        onCreated={() => setRefreshKey(k => k + 1)}
      />

      <CreateCampaignExpress
        open={expressOpen}
        onClose={() => setExpressOpen(false)}
        consultantId={consultantId}
        onCreated={() => setRefreshKey(k => k + 1)}
        onSwitchAdvanced={() => setWizardOpen(true)}
      />
    </div>
  );
}

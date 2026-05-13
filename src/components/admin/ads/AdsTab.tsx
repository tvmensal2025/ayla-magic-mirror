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
  const [prefillImageUrl, setPrefillImageUrl] = useState<string | null>(null);

  function openExpressWithCreative(c: { image_url: string }) {
    setPrefillImageUrl(c.image_url);
    setExpressOpen(true);
  }

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
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            Anúncios iGreen
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Campanhas no Facebook e Instagram pré-otimizadas pela plataforma. Você só recarrega, escolhe cidades e fotos.
          </p>
        </div>
        {ready && (
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <Button variant="outline" onClick={() => setView("gallery")} className="gap-2 flex-1 sm:flex-none">
            <LayoutGrid className="w-4 h-4" /> <span className="truncate">Galeria</span>
          </Button>
          <Button onClick={() => { setPrefillImageUrl(null); setExpressOpen(true); }} className="gap-2 flex-1 sm:flex-none">
            <Plus className="w-4 h-4" /> <span className="truncate">Nova campanha</span>
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
          <div className="flex items-center gap-1 rounded-lg bg-secondary p-1 w-fit flex-wrap">
            <Button size="sm" variant={view === "results" ? "default" : "ghost"} onClick={() => setView("results")} className="h-8 gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Resultados
            </Button>
            <Button size="sm" variant={view === "campaigns" ? "default" : "ghost"} onClick={() => setView("campaigns")} className="h-8 gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Campanhas
            </Button>
            <Button size="sm" variant={view === "gallery" ? "default" : "ghost"} onClick={() => setView("gallery")} className="h-8 gap-1.5">
              <LayoutGrid className="w-3.5 h-3.5" /> Modelos
            </Button>
            <Button size="sm" variant={view === "intel" ? "default" : "ghost"} onClick={() => setView("intel")} className="h-8 gap-1.5">
              <Brain className="w-3.5 h-3.5" /> Inteligência
            </Button>
          </div>
          {view === "results" && <ResultsDashboard consultantId={consultantId} />}
          {view === "campaigns" && <CampaignsList consultantId={consultantId} refreshKey={refreshKey} />}
          {view === "gallery" && (
            <AdTemplatesGallery consultantId={consultantId} onPublished={() => { setRefreshKey(k => k + 1); setView("campaigns"); }} />
          )}
          {view === "intel" && <IntelligenceTab consultantId={consultantId} onUseCreativeInAd={openExpressWithCreative} />}
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
        onClose={() => { setExpressOpen(false); setPrefillImageUrl(null); }}
        consultantId={consultantId}
        prefillImageUrl={prefillImageUrl}
        onCreated={() => setRefreshKey(k => k + 1)}
        onSwitchAdvanced={() => setWizardOpen(true)}
      />
    </div>
  );
}

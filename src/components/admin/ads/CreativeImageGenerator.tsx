import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Download, Loader2, Wand2 } from "lucide-react";

type Format = "feed_1x1" | "story_9x16" | "reels_9x16" | "carousel_4x5";

const FORMATS: { id: Format; label: string; ratio: string; sub: string }[] = [
  { id: "feed_1x1",     label: "Feed 1:1",     ratio: "1080×1080", sub: "Feed FB/IG" },
  { id: "story_9x16",   label: "Story 9:16",   ratio: "1080×1920", sub: "Stories" },
  { id: "reels_9x16",   label: "Reels 9:16",   ratio: "1080×1920", sub: "Reels" },
  { id: "carousel_4x5", label: "Carrossel 4:5", ratio: "1080×1350", sub: "Carrossel feed" },
];

const ANGLES = [
  { id: "economia_concreta", label: "💰 Economia concreta" },
  { id: "quebra_objecao",    label: "🛡️ Quebra de objeção" },
  { id: "prova_social",      label: "👥 Prova social" },
  { id: "curiosidade",       label: "❓ Curiosidade" },
  { id: "dor_pas",           label: "😣 Dor (PAS)" },
  { id: "urgencia_local",    label: "📍 Urgência local" },
];

interface Generated {
  id: string;
  format: Format;
  image_url: string;
  angle: string | null;
  brief_used: string | null;
  created_at: string;
}

interface Props { consultantId: string }

export function CreativeImageGenerator({ consultantId }: Props) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState<Format | null>(null);
  const [angle, setAngle] = useState<string>("economia_concreta");
  const [history, setHistory] = useState<Generated[]>([]);

  async function loadHistory() {
    const { data } = await supabase
      .from("ad_generated_creatives")
      .select("id, format, image_url, angle, brief_used, created_at")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false })
      .limit(12);
    setHistory((data as Generated[]) || []);
  }

  useEffect(() => { loadHistory(); }, [consultantId]);

  async function generate(format: Format) {
    setGenerating(format);
    try {
      const { data, error } = await supabase.functions.invoke("ad-creative-image-generator", {
        body: { format, angle },
      });
      if (error) throw error;
      if (!data?.image_url) throw new Error("Sem imagem retornada");
      toast({ title: "Criativo gerado!", description: `${format.replace("_", " ")} pronto.` });
      await loadHistory();
    } catch (e: any) {
      toast({ title: "Erro ao gerar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  }

  return (
    <Card className="p-5 bg-card/50 backdrop-blur border-border/60">
      <div className="mb-4">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-primary" />
          Gerar criativo perfeito (1 clique)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          IA combina seus insights + concorrentes vencedores + brand iGreen para gerar imagem nas dimensões exatas do Meta.
        </p>
      </div>

      <div className="mb-3">
        <label className="text-xs text-muted-foreground mb-1.5 block">Ângulo do criativo</label>
        <div className="flex flex-wrap gap-1.5">
          {ANGLES.map(a => (
            <button
              key={a.id}
              onClick={() => setAngle(a.id)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                angle === a.id ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/30 border-border/40 text-muted-foreground hover:border-primary/40"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        {FORMATS.map(f => (
          <button
            key={f.id}
            onClick={() => generate(f.id)}
            disabled={generating !== null}
            className="group p-3 rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="flex items-center gap-1.5 mb-1">
              {generating === f.id ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary group-hover:scale-110 transition" />
              )}
              <span className="text-sm font-bold text-foreground">{f.label}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{f.ratio} · {f.sub}</p>
          </button>
        ))}
      </div>

      {generating && (
        <p className="text-xs text-center text-muted-foreground mb-3 animate-pulse">
          Gerando criativo perfeito... isso leva ~20-40s
        </p>
      )}

      {history.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-foreground mb-2">Histórico de criativos gerados</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {history.map(h => (
              <div key={h.id} className="group relative rounded-lg overflow-hidden border border-border/40 bg-secondary/30 aspect-square">
                <img src={h.image_url} alt="Criativo gerado" loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                  <Badge variant="secondary" className="text-[10px]">{h.format.replace("_", " ")}</Badge>
                  {h.angle && <Badge variant="outline" className="text-[10px]">{h.angle}</Badge>}
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                    <a href={h.image_url} download target="_blank" rel="noopener">
                      <Download className="w-3 h-3" /> Baixar
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

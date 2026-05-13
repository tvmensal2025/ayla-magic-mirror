import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Download, Loader2, Wand2, Globe, Lock, Megaphone, Users, RefreshCw } from "lucide-react";
import { CreativeOverlay, type CreativeOverlayHandle } from "./CreativeOverlay";

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
  is_public: boolean;
  consultant_id: string;
  inspired_by_advertisers: string[] | null;
  created_at: string;
  headline_used: string | null;
  badge_text: string | null;
}

export interface CreativeImageGeneratorHandle {
  generateInspired: (inspiredAdId: string, hint?: string) => Promise<void>;
}

interface Props {
  consultantId: string;
  onUseInAd?: (creative: { image_url: string; format: Format; headline: string; badge: string }) => void;
}

export const CreativeImageGenerator = forwardRef<CreativeImageGeneratorHandle, Props>(
  function CreativeImageGenerator({ consultantId, onUseInAd }, ref) {
    const { toast } = useToast();
    const [generating, setGenerating] = useState<Format | null>(null);
    const [angle, setAngle] = useState<string>("economia_concreta");
    const [isPublic, setIsPublic] = useState<boolean>(false);
    const [history, setHistory] = useState<Generated[]>([]);
    const [galleryView, setGalleryView] = useState<"mine" | "public">("mine");
    const [inspiredById, setInspiredById] = useState<string | null>(null);
    const [inspiredHint, setInspiredHint] = useState<string | null>(null);

    async function loadHistory() {
      let q = supabase
        .from("ad_generated_creatives")
        .select("id, format, image_url, angle, brief_used, is_public, consultant_id, inspired_by_advertisers, created_at, headline_used, badge_text")
        .order("created_at", { ascending: false })
        .limit(24);
      if (galleryView === "mine") q = q.eq("consultant_id", consultantId);
      else q = q.eq("is_public", true);
      const { data } = await q;
      setHistory((data as Generated[]) || []);
    }

    useEffect(() => { loadHistory(); }, [consultantId, galleryView]);

    async function generate(format: Format) {
      setGenerating(format);
      try {
        const { data, error } = await supabase.functions.invoke("ad-creative-image-generator", {
          body: {
            format,
            angle,
            is_public: isPublic,
            inspired_by_ad_id: inspiredById || undefined,
          },
        });
        if (error) throw error;
        if (!data?.image_url) throw new Error("Sem imagem retornada");
        toast({ title: "Criativo gerado!", description: `${format.replace("_", " ")} pronto${inspiredById ? " (inspirado no campeão)" : ""}.` });
        setInspiredById(null);
        setInspiredHint(null);
        setGalleryView("mine");
        await loadHistory();
      } catch (e: any) {
        toast({ title: "Erro ao gerar", description: e?.message || String(e), variant: "destructive" });
      } finally {
        setGenerating(null);
      }
    }

    useImperativeHandle(ref, () => ({
      async generateInspired(adId: string, hint?: string) {
        setInspiredById(adId);
        setInspiredHint(hint || null);
        toast({
          title: "Inspiração travada 🎯",
          description: "Escolha o formato abaixo para gerar o criativo inspirado neste anúncio campeão.",
        });
        // scroll para os formatos
        setTimeout(() => {
          document.getElementById("creative-formats")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      },
    }), [toast]);

    async function togglePublic(row: Generated) {
      if (row.consultant_id !== consultantId) return;
      const next = !row.is_public;
      const { error } = await supabase
        .from("ad_generated_creatives")
        .update({ is_public: next })
        .eq("id", row.id)
        .select();
      if (error) {
        toast({ title: "Erro ao alterar visibilidade", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: next ? "Agora é público 🌎" : "Voltou a privado 🔒" });
      loadHistory();
    }

    return (
      <Card className="p-5 bg-card/50 backdrop-blur border-border/60">
        <div className="mb-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Gerar criativo perfeito (1 clique)
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            IA combina seus insights + concorrentes vencedores + brand iGreen para gerar imagem nas dimensões exatas do Meta. Salvo no MinIO.
          </p>
        </div>

        {inspiredById && (
          <div className="mb-3 p-2.5 rounded-md border border-primary/40 bg-primary/10 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-primary">🎯 Inspirado em concorrente campeão</p>
              {inspiredHint && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{inspiredHint}</p>}
            </div>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setInspiredById(null); setInspiredHint(null); }}>
              limpar
            </Button>
          </div>
        )}

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

        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setIsPublic(p => !p)}
            className={`text-xs px-2.5 py-1.5 rounded-md border transition-all flex items-center gap-1.5 ${
              isPublic ? "bg-primary/15 border-primary/50 text-primary" : "bg-secondary/30 border-border/40 text-muted-foreground"
            }`}
          >
            {isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isPublic ? "Será público" : "Será privado"}
          </button>
          <span className="text-[11px] text-muted-foreground">Público = aparece na galeria de todos os consultores</span>
        </div>

        <div id="creative-formats" className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
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

        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-foreground">Galeria de criativos</h4>
          <div className="flex gap-1 rounded-md bg-secondary/40 p-0.5">
            <button
              onClick={() => setGalleryView("mine")}
              className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 ${galleryView === "mine" ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              <Lock className="w-3 h-3" /> Meus
            </button>
            <button
              onClick={() => setGalleryView("public")}
              className={`text-[10px] px-2 py-1 rounded flex items-center gap-1 ${galleryView === "public" ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              <Users className="w-3 h-3" /> Comunidade
            </button>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {galleryView === "mine" ? "Nenhum criativo seu ainda — gere o primeiro acima!" : "Nenhum criativo público ainda."}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {history.map(h => {
              const isMine = h.consultant_id === consultantId;
              return (
                <div key={h.id} className="group relative rounded-lg overflow-hidden border border-border/40 bg-secondary/30 aspect-square">
                  {h.headline_used ? (
                    <CreativeOverlay
                      imageUrl={h.image_url}
                      format={h.format}
                      headline={h.headline_used}
                      badge={h.badge_text || undefined}
                      className="w-full h-full"
                    />
                  ) : (
                    <img src={h.image_url} alt="Criativo gerado" loading="lazy" className="w-full h-full object-cover" />
                  )}

                  <div className="absolute top-1 right-1 flex gap-1">
                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                      {h.is_public ? <Globe className="w-2.5 h-2.5 mr-0.5" /> : <Lock className="w-2.5 h-2.5 mr-0.5" />}
                      {h.is_public ? "público" : "privado"}
                    </Badge>
                  </div>

                  <div className="absolute inset-0 bg-background/85 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
                    <Badge variant="secondary" className="text-[9px]">{h.format.replace("_", " ")}</Badge>
                    {h.angle && <Badge variant="outline" className="text-[9px]">{h.angle}</Badge>}
                    {onUseInAd && (
                      <Button size="sm" className="h-7 text-[10px] gap-1 w-full" onClick={() => onUseInAd({ image_url: h.image_url, format: h.format, headline: h.headline_used || "", badge: h.badge_text || "" })}>
                        <Megaphone className="w-3 h-3" /> Usar neste anúncio
                      </Button>
                    )}
                    <div className="flex gap-1 w-full">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1" asChild>
                        <a href={h.image_url} download target="_blank" rel="noopener">
                          <Download className="w-3 h-3" /> Baixar
                        </a>
                      </Button>
                      {isMine && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => togglePublic(h)}>
                          {h.is_public ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  }
);

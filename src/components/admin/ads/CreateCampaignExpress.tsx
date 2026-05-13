import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Upload, X, Wand2, ImageIcon, Settings2, RefreshCw, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CityHit, createCampaign, generateCopy, preflightCampaign, searchCitiesBulk,
  uploadAdPhotos, validateAccount,
} from "@/services/facebookAds";
import { DISTRIBUIDORAS_PRESETS, type DistribuidoraPreset } from "@/data/distribuidoraPresets";
import { supabase } from "@/integrations/supabase/client";
import { CreativeOverlay, type CreativeOverlayHandle } from "./CreativeOverlay";

type AiFormat = "feed_1x1" | "story_9x16" | "reels_9x16" | "carousel_4x5";
const AI_ANGLES = [
  { id: "economia_concreta", label: "💰 Economia" },
  { id: "quebra_objecao",    label: "🛡️ Sem obra" },
  { id: "prova_social",      label: "👥 Prova social" },
  { id: "dor_pas",           label: "😣 Dor" },
  { id: "urgencia_local",    label: "📍 Local" },
];
const AI_FORMATS: { id: AiFormat; label: string }[] = [
  { id: "feed_1x1",     label: "Feed 1:1" },
  { id: "story_9x16",   label: "Story 9:16" },
  { id: "reels_9x16",   label: "Reels 9:16" },
  { id: "carousel_4x5", label: "Carrossel 4:5" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  consultantId: string;
  onCreated?: () => void;
  onSwitchAdvanced?: () => void;
  prefillImageUrl?: string | null;
}

const PRESET_CACHE_VERSION = "v1";
const presetCacheKey = (id: string) => `ads-preset-cities-${PRESET_CACHE_VERSION}-${id}`;
function readPresetCache(id: string): CityHit[] | null {
  try {
    const raw = localStorage.getItem(presetCacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.cities) && parsed.cities.length > 0) return parsed.cities as CityHit[];
  } catch {}
  return null;
}
function writePresetCache(id: string, cities: CityHit[]) {
  try { localStorage.setItem(presetCacheKey(id), JSON.stringify({ ts: Date.now(), cities })); } catch {}
}

const TIER_LABEL: Record<string, string> = {
  alto: "🟢 Bônus até 100%",
  medio: "🟡 Bônus até 50%",
  sem_bonus: "⚪ Sem bônus extra",
};

export function CreateCampaignExpress({ open, onClose, consultantId, onCreated, onSwitchAdvanced, prefillImageUrl }: Props) {
  const { toast } = useToast();
  const [issues, setIssues] = useState<string[] | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [stepLog, setStepLog] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ===== Tab "Gerar com IA" =====
  const [photoTab, setPhotoTab] = useState<"upload" | "ai">("upload");
  const [aiAngle, setAiAngle] = useState<string>("economia_concreta");
  const [aiFormat, setAiFormat] = useState<AiFormat>("feed_1x1");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<{ image_url: string; headline: string; badge: string } | null>(null);
  const [aiAccepting, setAiAccepting] = useState(false);
  const overlayRef = useRef<CreativeOverlayHandle | null>(null);

  useEffect(() => {
    if (!open) return;
    setPresetId(null); setFiles([]); setPreviews([]); setStepLog(""); setSubmitting(false);
    setIssues(null);
    setPhotoTab("upload"); setAiPreview(null); setAiGenerating(false); setAiAccepting(false);
    validateAccount().then(r => setIssues(r.issues)).catch(e => setIssues([e.message]));

    // Pré-carregar imagem gerada (criativo IA do MinIO)
    if (prefillImageUrl) {
      (async () => {
        try {
          const res = await fetch(prefillImageUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
          const file = new File([blob], `criativo-ia-${Date.now()}.${ext}`, { type: blob.type || "image/png" });
          setFiles([file]);
          setPreviews([URL.createObjectURL(file)]);
          toast({ title: "Criativo IA carregado", description: "Imagem pronta para virar anúncio." });
        } catch (e: any) {
          toast({ title: "Não foi possível carregar o criativo", description: e?.message || String(e), variant: "destructive" });
        }
      })();
    }
  }, [open, prefillImageUrl]);

  // limpa object URLs
  useEffect(() => () => { previews.forEach(u => URL.revokeObjectURL(u)); }, [previews]);

  function pickFiles(list: FileList | null) {
    if (!list?.length) return;
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) continue;
      if (f.size > 8 * 1024 * 1024) continue;
      accepted.push(f);
      if (accepted.length + files.length >= 4) break;
    }
    if (accepted.length === 0) {
      toast({ title: "Nenhuma foto válida", description: "Use JPG/PNG/WebP até 8 MB", variant: "destructive" });
      return;
    }
    setFiles((prev) => [...prev, ...accepted].slice(0, 4));
    setPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))].slice(0, 4));
  }

  function removePhoto(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function generateAiCreative() {
    if (!presetId) {
      toast({ title: "Escolha a distribuidora primeiro", description: "A IA precisa do contexto da distribuidora.", variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    setAiPreview(null);
    try {
      const preset = DISTRIBUIDORAS_PRESETS.find(p => p.id === presetId);
      const { data, error } = await supabase.functions.invoke("ad-creative-image-generator", {
        body: {
          format: aiFormat,
          angle: aiAngle,
          is_public: false,
          brief_extra: preset ? `Cliente típico de ${preset.nome} (${preset.uf}).` : undefined,
        },
      });
      if (error) throw error;
      if (!data?.image_url) throw new Error("IA não retornou imagem");
      setAiPreview({
        image_url: data.image_url,
        headline: data.headline || "Conta de luz até 20% mais barata",
        badge: data.badge || "ATÉ 20% OFF",
      });
      toast({ title: "Criativo gerado!", description: "Revise o preview e aprove ou regenere." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar criativo", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  }

  async function acceptAiCreative() {
    if (!aiPreview || !overlayRef.current) return;
    setAiAccepting(true);
    try {
      const composite = await overlayRef.current.toFile(`criativo-ia-${Date.now()}.png`);
      const localUrl = URL.createObjectURL(composite);
      setFiles((prev) => [composite, ...prev].slice(0, 4));
      setPreviews((prev) => [localUrl, ...prev].slice(0, 4));
      setAiPreview(null);
      setPhotoTab("upload");
      toast({ title: "Criativo IA adicionado!", description: "Pronto para publicar." });
    } catch (e: any) {
      toast({ title: "Não consegui exportar a imagem", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setAiAccepting(false);
    }
  }

  async function handlePublish() {
    if (!presetId) return toast({ title: "Escolha sua distribuidora", variant: "destructive" });
    if (files.length === 0) return toast({ title: "Adicione pelo menos 1 foto", variant: "destructive" });
    const preset = DISTRIBUIDORAS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setSubmitting(true);
    try {
      // 1) cidades (cache se houver)
      setStepLog("Carregando cidades da distribuidora...");
      let hits = readPresetCache(preset.id);
      if (!hits) {
        const ufPrimary = preset.uf.split("/")[0];
        const fetched = await searchCitiesBulk(preset.cidades.map((name) => ({ name, uf: ufPrimary })));
        hits = (fetched.cities || []).filter((h) => h?.key);
        if (hits.length > 0) writePresetCache(preset.id, hits);
      }
      if (!hits || hits.length === 0) throw new Error("Não consegui carregar as cidades dessa distribuidora");
      // limita a 80 pra não ficar amplo demais
      const cities = hits.slice(0, 80);

      // 2) PREFLIGHT — bloqueia se a Meta acusar audiência muito pequena
      // ou conta com problema. R$ 30/dia é o orçamento Express.
      setStepLog("Validando alcance no Facebook...");
      const pf = await preflightCampaign({
        cities: cities.map((c) => ({ key: c.key, name: c.name })),
        daily_budget_cents: 3000,
      });
      if (!pf.ok) {
        toast({ title: "Pré-validação em revisão", description: pf.blockers.join(" | ") || "Vou tentar publicar direto.", variant: "destructive" });
      }
      if (pf.reach && pf.reach.lower < 50_000) {
        throw new Error(`Audiência muito pequena (${pf.reach.lower.toLocaleString("pt-BR")} pessoas). Use o modo avançado e adicione mais cidades.`);
      }

      // 3) copy automático
      setStepLog("Gerando texto do anúncio com IA...");
      const copy = await generateCopy([`clientes de ${preset.nome}`, ...cities.map((c) => c.name).slice(0, 3)]);
      const headline = copy.headlines[0] || `Conta de luz mais barata em ${preset.nome}`;
      const primary = copy.primary_texts[0] || `Reduza até 20% na conta de luz com energia limpa. Atendimento via WhatsApp.`;
      const description = copy.description || `Sem obra. Sem instalação. Sem fidelidade.`;

      // 4) upload das fotos
      setStepLog("Enviando fotos...");
      const photoUrls = await uploadAdPhotos(consultantId, files);

      // 5) cria a campanha
      setStepLog("Publicando campanha no Facebook...");
      await createCampaign({
        name: `iGreen — ${preset.nome}`,
        cities: cities.map((c) => ({ key: c.key, name: c.name })),
        daily_budget_cents: 3000, // R$ 30/dia
        duration_days: null,
        // Express só aceita upload livre — assume square (Meta auto-corta para Reels).
        photos: photoUrls.map((url) => ({ url, format: "square" as const })),
        headline, primary_text: primary, description,
        distribuidora: preset.nome,
      });
      toast({ title: "Campanha publicada!", description: "Em revisão pelo Facebook. Os leads chegam no seu WhatsApp." });
      onCreated?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Não consegui publicar", description: e?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setSubmitting(false); setStepLog("");
    }
  }

  const visibleIssues = (issues || []).filter((i) => !i.includes("Pixel"));
  const grouped = (["alto", "medio", "sem_bonus"] as const).map((tier) => ({
    tier,
    items: DISTRIBUIDORAS_PRESETS.filter((p) => p.tier === tier),
  }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Nova campanha — Modo Fácil
          </DialogTitle>
        </DialogHeader>

        {issues === null ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            {visibleIssues.length > 0 && (
              <Card className="p-4 border-warning/50 bg-warning/5">
                <h4 className="font-bold text-warning mb-2">Validação em andamento</h4>
                <ul className="text-sm space-y-1 list-disc list-inside text-warning/90">
                  {visibleIssues.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              </Card>
            )}
            <p className="text-sm text-muted-foreground">
              Em 3 passos sua campanha sobe no ar. A IA cuida do texto, das cidades e do orçamento (R$ 30/dia).
            </p>

            {/* 1. Distribuidora */}
            <section className="space-y-2">
              <div className="text-sm font-bold text-foreground">1. Qual sua distribuidora de energia?</div>
              {grouped.map(({ tier, items }) => items.length > 0 && (
                <div key={tier} className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{TIER_LABEL[tier]}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((p) => {
                      const active = presetId === p.id;
                      return (
                        <button key={p.id} type="button" disabled={submitting}
                          onClick={() => setPresetId(p.id)}
                          className={`text-xs px-3 py-2 rounded-full border transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-primary/10 border-border"}`}>
                          {p.nome} <span className="opacity-60">— {p.uf}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>

            {/* 2. Fotos */}
            <section className="space-y-2">
              <div className="text-sm font-bold text-foreground">2. Adicione 1 a 4 fotos do seu anúncio</div>

              {/* Tabs Upload | IA */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-secondary/40">
                <button
                  type="button"
                  onClick={() => setPhotoTab("upload")}
                  className={`text-xs font-medium py-2 rounded-md transition flex items-center justify-center gap-1.5 ${photoTab === "upload" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  <Upload className="w-3.5 h-3.5" /> Enviar minhas fotos
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoTab("ai")}
                  className={`text-xs font-medium py-2 rounded-md transition flex items-center justify-center gap-1.5 ${photoTab === "ai" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Gerar com IA
                </button>
              </div>

              {photoTab === "upload" && (
                <div className="border-2 border-dashed rounded-xl p-5 text-center">
                  <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                    onChange={(e) => { pickFiles(e.target.files); if (e.currentTarget) e.currentTarget.value = ""; }} />
                  <button type="button" disabled={submitting || files.length >= 4}
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary disabled:opacity-50">
                    <Upload className="w-4 h-4" /> Clique para enviar fotos ({files.length}/4)
                  </button>
                  <div className="text-[11px] text-muted-foreground mt-1">JPG/PNG/WebP até 8 MB. Quadrada (1:1) funciona melhor.</div>
                </div>
              )}

              {photoTab === "ai" && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3">
                  {!aiPreview && (
                    <>
                      <div>
                        <label className="text-[11px] text-muted-foreground mb-1 block">Ângulo do anúncio</label>
                        <div className="flex flex-wrap gap-1.5">
                          {AI_ANGLES.map(a => (
                            <button key={a.id} type="button" disabled={aiGenerating}
                              onClick={() => setAiAngle(a.id)}
                              className={`text-[11px] px-2 py-1 rounded-md border transition ${aiAngle === a.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}>
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground mb-1 block">Formato</label>
                        <div className="flex flex-wrap gap-1.5">
                          {AI_FORMATS.map(f => (
                            <button key={f.id} type="button" disabled={aiGenerating}
                              onClick={() => setAiFormat(f.id)}
                              className={`text-[11px] px-2 py-1 rounded-md border transition ${aiFormat === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button type="button" onClick={generateAiCreative} disabled={aiGenerating || submitting || !presetId} className="w-full gap-2">
                        {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        {aiGenerating ? "Gerando criativo (~30s)..." : "Gerar criativo com IA"}
                      </Button>
                      {!presetId && (
                        <p className="text-[10px] text-warning text-center">Escolha a distribuidora no passo 1 antes de gerar.</p>
                      )}
                    </>
                  )}

                  {aiPreview && (
                    <div className="space-y-2">
                      <div className="rounded-lg overflow-hidden border border-border max-w-[280px] mx-auto">
                        <CreativeOverlay
                          ref={overlayRef}
                          imageUrl={aiPreview.image_url}
                          format={aiFormat}
                          headline={aiPreview.headline}
                          badge={aiPreview.badge}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5"
                          onClick={generateAiCreative} disabled={aiGenerating || aiAccepting}>
                          {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Regenerar
                        </Button>
                        <Button type="button" size="sm" className="flex-1 gap-1.5"
                          onClick={acceptAiCreative} disabled={aiAccepting || aiGenerating}>
                          {aiAccepting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Usar este criativo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previews.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removePhoto(i)} disabled={submitting}
                        className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Publicar */}
            <section className="space-y-2">
              <div className="text-sm font-bold text-foreground">3. Publicar</div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5"><Wand2 className="w-3 h-3 text-primary" /> <strong>IA escreve o anúncio</strong> com base na distribuidora</div>
                <div className="flex items-center gap-1.5"><ImageIcon className="w-3 h-3 text-primary" /> Carregamos até <strong>80 cidades</strong> automaticamente</div>
                <div className="flex items-center gap-1.5">💰 Orçamento: <strong>R$ 30/dia</strong>, sem prazo final (você pausa quando quiser)</div>
                <div className="flex items-center gap-1.5">📱 Leads chegam direto no seu <strong>WhatsApp</strong></div>
              </div>
              {stepLog && (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {stepLog}</div>
              )}
            </section>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
              <Button type="button" variant="ghost" size="sm" className="text-xs gap-1.5"
                onClick={() => { onClose(); setTimeout(() => onSwitchAdvanced?.(), 100); }}
                disabled={submitting}>
                <Settings2 className="w-3.5 h-3.5" /> Modo avançado
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
                <Button onClick={handlePublish} disabled={submitting || !presetId || files.length === 0} className="gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Publicar campanha
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
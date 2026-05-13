import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Upload, X, Wand2, ImageIcon, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  CityHit, createCampaign, generateCopy, preflightCampaign, searchCitiesBulk,
  uploadAdPhotos, validateAccount,
} from "@/services/facebookAds";
import { DISTRIBUIDORAS_PRESETS, type DistribuidoraPreset } from "@/data/distribuidoraPresets";
import { CreativeOverlay, type CreativeOverlayHandle } from "./CreativeOverlay";

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
  const [applyCta, setApplyCta] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Para cada foto: { square, vertical, story } refs do CreativeOverlay
  const overlayRefs = useRef<Array<{ square: CreativeOverlayHandle | null; vertical: CreativeOverlayHandle | null; story: CreativeOverlayHandle | null }>>([]);

  const preset = useMemo(
    () => DISTRIBUIDORAS_PRESETS.find((p) => p.id === presetId) || null,
    [presetId],
  );
  const defaultHeadline = preset
    ? `Conta de luz até 20% mais barata em ${preset.nome}`
    : "Conta de luz até 20% mais barata";
  const [liveHeadline, setLiveHeadline] = useState(defaultHeadline);
  useEffect(() => { setLiveHeadline(defaultHeadline); }, [defaultHeadline]);
  const badge = "ATÉ 20% OFF";

  function getOverlayRef(i: number) {
    if (!overlayRefs.current[i]) overlayRefs.current[i] = { square: null, vertical: null, story: null };
    return overlayRefs.current[i];
  }

  useEffect(() => {
    if (!open) return;
    setPresetId(null); setFiles([]); setPreviews([]); setStepLog(""); setSubmitting(false);
    setIssues(null); setApplyCta(true);
    validateAccount().then(r => setIssues(r.issues)).catch(e => setIssues([e.message]));

    if (prefillImageUrl) {
      (async () => {
        try {
          const res = await fetch(prefillImageUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
          const file = new File([blob], `criativo-${Date.now()}.${ext}`, { type: blob.type || "image/png" });
          setFiles([file]);
          setPreviews([URL.createObjectURL(file)]);
        } catch (e: any) {
          toast({ title: "Não foi possível carregar a imagem", description: e?.message || String(e), variant: "destructive" });
        }
      })();
    }
  }, [open, prefillImageUrl]);

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

  async function composeFinalFiles(): Promise<File[]> {
    if (!applyCta) return files;
    const out: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const handle = overlayRefs.current[i];
      if (!handle) { out.push(files[i]); continue; }
      try {
        const composite = await handle.toFile(`anuncio-${Date.now()}-${i}.png`);
        out.push(composite);
      } catch {
        out.push(files[i]);
      }
    }
    return out;
  }

  async function handlePublish() {
    if (!presetId || !preset) return toast({ title: "Escolha sua distribuidora", variant: "destructive" });
    if (files.length === 0) return toast({ title: "Adicione pelo menos 1 foto", variant: "destructive" });

    setSubmitting(true);
    try {
      setStepLog("Carregando cidades da distribuidora...");
      let hits = readPresetCache(preset.id);
      if (!hits) {
        const ufPrimary = preset.uf.split("/")[0];
        const fetched = await searchCitiesBulk(preset.cidades.map((name) => ({ name, uf: ufPrimary })));
        hits = (fetched.cities || []).filter((h) => h?.key);
        if (hits.length > 0) writePresetCache(preset.id, hits);
      }
      if (!hits || hits.length === 0) throw new Error("Não consegui carregar as cidades dessa distribuidora");
      const cities = hits.slice(0, 80);

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

      setStepLog("Gerando texto do anúncio com IA...");
      const copy = await generateCopy([`clientes de ${preset.nome}`, ...cities.map((c) => c.name).slice(0, 3)]);
      const finalHeadline = copy.headlines[0] || headline;
      const primary = copy.primary_texts[0] || `Reduza até 20% na conta de luz com energia limpa. Atendimento via WhatsApp.`;
      const description = copy.description || `Sem obra. Sem instalação. Sem fidelidade.`;

      setStepLog(applyCta ? "Aplicando selo e CTA nas fotos..." : "Preparando fotos...");
      const finalFiles = await composeFinalFiles();

      setStepLog("Enviando fotos...");
      const photoUrls = await uploadAdPhotos(consultantId, finalFiles);

      setStepLog("Publicando campanha no Facebook...");
      await createCampaign({
        name: `iGreen — ${preset.nome}`,
        cities: cities.map((c) => ({ key: c.key, name: c.name })),
        daily_budget_cents: 3000,
        duration_days: null,
        photos: photoUrls.map((url) => ({ url, format: "square" as const })),
        headline: finalHeadline, primary_text: primary, description,
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
            <section className="space-y-3">
              <div className="text-sm font-bold text-foreground">2. Adicione 1 a 4 fotos do seu anúncio</div>

              <div className="border-2 border-dashed rounded-xl p-5 text-center">
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                  onChange={(e) => { pickFiles(e.target.files); if (e.currentTarget) e.currentTarget.value = ""; }} />
                <button type="button" disabled={submitting || files.length >= 4}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary disabled:opacity-50">
                  <Upload className="w-4 h-4" /> Clique para enviar fotos ({files.length}/4)
                </button>
                <div className="text-[11px] text-muted-foreground mt-1">
                  JPG/PNG/WebP até 8 MB. Use foto real de família, casa, conta de luz ou painel solar.
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Dica: gere a imagem base no ChatGPT/Canva e suba aqui — nós aplicamos o selo e o CTA do WhatsApp por cima.
                </div>
              </div>

              {/* Toggle CTA */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-primary" /> Aplicar selo + CTA do WhatsApp
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Adiciona headline, comparativo de economia e botão "Quero economizar →" por cima das suas fotos. Recomendado.
                  </p>
                </div>
                <Switch checked={applyCta} onCheckedChange={setApplyCta} disabled={submitting} />
              </div>

              {/* Previews com ou sem overlay */}
              {previews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {previews.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                      {applyCta ? (
                        <CreativeOverlay
                          ref={(h) => { overlayRefs.current[i] = h; }}
                          imageUrl={url}
                          format="feed_1x1"
                          headline={headline}
                          badge={badge}
                          className="w-full h-full"
                        />
                      ) : (
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      )}
                      <button type="button" onClick={() => removePhoto(i)} disabled={submitting}
                        className="absolute top-1 right-1 z-10 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground">
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

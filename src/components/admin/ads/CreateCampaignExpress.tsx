import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Upload, X, Wand2, ImageIcon, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CityHit, createCampaign, generateCopy, preflightCampaign, searchCitiesBulk,
  uploadAdPhotos, validateAccount,
} from "@/services/facebookAds";
import { DISTRIBUIDORAS_PRESETS, type DistribuidoraPreset } from "@/data/distribuidoraPresets";

interface Props {
  open: boolean;
  onClose: () => void;
  consultantId: string;
  onCreated?: () => void;
  onSwitchAdvanced?: () => void;
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

export function CreateCampaignExpress({ open, onClose, consultantId, onCreated, onSwitchAdvanced }: Props) {
  const { toast } = useToast();
  const [issues, setIssues] = useState<string[] | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [stepLog, setStepLog] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPresetId(null); setFiles([]); setPreviews([]); setStepLog(""); setSubmitting(false);
    setIssues(null);
    validateAccount().then(r => setIssues(r.issues)).catch(e => setIssues([e.message]));
  }, [open]);

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

  const blockingIssues: string[] = [];
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
        ) : visibleIssues.length > 0 ? (
          <Card className="p-4 border-warning/50 bg-warning/5">
            <h4 className="font-bold text-warning mb-2">Validação em andamento</h4>
            <ul className="text-sm space-y-1 list-disc list-inside text-destructive/90">
              {visibleIssues.map((i, idx) => <li key={idx}>{i}</li>)}
            </ul>
          </Card>
        ) : (
          <div className="space-y-5">
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
              <div className="text-sm font-bold text-foreground">2. Adicione 1 a 4 fotos do seu trabalho</div>
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
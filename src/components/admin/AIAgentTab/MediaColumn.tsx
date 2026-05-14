import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  FileAudio,
  FileVideo,
  FileImage,
  FileText,
  Globe,
  User,
  Tag,
  Pencil,
  Play,
  Eye,
  Star,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type Kind = "audio" | "video" | "image" | "document" | "text";
type Media = {
  id: string;
  consultant_id: string | null;
  is_public: boolean;
  kind: Kind;
  label: string;
  url: string | null;
  text_content: string | null;
  active: boolean;
  priority: number;
  step_tags: string[];
  intent_tags: string[];
  is_primary_explainer?: boolean | null;
};

const STEP_OPTIONS: { value: string; label: string }[] = [
  { value: "abertura", label: "Boas-vindas" },
  { value: "descoberta", label: "Descoberta" },
  { value: "pitch", label: "Apresentar economia" },
  { value: "prova_social", label: "Prova social / depoimento" },
  { value: "objecao_preco", label: "Objeção: preço" },
  { value: "objecao_confianca", label: "Objeção: é golpe?" },
  { value: "objecao_burocracia", label: "Objeção: burocracia" },
  { value: "fechamento", label: "Fechamento" },
  { value: "pedir_documento", label: "Pedir documento" },
  { value: "followup", label: "Follow-up (lead sumiu)" },
  { value: "any", label: "Qualquer momento" },
];

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos os perfis" },
  { value: "conta_alta", label: "Conta alta (>R$500)" },
  { value: "conta_media", label: "Conta média (R$200–500)" },
  { value: "conta_baixa", label: "Conta baixa (<R$200)" },
  { value: "lead_frio", label: "Lead frio (>3 dias)" },
];

const QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB

function detectKind(file: File): Kind {
  const t = file.type;
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("image/")) return "image";
  return "document";
}

function iconFor(kind: Kind) {
  const cls = "w-4 h-4";
  switch (kind) {
    case "audio":
      return <FileAudio className={`${cls} text-blue-400`} />;
    case "video":
      return <FileVideo className={`${cls} text-purple-400`} />;
    case "image":
      return <FileImage className={`${cls} text-amber-400`} />;
    case "text":
      return <FileText className={`${cls} text-emerald-400`} />;
    default:
      return <FileText className={`${cls} text-muted-foreground`} />;
  }
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function EditableLabel({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group/lbl flex items-center gap-1 text-sm text-foreground truncate w-full text-left hover:text-primary transition-colors"
        title="Clique para renomear"
      >
        <span className="truncate">{value}</span>
        <Pencil className="w-3 h-3 opacity-0 group-hover/lbl:opacity-60 shrink-0" />
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); onSave(draft); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className="w-full text-sm bg-background border border-primary/40 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

export function MediaColumn({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [view, setView] = useState<"mine" | "public">("mine");
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [usedBytes, setUsedBytes] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<Media | null>(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadList() {
    setLoading(true);
    const q = supabase.from("ai_media_library").select("*");
    const { data } =
      view === "mine"
        ? await q.eq("consultant_id", userId).order("priority", { ascending: false }).order("created_at", { ascending: false })
        : await q.eq("is_public", true).order("priority", { ascending: false }).order("created_at", { ascending: false });
    setItems((data as any) || []);
    setLoading(false);
  }

  async function loadUsage() {
    const { data } = await supabase.storage.from("ai-agent-media").list(userId, { limit: 1000 });
    const total = (data || []).reduce((s, f: any) => s + (f.metadata?.size || 0), 0);
    setUsedBytes(total);
  }

  useEffect(() => {
    loadList();
  }, [view, userId]);
  useEffect(() => {
    loadUsage();
  }, [userId]);

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const file of arr) {
        if (file.size + usedBytes > QUOTA_BYTES) {
          toast({
            title: "Limite atingido",
            description: "Você atingiu 100 MB de armazenamento.",
            variant: "destructive",
          });
          break;
        }
        const kind = detectKind(file);
        const ext = file.name.split(".").pop() || "bin";
        const safeName = file.name.replace(/\.[^.]+$/, "").replace(/\W+/g, "_").slice(0, 60);
        const path = `${userId}/${Date.now()}-${safeName}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("ai-agent-media")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("ai-agent-media").getPublicUrl(path);
        const { error: insErr } = await supabase.from("ai_media_library").insert({
          consultant_id: userId,
          is_public: false,
          kind,
          label: file.name,
          url: pub.publicUrl,
          step_tags: ["any"],
          intent_tags: [],
          active: true,
          priority: 10,
        });
        if (insErr) throw insErr;
      }
      toast({ title: "✅ Mídia adicionada" });
      await Promise.all([loadList(), loadUsage()]);
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(m: Media, v: boolean) {
    await supabase.from("ai_media_library").update({ active: v }).eq("id", m.id);
    loadList();
  }

  async function remove(m: Media) {
    if (!confirm(`Excluir "${m.label}"?`)) return;
    if (m.url && m.consultant_id === userId) {
      // best effort: derive storage path from public URL
      const marker = "/ai-agent-media/";
      const idx = m.url.indexOf(marker);
      if (idx >= 0) {
        const path = decodeURIComponent(m.url.substring(idx + marker.length));
        await supabase.storage.from("ai-agent-media").remove([path]);
      }
    }
    await supabase.from("ai_media_library").delete().eq("id", m.id);
    await Promise.all([loadList(), loadUsage()]);
  }

  async function cloneToMine(m: Media) {
    const { error } = await supabase.rpc("fork_public_ai_media" as any, { _media_id: m.id });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "✅ Adicionado à sua biblioteca" });
      setView("mine");
    }
  }

  async function updateTags(m: Media, patch: Partial<Pick<Media, "step_tags" | "intent_tags">>) {
    const { error } = await supabase
      .from("ai_media_library")
      .update(patch)
      .eq("id", m.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
  }

  async function updateLabel(m: Media, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === m.label) return;
    const { error } = await supabase.from("ai_media_library").update({ label: trimmed }).eq("id", m.id);
    if (error) { toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" }); return; }
    setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, label: trimmed } : x)));
  }

  async function updatePriority(m: Media, value: number) {
    const v = Number.isFinite(value) ? Math.max(0, Math.min(999, Math.trunc(value))) : 0;
    if (v === m.priority) return;
    const { error } = await supabase.from("ai_media_library").update({ priority: v }).eq("id", m.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setItems((prev) => {
      const next = prev.map((x) => (x.id === m.id ? { ...x, priority: v } : x));
      return next.sort((a, b) => b.priority - a.priority);
    });
  }

  async function togglePrimary(m: Media) {
    const next = !m.is_primary_explainer;
    if (next) {
      // Desmarca qualquer outro vídeo principal deste consultor (índice único exige isso).
      await supabase
        .from("ai_media_library")
        .update({ is_primary_explainer: false } as any)
        .eq("consultant_id", userId)
        .eq("is_primary_explainer", true);
    }
    const { error } = await supabase
      .from("ai_media_library")
      .update({ is_primary_explainer: next } as any)
      .eq("id", m.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({
      title: next ? "⭐ Vídeo principal definido" : "Vídeo principal removido",
      description: next ? `"${m.label}" será enviado primeiro quando o lead pedir explicação.` : undefined,
    });
    setItems((prev) =>
      prev.map((x) => {
        if (x.id === m.id) return { ...x, is_primary_explainer: next };
        if (next && x.consultant_id === userId) return { ...x, is_primary_explainer: false };
        return x;
      })
    );
  }

  function TagEditor({ m }: { m: Media }) {
    const stepTags = m.step_tags || [];
    const intentTags = m.intent_tags || [];
    const summary =
      stepTags.length === 0
        ? "Sem tags"
        : stepTags
            .map((t) => STEP_OPTIONS.find((o) => o.value === t)?.label || t)
            .slice(0, 2)
            .join(", ") + (stepTags.length > 2 ? ` +${stepTags.length - 2}` : "");
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors max-w-[150px] truncate"
            title="Configurar quando enviar"
          >
            <Tag className="w-3 h-3 shrink-0" />
            <span className="truncate">{summary}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 space-y-3" align="end">
          <div>
            <p className="text-xs font-semibold mb-2 text-foreground">Quando enviar?</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {STEP_OPTIONS.map((opt) => {
                const checked = stepTags.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v
                          ? [...stepTags, opt.value]
                          : stepTags.filter((t) => t !== opt.value);
                        updateTags(m, { step_tags: next });
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold mb-2 text-foreground">Para qual perfil?</p>
            <div className="space-y-1.5">
              {INTENT_OPTIONS.map((opt) => {
                const checked = intentTags.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v
                          ? [...intentTags, opt.value]
                          : intentTags.filter((t) => t !== opt.value);
                        updateTags(m, { intent_tags: next });
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  const usagePct = Math.min(100, (usedBytes / QUOTA_BYTES) * 100);

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-2xl overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="font-semibold text-foreground">Mídias</h3>
          <p className="text-xs text-muted-foreground">Arquivos que o agente pode enviar nas conversas</p>
        </div>
        <Button
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Nova
        </Button>
      </header>

      <div className="px-5 pt-4">
        <div className="inline-flex items-center gap-1 p-1 bg-muted/40 rounded-lg border border-border/60">
          <button
            onClick={() => setView("mine")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
              view === "mine" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="w-3.5 h-3.5" /> Minhas
          </button>
          <button
            onClick={() => setView("public")}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
              view === "public" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Públicas
          </button>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          <UploadCloud className="w-7 h-7 text-muted-foreground" />
          <p className="text-sm text-foreground font-medium">Arraste ou clique</p>
          <p className="text-xs text-muted-foreground">PNG, JPG, PDF, MP3, MP4 — máx. 50 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-foreground">Armazenamento</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtBytes(usedBytes)} / 100 MB
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${usagePct > 85 ? "bg-red-400" : "bg-primary"}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-5 pb-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma mídia ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((m) => {
              const isMine = m.consultant_id === userId;
              return (
              <li
                key={m.id}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/40 transition-colors"
              >
                {m.url && (m.kind === "image" || m.kind === "video") ? (
                  <button
                    onClick={() => setPreviewMedia(m)}
                    className="relative w-10 h-10 rounded-md overflow-hidden bg-muted/40 border border-border/60 shrink-0 group/thumb"
                    title="Pré-visualizar"
                  >
                    {m.kind === "image" ? (
                      <img src={m.url} alt={m.label} className="w-full h-full object-cover" />
                    ) : (
                      <video src={m.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                  </button>
                ) : (
                  <span className="w-10 h-10 rounded-md bg-muted/40 border border-border/60 shrink-0 flex items-center justify-center">
                    {iconFor(m.kind)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  {isMine ? (
                    <EditableLabel value={m.label} onSave={(v) => updateLabel(m, v)} />
                  ) : (
                    <p className="text-sm text-foreground truncate">{m.label}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground uppercase">{m.kind} · prio {m.priority}</p>
                </div>
                {m.url && (
                  <button
                    onClick={() => setPreviewMedia(m)}
                    className="text-muted-foreground hover:text-primary p-1 transition-colors"
                    aria-label="Pré-visualizar"
                    title="Ver mídia"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                {view === "mine" ? (
                  <>
                    <Input
                      type="number"
                      min={0}
                      max={999}
                      defaultValue={m.priority}
                      key={`${m.id}-${m.priority}`}
                      onBlur={(e) => updatePriority(m, parseInt(e.target.value, 10))}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="h-6 w-12 text-[10px] px-1.5 text-center"
                      title="Prioridade (maior = enviado primeiro)"
                    />
                    <TagEditor m={m} />
                    <Switch
                      checked={m.active}
                      onCheckedChange={(v) => toggleActive(m, v)}
                      className="scale-75"
                    />
                    <button
                      onClick={() => remove(m)}
                      className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => cloneToMine(m)} className="h-7 text-xs">
                    Clonar
                  </Button>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!previewMedia} onOpenChange={(o) => !o && setPreviewMedia(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base truncate pr-6">{previewMedia?.label}</DialogTitle>
          </DialogHeader>
          {previewMedia?.url && (
            <div className="w-full rounded-lg overflow-hidden bg-black/40">
              {previewMedia.kind === "video" && (
                <video src={previewMedia.url} controls autoPlay playsInline className="w-full max-h-[70vh]" />
              )}
              {previewMedia.kind === "audio" && (
                <audio src={previewMedia.url} controls autoPlay className="w-full p-4" />
              )}
              {previewMedia.kind === "image" && (
                <img src={previewMedia.url} alt={previewMedia.label} className="w-full max-h-[70vh] object-contain" />
              )}
              {previewMedia.kind === "document" && (
                <iframe src={previewMedia.url} className="w-full h-[70vh] bg-white" title={previewMedia.label} />
              )}
            </div>
          )}
          {previewMedia?.url && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <a
                href={previewMedia.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary truncate"
              >
                Abrir em nova aba
              </a>
              <Button size="sm" variant="outline" onClick={() => setPreviewMedia(null)}>
                Fechar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
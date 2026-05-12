import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
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

export function MediaColumn({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [view, setView] = useState<"mine" | "public">("mine");
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [usedBytes, setUsedBytes] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadList() {
    setLoading(true);
    const q = supabase.from("ai_media_library").select("*");
    const { data } =
      view === "mine"
        ? await q.eq("consultant_id", userId).order("created_at", { ascending: false })
        : await q.eq("is_public", true).order("created_at", { ascending: false });
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
          priority: 0,
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
    const { error } = await supabase.from("ai_media_library").insert({
      consultant_id: userId,
      is_public: false,
      kind: m.kind,
      label: m.label,
      url: m.url,
      text_content: m.text_content,
      step_tags: ["any"],
      intent_tags: [],
      active: true,
      priority: m.priority,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "✅ Copiado para sua biblioteca" });
      setView("mine");
    }
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
            {items.map((m) => (
              <li
                key={m.id}
                className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/40 transition-colors"
              >
                {iconFor(m.kind)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{m.label}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{m.kind}</p>
                </div>
                {view === "mine" ? (
                  <>
                    <Badge
                      variant={m.active ? "default" : "outline"}
                      className={`text-[10px] ${m.active ? "bg-primary/15 text-primary border-primary/20" : ""}`}
                    >
                      {m.active ? "Ativo" : "Off"}
                    </Badge>
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
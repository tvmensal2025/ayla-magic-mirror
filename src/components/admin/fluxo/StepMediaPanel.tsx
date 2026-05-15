import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Mic, Image as ImageIcon, Video, Trash2, Upload, ArrowUp, ArrowDown, Loader2, Library, Check } from "lucide-react";
import { toast } from "sonner";

type Kind = "audio" | "image" | "video";
type Media = {
  id: string;
  kind: Kind;
  label: string;
  url: string | null;
  storage_path: string | null;
  slot_key: string | null;
  send_order: number;
  duration_sec: number | null;
  delay_before_ms?: number | null;
};

const ACCEPT: Record<Kind, string> = {
  audio: "audio/*",
  image: "image/*",
  video: "video/*",
};

const KIND_LABEL: Record<Kind, string> = {
  audio: "Áudios",
  image: "Imagens",
  video: "Vídeos",
};

const KIND_ICON: Record<Kind, React.ComponentType<{ className?: string }>> = {
  audio: Mic,
  image: ImageIcon,
  video: Video,
};

const MAX_BYTES: Record<Kind, number> = {
  audio: 10 * 1024 * 1024,
  image: 8 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

interface Props {
  consultantId: string;
  stepKey: string;
  slotKeys: string[];
  // Ordem padrão para este passo. Pode ser sobrescrita por consultant.flow_step_media_order[stepKey]
  defaultOrder?: ("audio" | "image" | "video" | "text")[];
  initialOrder?: ("audio" | "image" | "video" | "text")[];
  onOrderChange?: (order: ("audio" | "image" | "video" | "text")[]) => void;
}

const DEFAULT_ORDER: ("audio" | "image" | "video" | "text")[] = ["audio", "image", "video", "text"];

export default function StepMediaPanel({ consultantId, stepKey, slotKeys, initialOrder, onOrderChange }: Props) {
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<("audio" | "image" | "video" | "text")[]>(initialOrder ?? DEFAULT_ORDER);
  const [savingOrder, setSavingOrder] = useState(false);
  const fileInputs = useRef<Record<Kind, HTMLInputElement | null>>({ audio: null, image: null, video: null });
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [pickerKind, setPickerKind] = useState<Kind | null>(null);
  const [libraryItems, setLibraryItems] = useState<Media[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  async function openLibrary(kind: Kind) {
    setPickerKind(kind);
    setLoadingLibrary(true);
    // Inclui mídias do próprio consultor + públicas (Super Admin)
    const { data } = await supabase
      .from("ai_media_library")
      .select("id, kind, label, url, storage_path, slot_key, send_order, duration_sec, delay_before_ms, consultant_id, is_public")
      .or(`consultant_id.eq.${consultantId},and(consultant_id.is.null,is_public.eq.true)`)
      .eq("kind", kind)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(200);
    const existingUrls = new Set(items.filter(i => i.kind === kind).map(i => i.url));
    setLibraryItems(((data as any[]) ?? []).filter(m => !existingUrls.has(m.url)) as Media[]);
    setLoadingLibrary(false);
  }

  async function linkFromLibrary(m: Media) {
    const slotKey = slotKeys[0];
    if (!slotKey) return;
    setLinking(m.id);
    // Permite múltiplas mídias por passo: NÃO desativa as existentes.
    // Apenas anexa esta nova mídia ao slot, com send_order incremental.
    const { data: row, error } = await supabase
      .from("ai_media_library")
      .insert({
        consultant_id: consultantId,
        kind: m.kind,
        label: m.label,
        slot_key: slotKey,
        url: m.url,
        storage_path: null,
        active: true,
        is_public: false,
        send_order: 100 + items.length,
        duration_sec: m.duration_sec,
        delay_before_ms: 1500,
      })
      .select("id, kind, label, url, storage_path, slot_key, send_order, duration_sec, delay_before_ms")
      .maybeSingle();
    setLinking(null);
    if (error) { toast.error("Erro ao vincular: " + error.message); return; }
    if (row) {
      setItems(prev => [...prev, row as Media]);
      setLibraryItems(prev => prev.filter(x => x.id !== m.id));
    }
    toast.success("Mídia adicionada ao passo");
  }


  useEffect(() => {
    if (!slotKeys.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("ai_media_library")
        .select("id, kind, label, url, storage_path, slot_key, send_order, duration_sec, delay_before_ms")
        .eq("consultant_id", consultantId)
        .eq("active", true)
        .in("slot_key", slotKeys)
        .order("send_order", { ascending: true });
      if (!error) setItems((data as Media[]) ?? []);
      setLoading(false);
    })();
  }, [consultantId, slotKeys.join("|")]);

  function group(kind: Kind) {
    return items.filter(i => i.kind === kind);
  }

  async function moveOrder(idx: number, dir: -1 | 1) {
    const next = [...order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
    setSavingOrder(true);
    const { data: cons } = await supabase.from("consultants").select("flow_step_media_order").eq("id", consultantId).maybeSingle();
    const map = (cons?.flow_step_media_order as Record<string, string[]>) ?? {};
    map[stepKey] = next;
    const { error } = await supabase.from("consultants").update({ flow_step_media_order: map }).eq("id", consultantId);
    setSavingOrder(false);
    if (error) toast.error("Erro ao salvar ordem: " + error.message);
    else onOrderChange?.(next);
  }

  async function handleUpload(kind: Kind, file: File, slotKey: string) {
    if (file.size > MAX_BYTES[kind]) {
      toast.error(`Arquivo grande demais (máx ${MAX_BYTES[kind] / 1024 / 1024}MB)`);
      return;
    }
    setUploading(kind);
    const ext = file.name.split(".").pop() || "bin";
    const path = `${consultantId}/${slotKey}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("ai-agent-media").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (upErr) {
      setUploading(null);
      toast.error("Falha no upload: " + upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("ai-agent-media").getPublicUrl(path);
    const { data: row, error: insErr } = await supabase
      .from("ai_media_library")
      .insert({
        consultant_id: consultantId,
        kind,
        label: file.name.slice(0, 80),
        slot_key: slotKey,
        url: pub.publicUrl,
        storage_path: path,
        active: true,
        send_order: 100 + items.length,
        delay_before_ms: 1500,
      })
      .select("id, kind, label, url, storage_path, slot_key, send_order, duration_sec, delay_before_ms")
      .maybeSingle();
    setUploading(null);
    if (insErr) {
      toast.error("Erro ao salvar: " + insErr.message);
      return;
    }
    if (row) setItems(prev => [...prev, row as Media]);
    toast.success("Mídia adicionada");
  }

  async function removeMedia(m: Media) {
    if (!confirm(`Remover "${m.label}"?`)) return;
    const { error } = await supabase.from("ai_media_library").update({ active: false }).eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (m.storage_path) {
      await supabase.storage.from("ai-agent-media").remove([m.storage_path]);
    }
    setItems(prev => prev.filter(x => x.id !== m.id));
    toast.success("Mídia removida");
  }

  function renderMediaItem(m: Media) {
    const Icon = KIND_ICON[m.kind];
    return (
      <div key={m.id} className="rounded-md border border-border/60 bg-muted/20 p-2 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{m.label}</div>
              <div className="text-[10px] text-muted-foreground">slot: {m.slot_key}</div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMedia(m)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        {m.url && m.kind === "audio" && <audio controls src={m.url} className="w-full h-8" />}
        {m.url && m.kind === "image" && <img src={m.url} alt={m.label} className="w-full max-h-32 object-cover rounded" />}
        {m.url && m.kind === "video" && <video controls src={m.url} className="w-full max-h-40 rounded" />}
      </div>
    );
  }

  function renderKindBlock(kind: Kind) {
    const list = group(kind);
    const Icon = KIND_ICON[kind];
    const slotForUpload = slotKeys[0];
    return (
      <div key={kind} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[kind]}
            </span>
            <Badge variant="secondary" className="text-[10px] h-4">{list.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={!slotForUpload}
              onClick={() => openLibrary(kind)}
              title="Usar mídia já salva na sua biblioteca"
            >
              <Library className="h-3 w-3 mr-1" />
              Biblioteca
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={uploading === kind || !slotForUpload}
              onClick={() => fileInputs.current[kind]?.click()}
            >
              {uploading === kind ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
              Enviar
            </Button>
          </div>
          <input
            ref={el => (fileInputs.current[kind] = el)}
            type="file"
            accept={ACCEPT[kind]}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f && slotForUpload) handleUpload(kind, f, slotForUpload);
              e.target.value = "";
            }}
          />
        </div>
        {list.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{list.map(renderMediaItem)}</div>
        ) : (
          <div className="text-xs text-muted-foreground italic px-1">Nenhum {kind} cadastrado.</div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando mídias…
      </div>
    );
  }

  if (!slotKeys.length) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Mídias deste passo</h4>
      </div>

      {(["audio", "image", "video"] as Kind[]).map(renderKindBlock)}

      {/* Ordem de envio */}
      <div className="rounded-md bg-muted/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ordem de envio
          </div>
          {savingOrder && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {order.map((slot, idx) => (
            <div key={slot} className="flex items-center gap-1">
              <div className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs">
                {slot === "audio" && <Mic className="h-3 w-3" />}
                {slot === "image" && <ImageIcon className="h-3 w-3" />}
                {slot === "video" && <Video className="h-3 w-3" />}
                {slot === "text" && <span className="text-[10px]">💬</span>}
                <span className="capitalize">{slot}</span>
                <div className="flex flex-col -my-0.5">
                  <button
                    onClick={() => moveOrder(idx, -1)}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-2.5 w-2.5" />
                  </button>
                  <button
                    onClick={() => moveOrder(idx, 1)}
                    disabled={idx === order.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
              {idx < order.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Define em que ordem a Camila envia as mídias e o texto deste passo.
        </p>
      </div>

      <Dialog open={!!pickerKind} onOpenChange={(o) => !o && setPickerKind(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sua biblioteca de {pickerKind && KIND_LABEL[pickerKind].toLowerCase()}</DialogTitle>
            <DialogDescription>
              Toque em uma mídia para vincular a este passo. Não duplica arquivos — usa o mesmo que você já enviou.
            </DialogDescription>
          </DialogHeader>
          {loadingLibrary ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : libraryItems.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-8 text-center">
              Nenhuma mídia disponível na biblioteca. Envie uma nova pelo botão "Enviar".
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {libraryItems.map(m => (
                <button
                  key={m.id}
                  onClick={() => linkFromLibrary(m)}
                  disabled={!!linking}
                  className="text-left rounded-md border border-border/60 bg-muted/20 p-2 hover:bg-muted/40 transition disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-xs font-medium truncate">{m.label}</div>
                    {linking === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  {m.url && m.kind === "audio" && <audio controls src={m.url} className="w-full h-8" onClick={e => e.stopPropagation()} />}
                  {m.url && m.kind === "image" && <img src={m.url} alt={m.label} className="w-full max-h-32 object-cover rounded" />}
                  {m.url && m.kind === "video" && <video controls src={m.url} className="w-full max-h-40 rounded" onClick={e => e.stopPropagation()} />}
                  {m.slot_key && <div className="text-[10px] text-muted-foreground mt-1">já usada em: {m.slot_key}</div>}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerKind(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

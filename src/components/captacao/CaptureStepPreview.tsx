import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Mic, ImageIcon, Video, FileText } from "lucide-react";

interface StepLike {
  id: string;
  title: string | null;
  step_key: string | null;
  message_text: string | null;
  media_order: unknown;
  variant: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  consultantId: string;
  customerId: string;
  step: StepLike | null;
  /** Optional: all available variants for this step (A/B/C). If provided, chips appear in header to switch. */
  variants?: Record<string, StepLike>;
  /** Called when user changes the selected variant via chips. */
  onVariantChange?: (variant: string) => void;
  onSend: () => void;
  sending?: boolean;
}

interface MediaItem {
  id: string;
  kind: string;
  url: string;
  duration_sec?: number | null;
  transcript?: string | null;
  label?: string | null;
  send_order?: number | null;
}

const VARIANT_HINT: Record<string, string> = {
  A: "com áudio",
  B: "só texto",
  C: "com vídeo",
};

export function CaptureStepPreview({ open, onOpenChange, consultantId, customerId, step, variants, onVariantChange, onSend, sending }: Props) {
  const [medias, setMedias] = useState<MediaItem[]>([]);
  const [renderedText, setRenderedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [skippedAudios, setSkippedAudios] = useState(0);

  useEffect(() => {
    if (!open || !step) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      const { data: cust } = await supabase
        .from("customers")
        .select("name, electricity_bill_value")
        .eq("id", customerId).maybeSingle();
      const firstName = String(cust?.name || "").trim().split(/\s+/)[0] || "amigo";
      const bill = Number(cust?.electricity_bill_value || 0);
      const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const vars: Record<string, string> = {
        "{{nome}}": firstName, "{nome}": firstName,
        "{{nome_completo}}": String(cust?.name || ""), "{nome_completo}": String(cust?.name || ""),
        "{{valor}}": fmt(bill), "{valor}": fmt(bill),
        "{{economia_mensal}}": fmt(bill * 0.2), "{economia_mensal}": fmt(bill * 0.2),
        "{{economia_anual}}": fmt(bill * 0.2 * 12), "{economia_anual}": fmt(bill * 0.2 * 12),
      };
      const apply = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
      const txt = step.message_text ? apply(String(step.message_text)) : "";

      const slotKey = step.step_key;
      let rows: MediaItem[] = [];
      if (slotKey) {
        const { data: mediaRows } = await supabase
          .from("ai_media_library")
          .select("id, kind, url, slot_key, send_order, duration_sec, transcript, label")
          .eq("consultant_id", consultantId)
          .eq("slot_key", slotKey)
          .eq("active", true)
          .eq("is_draft", false)
          .order("send_order", { ascending: true });
        rows = ((mediaRows as any[]) || []).filter((m) => !!m?.url);
      }

      let skipped = 0;
      if (step.variant === "B") {
        const before = rows.length;
        rows = rows.filter((m) => String(m.kind).toLowerCase() !== "audio");
        skipped = before - rows.length;
      }

      if (!mounted) return;
      setMedias(rows);
      setRenderedText(txt);
      setSkippedAudios(skipped);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [open, step, customerId, consultantId]);

  if (!step) return null;

  const orderedMedias = (() => {
    const order = Array.isArray(step.media_order) && (step.media_order as string[]).length
      ? (step.media_order as string[]).map((k) => String(k).toLowerCase())
      : ["audio", "image", "video", "text", "document"];
    return [...medias].sort((a, b) => {
      const ia = order.indexOf(a.kind); const ib = order.indexOf(b.kind);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  })();

  const variantKeys = variants ? Object.keys(variants).sort() : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 pb-2 border-b border-border space-y-2">
          <DialogTitle className="text-sm flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
              Variante {step.variant}
            </span>
            <span className="truncate">{step.title || step.step_key}</span>
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">Prévia exata do que o cliente vai receber</p>
          {variantKeys.length > 1 && onVariantChange && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground">Variante:</span>
              {variantKeys.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onVariantChange(v)}
                  className={`px-2.5 h-7 rounded-full text-[11px] font-bold border transition-colors ${
                    v === step.variant
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/50"
                  }`}
                  title={VARIANT_HINT[v] || ""}
                >
                  {v} <span className="opacity-70 font-normal">{VARIANT_HINT[v] || ""}</span>
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="p-4 space-y-3 bg-muted/20">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          )}

          {!loading && skippedAudios > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              ℹ️ Variante B (texto puro): {skippedAudios} áudio{skippedAudios > 1 ? "s" : ""} ignorado{skippedAudios > 1 ? "s" : ""}. Escreva a versão em texto no campo do passo em <span className="font-semibold">/admin/fluxos</span>.
            </div>
          )}

          {!loading && orderedMedias.length === 0 && !renderedText && (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              Nenhuma mídia ou texto configurado para essa variante.
            </p>
          )}

          {!loading && orderedMedias.map((m) => {
            const kind = String(m.kind).toLowerCase();
            return (
              <div key={m.id} className="rounded-lg bg-card border border-border p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-semibold">
                  {kind === "audio" && <Mic className="w-3 h-3 text-emerald-500" />}
                  {kind === "image" && <ImageIcon className="w-3 h-3 text-amber-500" />}
                  {kind === "video" && <Video className="w-3 h-3 text-cyan-500" />}
                  {kind === "text" && <FileText className="w-3 h-3" />}
                  {kind} {m.label ? `· ${m.label}` : ""}
                </div>
                {kind === "audio" && m.url && (
                  <audio src={m.url} controls className="w-full" />
                )}
                {kind === "image" && m.url && (
                  <img src={m.url} alt={m.label || "preview"} className="w-full rounded-md max-h-64 object-contain bg-black/20" />
                )}
                {kind === "video" && m.url && (
                  <video src={m.url} controls className="w-full rounded-md max-h-64 bg-black/30" preload="metadata" />
                )}
                {kind === "text" && (m as any).transcript && (
                  <p className="text-xs whitespace-pre-wrap text-foreground/90 italic">"{(m as any).transcript}"</p>
                )}
              </div>
            );
          })}

          {!loading && renderedText && (
            <div className="rounded-lg bg-[#005c4b]/90 text-white p-3 ml-6 shadow-sm">
              <div className="flex items-center gap-1.5 text-[10px] opacity-80 uppercase font-semibold mb-1">
                <FileText className="w-3 h-3" /> mensagem
              </div>
              <p className="text-sm whitespace-pre-wrap leading-snug">{renderedText}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border bg-card sticky bottom-0">
          <Button
            className="w-full h-11 gap-2 font-bold"
            onClick={onSend}
            disabled={sending}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar variante {step.variant} agora
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

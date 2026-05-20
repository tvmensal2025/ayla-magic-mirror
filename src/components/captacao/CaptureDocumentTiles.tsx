import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, RefreshCw, FileImage } from "lucide-react";
import { fireMiniConfetti } from "@/lib/captureGame";

type DocKey = "document_front_url" | "document_back_url" | "electricity_bill_photo_url";

interface DocSlot {
  key: DocKey;
  label: string;
  hint: string;
}

const SLOTS: DocSlot[] = [
  { key: "document_front_url", label: "RG/CNH Frente", hint: "Foto nítida da frente" },
  { key: "document_back_url", label: "RG/CNH Verso", hint: "Foto nítida do verso" },
  { key: "electricity_bill_photo_url", label: "Conta de Energia", hint: "Foto ou PDF da fatura" },
];

interface Props {
  customerId: string;
  customer: Record<string, any>;
  onUploaded: (key: DocKey, url: string) => Promise<void> | void;
}

export function CaptureDocumentTiles({ customerId, customer, onUploaded }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<DocKey | null>(null);
  const inputs = useRef<Record<DocKey, HTMLInputElement | null>>({
    document_front_url: null,
    document_back_url: null,
    electricity_bill_photo_url: null,
  });

  const handleFile = async (key: DocKey, file: File) => {
    setBusy(key);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `captacao/${customerId}/${key}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
      await onUploaded(key, pub.publicUrl);
      fireMiniConfetti();
      toast({ title: "📎 Documento anexado", duration: 1500 });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="px-3 pb-4 pt-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        Documentos do Lead
      </h4>
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.map((s) => {
          const url = customer?.[s.key] as string | null;
          const isBusy = busy === s.key;
          return (
            <div
              key={s.key}
              className={`rounded-lg border p-2 flex flex-col gap-1.5 transition-all ${
                url ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-card/50"
              }`}
            >
              <input
                ref={(el) => (inputs.current[s.key] = el)}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(s.key, f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={isBusy}
                onClick={() => inputs.current[s.key]?.click()}
                className="relative aspect-square w-full rounded-md overflow-hidden bg-secondary/40 border border-border/50 flex items-center justify-center active:scale-95 transition"
              >
                {isBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : url ? (
                  url.toLowerCase().endsWith(".pdf") ? (
                    <FileImage className="w-7 h-7 text-primary" />
                  ) : (
                    <img src={url} alt={s.label} className="w-full h-full object-cover" />
                  )
                ) : (
                  <Camera className="w-6 h-6 text-muted-foreground/60" />
                )}
                {url && !isBusy && (
                  <span className="absolute bottom-1 right-1 bg-background/80 backdrop-blur rounded-full p-1">
                    <RefreshCw className="w-3 h-3 text-primary" />
                  </span>
                )}
              </button>
              <p className="text-[10px] font-semibold text-center leading-tight">{s.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Banner sticky que aparece no topo do Admin quando há leads aguardando o
// consultor revisar OCR (conta ou documento). Clicar abre um modal com o
// OcrReviewCard pra cada lead pendente.
//
// O bot só pausa a confirmação quando detecta consultor online. Se o
// consultor demorar mais de 5min, o backend cron solta o lead pro fluxo
// automático (manda pro cliente confirmar).

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOcrReviewQueue } from "@/hooks/useOcrReviewQueue";
import { useCaptureSession } from "@/hooks/useCaptureSession";
import { OcrReviewCard } from "./OcrReviewCard";
import { Eye, AlertCircle, Bell } from "lucide-react";

interface Props {
  consultantId: string | null;
}

export function OcrReviewBanner({ consultantId }: Props) {
  const { items, refresh } = useOcrReviewQueue(consultantId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!consultantId || items.length === 0) return null;

  const oldest = items[0];

  return (
    <>
      <div className="sticky top-0 z-40 mx-3 mb-3 rounded-xl border-2 border-amber-400/70 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-transparent backdrop-blur-md shadow-lg shadow-amber-500/20 animate-in slide-in-from-top-2">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
          onClick={() => setOpenId(oldest.customer_id)}
        >
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-lg bg-amber-400/30 border-2 border-amber-400/60 flex items-center justify-center animate-pulse">
              <Bell className="w-4 h-4 text-amber-500" />
            </div>
            {items.length > 1 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 bg-rose-500 text-white border-card border-2 text-[10px]">
                {items.length}
              </Badge>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              {oldest.kind === "bill" ? "Conta de luz" : "Documento"} pronto pra revisar
              {items.length > 1 && (
                <span className="text-[10px] font-normal text-muted-foreground">
                  +{items.length - 1} aguardando
                </span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              <strong>{oldest.customer_name || oldest.phone_whatsapp || "Lead"}</strong> mandou a foto. Clique pra confirmar ou pedir ao cliente confirmar.
            </p>
          </div>
          <Button size="sm" className="shrink-0 gap-1 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold">
            <Eye className="w-3.5 h-3.5" /> Revisar
          </Button>
        </button>
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) { setOpenId(null); void refresh(); } }}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="text-base">Revisar dados do OCR</DialogTitle>
          </DialogHeader>
          {openId && <OcrReviewCardWrapper customerId={openId} onDecided={() => { setOpenId(null); void refresh(); }} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OcrReviewCardWrapper({ customerId, onDecided }: { customerId: string; onDecided: () => void }) {
  const { customer } = useCaptureSession(customerId);
  if (!customer) return <div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>;
  const kind = (customer as any).ocr_review_pending as "bill" | "doc" | null;
  if (!kind) return (
    <div className="p-6 text-center text-sm text-muted-foreground">
      Esse lead já foi tratado. Atualize a página.
    </div>
  );
  return (
    <div className="p-3">
      <OcrReviewCard customer={customer} kind={kind} onDecided={onDecided} />
    </div>
  );
}

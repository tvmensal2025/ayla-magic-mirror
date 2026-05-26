import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface PartnerQrCodeProps {
  open: boolean;
  onClose: () => void;
  partnerName: string;
  keyword: string;
  consultantPhone: string;
  qrPhrase?: string | null;
}

function buildWaMeUrl(
  phone: string,
  keyword: string,
  qrPhrase?: string | null,
): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  const message = qrPhrase || keyword;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function PartnerQrCode({
  open,
  onClose,
  partnerName,
  keyword,
  consultantPhone,
  qrPhrase,
}: PartnerQrCodeProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const phrase = qrPhrase || keyword;
  const url = buildWaMeUrl(consultantPhone, keyword, qrPhrase);

  const handleDownload = () => {
    const svgElement = qrRef.current?.querySelector("svg");
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 600, 600);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 50, 50, 500, 500);
      const a = document.createElement("a");
      a.download = `qrcode-${partnerName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code — {partnerName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div ref={qrRef} className="bg-white rounded-xl p-4">
            <QRCodeSVG value={url} size={220} level="M" />
          </div>

          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Ao escanear, o lead abrirá o WhatsApp com a frase pré-preenchida:
          </p>
          <p className="text-sm font-medium text-center">&quot;{phrase}&quot;</p>
          <p className="text-xs text-muted-foreground break-all text-center">
            {url}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" /> Baixar PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

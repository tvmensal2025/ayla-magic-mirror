import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, Copy, FileText, Loader2 } from "lucide-react";

interface PanfletoModalProps {
  open: boolean;
  onClose: () => void;
  licenca: string;
  nomeConsultor: string;
  telefoneConsultor?: string;
  igreenId?: string;
}

const SUPABASE_URL = "https://zlzasfhcxcznaprrragl.supabase.co";

// Background base: public/images/mutirao-lei-14300.png (853 x 1280).
// Renderizamos em 2x (1706 x 2560) pra ter resolução de gráfica.
const SCALE = 2;
const BG_W = 853;
const BG_H = 1280;
const W = BG_W * SCALE;
const H = BG_H * SCALE;

// Posições (em coords da imagem original 853x1280) dos overlays.
// A imagem base agora não tem QR nem faixa de licenciado — desenhamos tudo
// sobre a área do painel solar (canto inferior esquerdo, fundo escuro).
const QR_BOX = { x: 32, y: 855, size: 170 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      console.error("[panfleto] image load failed:", src, e);
      reject(new Error(`Failed to load ${src}`));
    };
    img.src = src;
  });
}

function formatBrPhone(raw?: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length < 10) return raw;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

async function renderPanfleto(
  canvas: HTMLCanvasElement,
  redirectUrl: string,
  nomeConsultor: string,
  telefoneConsultor: string,
  igreenId: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = W;
  canvas.height = H;

  // 1) Background — panfleto Lei 14.300 (versão limpa, sem QR/licenciado)
  const bg = await loadImage("/images/mutirao-lei-14300-base.jpg");
  ctx.drawImage(bg, 0, 0, W, H);

  // 2) Card branco com borda dourada que comporta QR + nome + telefone
  const qrPad = 8;
  const qrBoxX = (QR_BOX.x - qrPad) * SCALE;
  const qrBoxY = (QR_BOX.y - qrPad) * SCALE;
  const qrBoxW = (QR_BOX.size + qrPad * 2) * SCALE;
  const qrBoxH = (QR_BOX.size + qrPad * 2) * SCALE;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 16 * SCALE;
  ctx.shadowOffsetY = 4 * SCALE;
  ctx.fillStyle = "#d4a017"; // dourado
  ctx.fillRect(
    qrBoxX - 4 * SCALE,
    qrBoxY - 4 * SCALE,
    qrBoxW + 8 * SCALE,
    qrBoxH + 8 * SCALE,
  );
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH);

  // 3) QR personalizado (error correction H pra suportar logo central)
  const qrPx = QR_BOX.size * SCALE;
  const qrDataUrl = await QRCode.toDataURL(redirectUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: qrPx,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
  const qrImg = await loadImage(qrDataUrl);
  const qrX = QR_BOX.x * SCALE;
  const qrY = QR_BOX.y * SCALE;
  ctx.drawImage(qrImg, qrX, qrY, qrPx, qrPx);

  // 4) Faixa verde escura LOGO ACIMA do CTA "QUER SABER COMO?"
  //    com LICENCIADO + ID + WHATSAPP
  const STRIPE_Y = 1040;
  const STRIPE_H = 38;
  const stripeY = STRIPE_Y * SCALE;
  const stripeH = STRIPE_H * SCALE;

  // Faixa principal verde escura
  ctx.fillStyle = "#0d3b1f";
  ctx.fillRect(0, stripeY, W, stripeH);
  // Linha dourada de acento no topo e base
  ctx.fillStyle = "#d4a017";
  ctx.fillRect(0, stripeY, W, 2 * SCALE);
  ctx.fillRect(0, stripeY + stripeH - 2 * SCALE, W, 2 * SCALE);

  const nomeUpper = (nomeConsultor || "CONSULTOR IGREEN").toUpperCase();
  const idLabel = igreenId ? ` • ID ${igreenId}` : "";
  const phoneFmt = formatBrPhone(telefoneConsultor) || "FALE COMIGO";

  ctx.textBaseline = "middle";
  const stripeMidY = stripeY + stripeH / 2;

  // Esquerda: LICENCIADO em dourado
  ctx.fillStyle = "#ffd700";
  ctx.font = `900 ${15 * SCALE}px Montserrat, "Arial Black", sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`LICENCIADO: ${nomeUpper}${idLabel}`, 28 * SCALE, stripeMidY);

  // Direita: WHATSAPP em dourado
  ctx.textAlign = "right";
  ctx.fillText(`WHATSAPP: +55 ${phoneFmt}`, W - 28 * SCALE, stripeMidY);
}

export function PanfletoModal({
  open,
  onClose,
  licenca,
  nomeConsultor,
  telefoneConsultor = "",
  igreenId = "",
}: PanfletoModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(false);
  const [ready, setReady] = useState(false);
  const { toast } = useToast();

  const redirectUrl = `${SUPABASE_URL}/functions/v1/qr-redirect?l=${encodeURIComponent(licenca)}`;

  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el) setReady(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    if (!ready || !canvasRef.current) return;
    setRendering(true);
    renderPanfleto(canvasRef.current, redirectUrl, nomeConsultor, telefoneConsultor, igreenId)
      .catch((e) => {
        console.error("[panfleto] render error", e);
        toast({
          title: "Erro ao gerar panfleto",
          description: String(e?.message || e),
          variant: "destructive",
        });
      })
      .finally(() => setRendering(false));
  }, [open, ready, redirectUrl, nomeConsultor, telefoneConsultor, igreenId, toast]);

  const downloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `panfleto-igreen-${licenca}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast({ title: "✅ PNG baixado!" });
  };

  const downloadPDF = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // A5: 148 x 210 mm — proporção 1:1.42. Nosso canvas é 853:1280 = 1:1.5.
    // Usa formato custom proporcional pra não distorcer.
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [148, 222] });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(imgData, "JPEG", 0, 0, 148, 222);
    pdf.save(`panfleto-igreen-${licenca}.pdf`);
    toast({ title: "✅ PDF baixado!" });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(redirectUrl);
    toast({ title: "✅ Link do redirect copiado!" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-primary" /> Panfleto Mutirão Lei 14.300
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/30 rounded-xl p-4 border border-border">
            <p className="text-sm text-muted-foreground">
              QR único da licença <strong className="text-foreground">{licenca}</strong>. Sempre vai pro
              WhatsApp conectado da sua instância — se trocar de número, o mesmo panfleto continua
              funcionando. Imprima quantos quiser.
            </p>
          </div>

          <div className="relative bg-white rounded-xl border border-border overflow-hidden flex items-center justify-center p-4 min-h-[400px]">
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground bg-white/80 z-10">
                <Loader2 className="w-5 h-5 animate-spin" /> Gerando panfleto…
              </div>
            )}
            <canvas
              ref={setCanvasRef}
              width={W}
              height={H}
              className="max-w-full h-auto shadow-lg"
              style={{ maxHeight: "70vh" }}
            />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={copyLink} className="gap-2">
              <Copy className="w-4 h-4" /> Copiar link
            </Button>
            <Button variant="outline" onClick={downloadPNG} disabled={rendering} className="gap-2">
              <Download className="w-4 h-4" /> Baixar PNG
            </Button>
            <Button onClick={downloadPDF} disabled={rendering} className="gap-2">
              <FileText className="w-4 h-4" /> Baixar PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
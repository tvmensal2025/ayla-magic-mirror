import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Download, Upload, Crosshair, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface PartnerQrCodeProps {
  open: boolean;
  onClose: () => void;
  partnerName: string;
  keyword: string;
  consultantPhone: string;
  qrPhrase?: string | null;
}

/**
 * Build the wa.me URL with the partner's keyword/phrase pre-filled.
 * Phone is normalized to BR format if it doesn't already start with 55.
 */
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

/**
 * Canvas size used for the final exported PNG.
 * Square 1024 keeps things simple; the preview area scales the same ratio.
 */
const CANVAS_SIZE = 1024;
/** Preview size in CSS px on the modal. */
const PREVIEW_SIZE = 360;

/**
 * Draggable QR-over-image editor.
 *
 * Coordinates are expressed in PERCENTAGES of the canvas (0..100) so that
 * the same x/y/size triple renders identically on the preview and the
 * exported high-res PNG. The QR's anchor is its CENTER for intuitive
 * positioning; the renderer translates back to top-left when needed.
 */
export function PartnerQrCode({
  open,
  onClose,
  partnerName,
  keyword,
  consultantPhone,
  qrPhrase,
}: PartnerQrCodeProps) {
  const phrase = qrPhrase || keyword;
  const url = buildWaMeUrl(consultantPhone, keyword, qrPhrase);

  const previewRef = useRef<HTMLDivElement>(null);
  const qrSvgRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Background image (data URL or null = white).
  const [bgImage, setBgImage] = useState<string | null>(null);
  // QR center as % of canvas (default = center, slightly above middle).
  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(60);
  // QR size as % of canvas width (default = 30%).
  const [size, setSize] = useState(30);
  // Drag state.
  const draggingRef = useRef(false);

  // Reset whenever modal opens.
  useEffect(() => {
    if (open) {
      setBgImage(null);
      setPosX(50);
      setPosY(60);
      setSize(30);
    }
  }, [open]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setBgImage(reader.result);
    };
    reader.readAsDataURL(file);
    // Reset input so re-uploading the same file re-triggers onChange.
    e.target.value = "";
  };

  const updatePositionFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const el = previewRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const xPct = ((clientX - rect.left) / rect.width) * 100;
      const yPct = ((clientY - rect.top) / rect.height) * 100;
      setPosX(Math.max(0, Math.min(100, xPct)));
      setPosY(Math.max(0, Math.min(100, yPct)));
    },
    [],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updatePositionFromClient(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updatePositionFromClient(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handleCenter = () => {
    setPosX(50);
    setPosY(50);
  };

  /**
   * Export PNG: draws background + QR into an offscreen canvas at CANVAS_SIZE
   * and triggers a download. Background is letterboxed via "cover" to preserve
   * the aspect ratio without distortion.
   */
  const handleDownload = async () => {
    const svgElement = qrSvgRef.current?.querySelector("svg");
    if (!svgElement) return;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Background.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (bgImage) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // "cover": scale to fill, crop overflow.
          const ratio = Math.max(
            CANVAS_SIZE / img.width,
            CANVAS_SIZE / img.height,
          );
          const w = img.width * ratio;
          const h = img.height * ratio;
          const dx = (CANVAS_SIZE - w) / 2;
          const dy = (CANVAS_SIZE - h) / 2;
          ctx.drawImage(img, dx, dy, w, h);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = bgImage;
      });
    }

    // 2. QR code.
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgUrl =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svgData)));
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const qrPx = (size / 100) * CANVAS_SIZE;
        const cx = (posX / 100) * CANVAS_SIZE;
        const cy = (posY / 100) * CANVAS_SIZE;
        const dx = cx - qrPx / 2;
        const dy = cy - qrPx / 2;
        // White card behind QR for scanability over busy backgrounds.
        const pad = qrPx * 0.06;
        ctx.fillStyle = "#ffffff";
        roundRect(
          ctx,
          dx - pad,
          dy - pad,
          qrPx + pad * 2,
          qrPx + pad * 2,
          qrPx * 0.04,
        );
        ctx.fill();
        ctx.drawImage(img, dx, dy, qrPx, qrPx);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = svgUrl;
    });

    const a = document.createElement("a");
    a.download = `qrcode-${partnerName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const qrPxPreview = (size / 100) * PREVIEW_SIZE;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>QR Code — {partnerName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[auto_1fr] py-2">
          {/* Preview canvas */}
          <div className="flex flex-col items-center gap-3">
            <div
              ref={previewRef}
              role="application"
              aria-label="Editor de posição do QR Code. Arraste o QR sobre a imagem ou use os controles ao lado."
              className="relative overflow-hidden rounded-xl border bg-white shadow-sm"
              style={{
                width: PREVIEW_SIZE,
                height: PREVIEW_SIZE,
                backgroundImage: bgImage ? `url(${bgImage})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div
                ref={qrSvgRef}
                className="absolute select-none touch-none cursor-move bg-white rounded-md p-1.5 shadow-md"
                style={{
                  left: `calc(${posX}% - ${qrPxPreview / 2}px)`,
                  top: `calc(${posY}% - ${qrPxPreview / 2}px)`,
                  width: qrPxPreview,
                  height: qrPxPreview,
                }}
              >
                <QRCodeSVG
                  value={url}
                  size={qrPxPreview - 12}
                  level="M"
                  style={{ display: "block" }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-[360px]">
              Arraste o QR sobre a imagem. Use os controles para ajuste fino.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Imagem de fundo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {bgImage ? "Trocar" : "Enviar imagem"}
                </Button>
                {bgImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBgImage(null)}
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Posição horizontal</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(posX)}%
                </span>
              </div>
              <Slider
                value={[posX]}
                onValueChange={([v]) => setPosX(v)}
                min={0}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Posição vertical</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(posY)}%
                </span>
              </div>
              <Slider
                value={[posY]}
                onValueChange={([v]) => setPosY(v)}
                min={0}
                max={100}
                step={1}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-sm">Tamanho do QR</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(size)}%
                </span>
              </div>
              <Slider
                value={[size]}
                onValueChange={([v]) => setSize(v)}
                min={15}
                max={70}
                step={1}
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCenter}
              className="gap-2 self-start"
            >
              <Crosshair className="h-4 w-4" /> Centralizar
            </Button>

            <div className="text-xs text-muted-foreground space-y-1 mt-1">
              <p>
                Ao escanear, abre WhatsApp com:{" "}
                <span className="font-medium">&quot;{phrase}&quot;</span>
              </p>
              <p className="break-all opacity-70">{url}</p>
            </div>
          </div>
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

/** Helper: rounded rect path (no fill — caller fills). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

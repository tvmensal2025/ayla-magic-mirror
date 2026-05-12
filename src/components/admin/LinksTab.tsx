import { Copy, Globe, QrCode, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkCard } from "./LinkCard";
import { LinkIcon } from "lucide-react";

interface LinksTabProps {
  slug: string;
  baseUrl: string;
  onCopy: (url: string) => void;
  onQrOpen: (url: string, label: string) => void;
  onPanfletoOpen?: () => void;
}

export function LinksTab({ slug, baseUrl, onCopy, onQrOpen, onPanfletoOpen }: LinksTabProps) {
  return (
    <div className="space-y-6">
      {/* Main Links */}
      <div className="space-y-4">
        <h2 className="font-heading font-bold text-foreground text-lg flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-primary" /> Links Principais
        </h2>
        <LinkCard emoji="🏠" title="Landing Page — Cliente" description="Para captar clientes que querem desconto na conta de luz" url={`https://${baseUrl}/${slug}`} onCopy={onCopy} previewUrl={`/${slug}`} />
        <LinkCard emoji="💼" title="Landing Page — Licenciado" description="Para recrutar novos licenciados para sua equipe" url={`https://${baseUrl}/licenciado/${slug}`} onCopy={onCopy} previewUrl={`/licenciado/${slug}`} />
        <LinkCard emoji="📱" title="Página de Cadastro" description="Cadastro rápido em 3 minutos via WhatsApp com QR Code" url={`https://${baseUrl}/cadastro/${slug}`} onCopy={onCopy} previewUrl={`/cadastro/${slug}`} />

        {onPanfletoOpen && (
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border-2 border-primary/30 p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center text-2xl shrink-0">
              📄
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">Panfleto pronto pra gráfica</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A5 com QR único da sua licença + G verde no centro. Imprima quantos quiser — sempre vai pro seu WhatsApp atual.
              </p>
            </div>
            <Button onClick={onPanfletoOpen} className="gap-2 shrink-0">
              <FileText className="w-4 h-4" /> Gerar panfleto
            </Button>
          </div>
        )}
      </div>

      {/* Tracking Links */}
      {[
        { pageLabel: "Cliente", pagePath: slug, emoji: "🏠" },
        { pageLabel: "Licenciado", pagePath: `licenciado/${slug}`, emoji: "💼" },
      ].map((page) => (
        <div key={page.pagePath} className="space-y-3">
          <h2 className="font-heading font-bold text-foreground text-lg flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" /> Links de Rastreamento — {page.emoji} {page.pageLabel}
          </h2>
          <p className="text-xs text-muted-foreground -mt-1">Compartilhe o link certo em cada rede social para saber de onde vem seu tráfego</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { source: "whatsapp", label: "WhatsApp", icon: "💬", color: "bg-[hsl(142,70%,45%)]" },
              { source: "instagram", label: "Instagram", icon: "📸", color: "bg-[hsl(330,80%,55%)]" },
              { source: "facebook", label: "Facebook", icon: "📘", color: "bg-[hsl(220,80%,55%)]" },
              { source: "youtube", label: "YouTube", icon: "🎬", color: "bg-[hsl(0,80%,50%)]" },
              { source: "tiktok", label: "TikTok", icon: "🎵", color: "bg-[hsl(270,80%,55%)]" },
              { source: "google", label: "Google", icon: "🔍", color: "bg-[hsl(45,90%,50%)]" },
            ].map((s) => {
              const fullUrl = `https://${baseUrl}/${page.pagePath}?utm_source=${s.source}`;
              return (
                <div key={s.source} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${s.color} bg-opacity-20`}>
                    {s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{s.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{fullUrl.replace("https://", "")}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => onQrOpen(fullUrl, `${s.label} — ${page.pageLabel}`)} className="gap-1 rounded-lg text-xs px-2">
                      <QrCode className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onCopy(fullUrl)} className="gap-1 rounded-lg text-xs">
                      <Copy className="w-3 h-3" /> Copiar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

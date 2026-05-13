import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import html2canvas from "html2canvas";

type Format = "feed_1x1" | "story_9x16" | "reels_9x16" | "carousel_4x5";

const ASPECT: Record<Format, { aspect: string; w: number; h: number }> = {
  feed_1x1:     { aspect: "1 / 1",   w: 1080, h: 1080 },
  story_9x16:   { aspect: "9 / 16",  w: 1080, h: 1920 },
  reels_9x16:   { aspect: "9 / 16",  w: 1080, h: 1920 },
  carousel_4x5: { aspect: "4 / 5",   w: 1080, h: 1350 },
};

export interface CreativeOverlayProps {
  imageUrl: string;
  format: Format;
  headline: string;
  badge?: string;
  brand?: string;
  className?: string;
}

export interface CreativeOverlayHandle {
  toFile: (filename?: string) => Promise<File>;
}

export const CreativeOverlay = forwardRef<CreativeOverlayHandle, CreativeOverlayProps>(
  function CreativeOverlay({ imageUrl, format, headline, badge, brand = "iGreen", className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [localUrl, setLocalUrl] = useState<string>(imageUrl);
    const spec = ASPECT[format];

    useEffect(() => {
      let revoked = false;
      let createdUrl: string | null = null;
      (async () => {
        try {
          const r = await fetch(imageUrl, { mode: "cors", cache: "force-cache" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const blob = await r.blob();
          if (revoked) return;
          createdUrl = URL.createObjectURL(blob);
          setLocalUrl(createdUrl);
        } catch {
          setLocalUrl(imageUrl);
        }
      })();
      return () => {
        revoked = true;
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }, [imageUrl]);

    useImperativeHandle(ref, () => ({
      async toFile(filename = `criativo-${Date.now()}.png`) {
        if (!containerRef.current) throw new Error("overlay não montado");
        const canvas = await html2canvas(containerRef.current, {
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          scale: spec.w / containerRef.current.clientWidth,
        });
        const blob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png", 0.95)
        );
        return new File([blob], filename, { type: "image/png" });
      },
    }), [spec.w]);

    const isStory = format === "story_9x16" || format === "reels_9x16";
    // Tipografia em % do menor lado (largura) — funciona sem container-queries.
    // Headline gigante, leitura em <1s no feed.
    const headlineSize = isStory ? "9.5%" : "8.5%";
    const badgeSize    = isStory ? "5.2%" : "4.8%";
    const ctaSize      = isStory ? "4.2%" : "4%";
    const brandSize    = isStory ? "3.6%" : "3.4%";

    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-black ${className || ""}`}
        style={{ aspectRatio: spec.aspect, width: "100%", maxWidth: "100%", containerType: "inline-size" } as any}
      >
        <img
          src={localUrl}
          alt=""
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {/* Vinheta superior forte (legibilidade da headline) */}
        <div
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: isStory ? "46%" : "42%",
            background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0) 100%)",
          }}
        />
        {/* Vinheta inferior (CTA bar) */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: isStory ? "26%" : "22%",
            background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Selo verde grande no canto */}
        {badge && (
          <div className="absolute" style={{ top: "5%", right: "5%" }}>
            <div
              style={{
                background: "linear-gradient(135deg, #22c55e 0%, #15803d 100%)",
                color: "#ffffff",
                fontFamily: "Montserrat, system-ui, sans-serif",
                fontWeight: 900,
                letterSpacing: "0.03em",
                padding: "0.7em 1.2em",
                borderRadius: "999px",
                fontSize: badgeSize,
                boxShadow: "0 8px 28px rgba(22,163,74,0.6), 0 2px 8px rgba(0,0,0,0.4)",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                border: "2px solid rgba(255,255,255,0.25)",
              }}
            >
              {badge}
            </div>
          </div>
        )}

        {/* Headline (top, gigante e ousada) */}
        <div className="absolute" style={{ left: "5%", right: "5%", top: "8%" }}>
          <h1
            style={{
              fontFamily: "Montserrat, system-ui, sans-serif",
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              textShadow: "0 4px 18px rgba(0,0,0,0.75), 0 2px 4px rgba(0,0,0,0.6)",
              fontSize: headlineSize,
              margin: 0,
              maxWidth: badge ? "70%" : "100%",
              textTransform: "none",
            }}
          >
            {headline}
          </h1>
          <div
            style={{
              marginTop: "0.6em",
              width: "12%",
              height: "0.4em",
              background: "linear-gradient(90deg, #22c55e 0%, #15803d 100%)",
              borderRadius: "999px",
              boxShadow: "0 2px 12px rgba(34,197,94,0.7)",
            }}
          />
        </div>

        {/* CTA bar inferior */}
        <div
          className="absolute"
          style={{
            left: "5%",
            right: "5%",
            bottom: "6%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "4%",
          }}
        >
          <div
            style={{
              color: "#ffffff",
              fontFamily: "Montserrat, system-ui, sans-serif",
              fontWeight: 800,
              fontSize: brandSize,
              textShadow: "0 2px 10px rgba(0,0,0,0.6)",
              letterSpacing: "-0.01em",
            }}
          >
            <span style={{ color: "#22c55e", fontSize: "1.2em" }}>●</span> {brand}
          </div>
          <div
            style={{
              background: "#ffffff",
              color: "#0a0a0a",
              fontFamily: "Montserrat, system-ui, sans-serif",
              fontWeight: 900,
              fontSize: ctaSize,
              letterSpacing: "0.01em",
              padding: "0.7em 1.4em",
              borderRadius: "999px",
              boxShadow: "0 6px 22px rgba(0,0,0,0.5)",
              whiteSpace: "nowrap",
              textTransform: "uppercase",
            }}
          >
            Quero economizar →
          </div>
        </div>
      </div>
    );
  }
);

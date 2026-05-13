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
  /** Renderiza overlay+imagem em PNG e devolve um File pronto para upload. */
  toFile: (filename?: string) => Promise<File>;
}

export const CreativeOverlay = forwardRef<CreativeOverlayHandle, CreativeOverlayProps>(
  function CreativeOverlay({ imageUrl, format, headline, badge, brand = "iGreen", className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const spec = ASPECT[format];

    useImperativeHandle(ref, () => ({
      async toFile(filename = `criativo-${Date.now()}.png`) {
        if (!containerRef.current) throw new Error("overlay não montado");
        const canvas = await html2canvas(containerRef.current, {
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          scale: spec.w / containerRef.current.clientWidth, // exporta em resolução nativa
        });
        const blob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png", 0.95)
        );
        return new File([blob], filename, { type: "image/png" });
      },
    }), [spec.w]);

    const isStory = format === "story_9x16" || format === "reels_9x16";

    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-black ${className || ""}`}
        style={{ aspectRatio: spec.aspect, width: "100%", maxWidth: "100%" }}
      >
        <img
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {/* Gradiente superior para legibilidade */}
        <div
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: isStory ? "38%" : "32%",
            background: "linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Headline (top) */}
        <div className="absolute inset-x-0 top-0 px-[5%] pt-[6%]">
          <h1
            style={{
              fontFamily: "Montserrat, system-ui, sans-serif",
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              textShadow: "0 2px 12px rgba(0,0,0,0.55)",
              fontSize: isStory ? "8.5cqw" : "7.5cqw",
              maxWidth: "92%",
            }}
            className="m-0"
          >
            {headline}
          </h1>
        </div>

        {/* Selo verde (top-right) */}
        {badge && (
          <div className="absolute top-[5%] right-[5%]">
            <div
              style={{
                background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                color: "#ffffff",
                fontFamily: "Montserrat, system-ui, sans-serif",
                fontWeight: 900,
                letterSpacing: "0.02em",
                padding: "0.6em 1em",
                borderRadius: "999px",
                fontSize: isStory ? "3.4cqw" : "3.2cqw",
                boxShadow: "0 6px 24px rgba(22,163,74,0.55), 0 2px 6px rgba(0,0,0,0.35)",
                whiteSpace: "nowrap",
              }}
            >
              {badge}
            </div>
          </div>
        )}

        {/* Marca (bottom-left) */}
        <div
          className="absolute bottom-[4%] left-[5%]"
          style={{
            color: "#ffffff",
            fontFamily: "Montserrat, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: isStory ? "3.6cqw" : "3.4cqw",
            textShadow: "0 2px 10px rgba(0,0,0,0.55)",
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ color: "#22c55e" }}>●</span> {brand}
        </div>
      </div>
    );
  }
);

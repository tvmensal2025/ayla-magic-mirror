import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";

type Format = "feed_1x1" | "story_9x16" | "reels_9x16" | "carousel_4x5";

const ASPECT: Record<Format, { aspect: string; w: number; h: number }> = {
  feed_1x1:     { aspect: "1 / 1",  w: 1080, h: 1080 },
  story_9x16:   { aspect: "9 / 16", w: 1080, h: 1920 },
  reels_9x16:   { aspect: "9 / 16", w: 1080, h: 1920 },
  carousel_4x5: { aspect: "4 / 5",  w: 1080, h: 1350 },
};

export interface CreativeOverlayProps {
  imageUrl: string;
  format: Format;
  headline: string;        // ex: "Conta de luz até 20% mais barata"
  badge?: string;          // ex: "ATÉ 20% OFF"
  brand?: string;          // "iGreen"
  className?: string;
}

export interface CreativeOverlayHandle {
  toFile: (filename?: string) => Promise<File>;
}

// =============== Conteúdo de marketing fixo (alta conversão) ===============
const BULLETS = [
  { icon: "☀", title: "SEM INSTALAR", sub: "PLACA SOLAR" },
  { icon: "🔧", title: "SEM OBRA", sub: "" },
  { icon: "$",  title: "SEM INVESTIMENTO", sub: "" },
  { icon: "🔒", title: "SEM FIDELIDADE", sub: "" },
];

const TRUST = [
  { icon: "🛡", title: "100% DIGITAL",      sub: "E SEM BUROCRACIA" },
  { icon: "📄", title: "CONTRATO SIMPLES",  sub: "E SEM FIDELIDADE" },
  { icon: "🔒", title: "SEGURO E",          sub: "CONFIÁVEL" },
];

// extrai % da headline ("até 20% mais barata") → 20
function extractPct(headline: string, badge?: string): number {
  const m = (headline + " " + (badge || "")).match(/(\d{1,2})\s*%/);
  return m ? Math.min(45, Math.max(5, parseInt(m[1], 10))) : 18;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const CreativeOverlay = forwardRef<CreativeOverlayHandle, CreativeOverlayProps>(
  function CreativeOverlay({ imageUrl, format, headline, badge, brand = "iGreen", className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [localUrl, setLocalUrl] = useState<string>(imageUrl);
    const spec = ASPECT[format];
    const isStory = format === "story_9x16" || format === "reels_9x16";

    // valores antes/depois consistentes com a headline
    const { antes, depois, economia, pct } = useMemo(() => {
      const p = extractPct(headline, badge);
      const a = 436.32; // valor "real-feel" típico
      const d = +(a * (1 - p / 100)).toFixed(2);
      return { antes: a, depois: d, economia: +(a - d).toFixed(2), pct: p };
    }, [headline, badge]);

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
      return () => { revoked = true; if (createdUrl) URL.revokeObjectURL(createdUrl); };
    }, [imageUrl]);

    useImperativeHandle(ref, () => ({
      async toFile(filename = `criativo-${Date.now()}.png`) {
        if (!containerRef.current) throw new Error("overlay não montado");
        const canvas = await html2canvas(containerRef.current, {
          useCORS: true, allowTaint: false, backgroundColor: "#ffffff",
          scale: spec.w / containerRef.current.clientWidth,
        });
        const blob: Blob = await new Promise((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png", 0.95)
        );
        return new File([blob], filename, { type: "image/png" });
      },
    }), [spec.w]);

    // helpers de tipografia em % do menor lado
    const fs = (pct: number) => `${pct}%`;

    // ============ LAYOUT FEED 1:1 / 4:5 (subject à direita) ============
    const renderFeedLayout = () => (
      <>
        {/* foto de fundo */}
        <img src={localUrl} alt="" crossOrigin="anonymous" draggable={false}
             className="absolute inset-0 w-full h-full object-cover" />
        {/* gradient à esquerda para destacar painel branco */}
        <div className="absolute inset-y-0 left-0 pointer-events-none"
             style={{ width: "70%", background: "linear-gradient(90deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 50%, rgba(255,255,255,0) 100%)" }} />

        {/* HEADER: headline + sub-badge */}
        <div className="absolute" style={{ left: "4%", right: "48%", top: "5%" }}>
          <h1 style={{
            fontFamily: "Montserrat, system-ui, sans-serif", fontWeight: 900,
            color: "#0b1f3a", lineHeight: 0.95, letterSpacing: "-0.03em",
            fontSize: fs(11), margin: 0, textTransform: "uppercase",
          }}>
            CONTA DE LUZ<br />
            <span style={{ color: "#16a34a" }}>ALTA DEMAIS?</span>
          </h1>
          <div style={{
            marginTop: "0.6em", background: "#0b1f3a", color: "#fff",
            fontFamily: "Montserrat, sans-serif", fontWeight: 800,
            fontSize: fs(2.6), padding: "0.55em 0.8em", borderRadius: "0.4em",
            display: "inline-block", lineHeight: 1.15, textTransform: "uppercase",
            letterSpacing: "0.02em",
          }}>
            AGORA VOCÊ PODE PAGAR MENOS<br />
            <span style={{ color: "#fbbf24" }}>SEM INSTALAR</span> PLACA SOLAR!
          </div>
          <p style={{
            marginTop: "0.7em", fontFamily: "'Open Sans', sans-serif",
            color: "#0b1f3a", fontSize: fs(2.2), lineHeight: 1.3, fontWeight: 600,
          }}>
            Economia inteligente e 100% digital<br />
            para sua <span style={{ color: "#16a34a", fontWeight: 800 }}>casa</span> ou <span style={{ color: "#16a34a", fontWeight: 800 }}>comércio</span>.
          </p>
        </div>

        {/* BULLETS lateral esquerdo */}
        <div className="absolute" style={{ left: "4%", top: "44%", width: "44%" }}>
          {BULLETS.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.7em", marginBottom: "0.55em" }}>
              <div style={{
                width: "2.4em", height: "2.4em", borderRadius: "999px",
                background: "#16a34a", color: "#fff", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: fs(2.4),
                fontWeight: 900, flex: "0 0 auto",
                boxShadow: "0 2px 8px rgba(22,163,74,0.4)",
              }}>{b.icon}</div>
              <div style={{ fontFamily: "Montserrat, sans-serif", color: "#0b1f3a", lineHeight: 1.05 }}>
                <div style={{ fontSize: fs(2.2), fontWeight: 900, textTransform: "uppercase" }}>{b.title}</div>
                {b.sub && <div style={{ fontSize: fs(2.1), fontWeight: 800, color: "#0b1f3a" }}>{b.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* SELO redondo amarelo */}
        <div className="absolute" style={{
          left: "44%", top: "38%", width: "13%", aspectRatio: "1/1",
          background: "radial-gradient(circle, #fde047 0%, #facc15 70%, #ca8a04 100%)",
          borderRadius: "999px", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
          border: "3px solid #fff",
          transform: "rotate(-8deg)",
        }}>
          <span style={{ fontFamily: "Montserrat", fontWeight: 900, color: "#0b1f3a", fontSize: fs(2.0), lineHeight: 1, textTransform: "uppercase" }}>ECONOMIA</span>
          <span style={{ fontFamily: "Montserrat", fontWeight: 900, color: "#0b1f3a", fontSize: fs(2.4), lineHeight: 1, textTransform: "uppercase" }}>GARANTIDA</span>
          <span style={{ fontFamily: "Montserrat", fontWeight: 800, color: "#0b1f3a", fontSize: fs(1.3), lineHeight: 1.1, marginTop: "0.2em", textAlign: "center" }}>TODOS<br />OS MESES!</span>
        </div>

        {/* CARD antes/depois */}
        <div className="absolute" style={{
          left: "30%", right: "4%", bottom: "20%",
          background: "#0b1f3a", color: "#fff", borderRadius: "0.5em",
          padding: "0.8em 1em", boxShadow: "0 8px 22px rgba(0,0,0,0.3)",
          fontFamily: "Montserrat, sans-serif",
        }}>
          <div style={{ textAlign: "center", fontSize: fs(1.9), fontWeight: 800, marginBottom: "0.4em", letterSpacing: "0.05em" }}>
            EXEMPLO REAL DE ECONOMIA
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6em" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ color: "#ef4444", fontWeight: 900, fontSize: fs(2.0) }}>ANTES</div>
              <div style={{ color: "#cbd5e1", fontSize: fs(1.4), fontWeight: 600 }}>Conta de energia</div>
              <div style={{ color: "#ef4444", fontWeight: 900, fontSize: fs(2.6) }}>R$ {brl(antes)}</div>
            </div>
            <div style={{ color: "#16a34a", fontSize: fs(3), fontWeight: 900 }}>→</div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ color: "#22c55e", fontWeight: 900, fontSize: fs(2.0) }}>DEPOIS</div>
              <div style={{ color: "#cbd5e1", fontSize: fs(1.4), fontWeight: 600 }}>Com a {brand}</div>
              <div style={{ color: "#22c55e", fontWeight: 900, fontSize: fs(2.6) }}>R$ {brl(depois)}</div>
            </div>
          </div>
          <div style={{
            marginTop: "0.6em", background: "#16a34a", color: "#fff",
            textAlign: "center", padding: "0.45em", borderRadius: "0.3em",
            fontSize: fs(1.9), fontWeight: 900, letterSpacing: "0.02em",
          }}>
            ✓ ECONOMIA DE <span style={{ color: "#fde047" }}>R$ {brl(economia)}</span> POR MÊS!
          </div>
        </div>

        {/* CTA WhatsApp bar */}
        <div className="absolute" style={{
          left: 0, right: 0, bottom: "6%", height: "9%",
          background: "#0b1f3a", display: "flex", alignItems: "center",
          padding: "0 4%", gap: "1em",
        }}>
          <div style={{
            width: "3.5em", height: "3.5em", borderRadius: "999px",
            background: "#22c55e", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: fs(3), color: "#fff", fontWeight: 900,
            boxShadow: "0 4px 14px rgba(34,197,94,0.5)",
          }}>✆</div>
          <div style={{ flex: 1, fontFamily: "Montserrat, sans-serif", color: "#fff", lineHeight: 1.05 }}>
            <div style={{ fontSize: fs(2.6), fontWeight: 900, textTransform: "uppercase" }}>FAÇA UMA SIMULAÇÃO</div>
            <div style={{ fontSize: fs(2.6), fontWeight: 900, textTransform: "uppercase" }}>
              <span style={{ color: "#fde047" }}>GRATUITA</span> AGORA!
            </div>
          </div>
          <div style={{
            background: "#fff", color: "#0b1f3a", fontFamily: "Montserrat, sans-serif",
            fontWeight: 900, fontSize: fs(2.2), padding: "0.55em 1em",
            borderRadius: "0.35em", textTransform: "uppercase", letterSpacing: "0.03em",
            whiteSpace: "nowrap",
          }}>CHAME NO WHATSAPP</div>
        </div>

        {/* footer trust */}
        <div className="absolute" style={{
          left: 0, right: 0, bottom: 0, height: "6%",
          background: "#16a34a", display: "flex", alignItems: "center",
          justifyContent: "space-around", padding: "0 4%", color: "#fff",
          fontFamily: "Montserrat, sans-serif",
        }}>
          {TRUST.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4em", lineHeight: 1.05 }}>
              <span style={{ fontSize: fs(2) }}>{t.icon}</span>
              <div>
                <div style={{ fontSize: fs(1.2), fontWeight: 900, textTransform: "uppercase" }}>{t.title}</div>
                <div style={{ fontSize: fs(1.2), fontWeight: 700, textTransform: "uppercase", opacity: 0.9 }}>{t.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* logo brand bottom-right corner of CTA bar */}
        <div className="absolute" style={{
          right: "4%", bottom: "16.5%",
          fontFamily: "Montserrat, sans-serif", fontWeight: 900,
          color: "#fff", fontSize: fs(3), lineHeight: 1, letterSpacing: "-0.02em",
        }}>
          <span style={{ color: "#fff" }}>i</span><span style={{ color: "#22c55e" }}>Green</span>
          <div style={{ fontSize: fs(1.1), fontWeight: 700, color: "#22c55e", letterSpacing: "0.3em", marginTop: "0.1em" }}>ENERGY.</div>
        </div>
      </>
    );

    // ============ LAYOUT STORY 9:16 (top design + bottom photo) ============
    const renderStoryLayout = () => (
      <>
        <img src={localUrl} alt="" crossOrigin="anonymous" draggable={false}
             className="absolute inset-0 w-full h-full object-cover" />
        {/* top white panel */}
        <div className="absolute inset-x-0 top-0 pointer-events-none"
             style={{ height: "55%", background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.95) 75%, rgba(255,255,255,0) 100%)" }} />

        <div className="absolute" style={{ left: "5%", right: "5%", top: "5%" }}>
          <h1 style={{
            fontFamily: "Montserrat, sans-serif", fontWeight: 900,
            color: "#0b1f3a", lineHeight: 0.95, letterSpacing: "-0.03em",
            fontSize: fs(11), margin: 0, textTransform: "uppercase",
          }}>
            CONTA DE LUZ<br />
            <span style={{ color: "#16a34a" }}>ALTA DEMAIS?</span>
          </h1>
          <div style={{
            marginTop: "0.5em", background: "#0b1f3a", color: "#fff",
            fontFamily: "Montserrat, sans-serif", fontWeight: 800,
            fontSize: fs(3.2), padding: "0.5em 0.7em", borderRadius: "0.35em",
            display: "inline-block", lineHeight: 1.15, textTransform: "uppercase",
          }}>
            <span style={{ color: "#fbbf24" }}>SEM INSTALAR</span> PLACA SOLAR!
          </div>
          <div style={{ marginTop: "0.8em", display: "flex", flexWrap: "wrap", gap: "0.4em 0.8em" }}>
            {BULLETS.map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4em", width: "47%" }}>
                <div style={{ width: "1.8em", height: "1.8em", borderRadius: "999px", background: "#16a34a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(2), fontWeight: 900, flex: "0 0 auto" }}>{b.icon}</div>
                <div style={{ fontFamily: "Montserrat", fontSize: fs(1.9), fontWeight: 900, color: "#0b1f3a", textTransform: "uppercase", lineHeight: 1.05 }}>{b.title}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA bottom */}
        <div className="absolute" style={{ left: 0, right: 0, bottom: "5%", height: "10%", background: "#0b1f3a", display: "flex", alignItems: "center", padding: "0 5%", gap: "0.8em" }}>
          <div style={{ width: "3em", height: "3em", borderRadius: "999px", background: "#22c55e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(3), fontWeight: 900 }}>✆</div>
          <div style={{ flex: 1, fontFamily: "Montserrat", color: "#fff", lineHeight: 1.05 }}>
            <div style={{ fontSize: fs(2.4), fontWeight: 900, textTransform: "uppercase" }}>SIMULAÇÃO <span style={{ color: "#fde047" }}>GRATUITA</span></div>
            <div style={{ fontSize: fs(1.7), fontWeight: 700 }}>Chame agora no WhatsApp</div>
          </div>
          <div style={{ background: "#fff", color: "#0b1f3a", fontFamily: "Montserrat", fontWeight: 900, fontSize: fs(1.9), padding: "0.5em 0.9em", borderRadius: "0.3em", textTransform: "uppercase" }}>
            i<span style={{ color: "#16a34a" }}>Green</span>
          </div>
        </div>
        <div className="absolute" style={{ left: 0, right: 0, bottom: 0, height: "5%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "space-around", color: "#fff", fontFamily: "Montserrat", fontSize: fs(1.3), fontWeight: 800, textTransform: "uppercase" }}>
          <span>🛡 100% DIGITAL</span>
          <span>📄 SEM FIDELIDADE</span>
          <span>🔒 SEGURO</span>
        </div>
      </>
    );

    return (
      <div ref={containerRef}
           className={`relative overflow-hidden bg-white ${className || ""}`}
           style={{ aspectRatio: spec.aspect, width: "100%", maxWidth: "100%" }}>
        {isStory ? renderStoryLayout() : renderFeedLayout()}
      </div>
    );
  }
);

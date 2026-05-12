import { useEffect, useRef, useState } from "react";

interface LazyVideoProps {
  src: string;
  type?: string;
  className?: string;
  poster?: string;
  controls?: boolean;
  playsInline?: boolean;
  rootMargin?: string;
}

/**
 * Lazy <video>: só monta a tag (e abre conexão com o servidor de mídia)
 * quando o elemento entra no viewport. Evita que vários vídeos
 * iniciem handshake/preload simultaneamente no carregamento da página.
 */
export function LazyVideo({
  src,
  type = "video/mp4",
  className = "w-full aspect-video relative z-0",
  poster,
  controls = true,
  playsInline = true,
  rootMargin = "300px",
}: LazyVideoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={containerRef} className="w-full h-full">
      {visible ? (
        <video
          controls={controls}
          playsInline={playsInline}
          preload="none"
          poster={poster}
          className={className}
        >
          <source src={src} type={type} />
        </video>
      ) : (
        <div
          className={`${className} bg-black/40 flex items-center justify-center`}
          aria-label="Carregando vídeo"
        >
          <div className="w-14 h-14 rounded-full bg-primary/80 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary-foreground" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

export default LazyVideo;
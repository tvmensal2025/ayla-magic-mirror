import { trackClickEvent } from "@/hooks/useTrackEvent";
import { useEffect, useRef, useState } from "react";

interface LicHeroSectionProps {
  cadastroUrl?: string;
  whatsappUrl?: string;
  consultantId?: string;
}

const DEFAULT_CADASTRO = "https://digital.igreenenergy.com.br/?sendcontract=true";
const DEFAULT_WHATSAPP = "https://api.whatsapp.com/send?phone=5500000000000&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20a%20oportunidade%20de%20Licenciado%20iGreen%20Energy";

const AnimatedCounter = ({ target, suffix = "" }: { target: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;

    const startAnimation = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;

      if (isMobileViewport) {
        setCount(target);
        return;
      }

      let start = 0;
      const duration = 2000;
      const step = (timestamp: number) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        setCount(Math.floor(progress * target));
        if (progress < 1) requestAnimationFrame(step);
      };

      requestAnimationFrame(step);
    };

    if (typeof IntersectionObserver === "undefined" || isMobileViewport) {
      startAnimation();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startAnimation();
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="stat-block">
      <div className="stat-number">{count.toLocaleString("pt-BR")}{suffix}</div>
    </div>
  );
};

const LicHeroSection = ({ cadastroUrl, whatsappUrl, consultantId }: LicHeroSectionProps) => {
  const CADASTRO = cadastroUrl || DEFAULT_CADASTRO;
  const WHATSAPP = whatsappUrl || DEFAULT_WHATSAPP;

  const handleClick = (target: string) => {
    if (consultantId) trackClickEvent(consultantId, target, "licenciada");
  };

  return (
    <section className="relative overflow-hidden" style={{ background: 'var(--gradient-hero)' }}>
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, hsl(130, 100%, 36%), transparent 70%)' }} />
        <div className="absolute -bottom-60 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, hsl(130, 100%, 36%), transparent 70%)' }} />
      </div>

      <div className="section-container text-center py-4 sm:py-6 md:py-12 relative z-10">
        {/* Badge + Logo compact on mobile */}
        <div className="flex items-center justify-center gap-3 mb-2 md:mb-4 md:flex-col md:gap-0">
          <div className="badge-green animate-fade-in md:mb-4 !py-1 !px-3 md:!py-2 md:!px-4">
            <span className="glow-dot" />
            <span className="text-[10px] md:text-xs">Oportunidade exclusiva</span>
          </div>
          <img src="/images/logo-colorida-igreen.png" alt="iGreen Energy Logo" className="w-20 md:w-56 animate-fade-in" />
        </div>

        {/* Title - compact on mobile */}
        <h1 className="font-heading font-black mb-2 md:mb-3 text-lg sm:text-2xl md:text-4xl lg:text-[3.2rem] leading-[1.15] max-w-5xl mx-auto text-foreground px-2">
          Seja um Licenciado iGreen Energy e receba{" "}
           <span className="relative inline" style={{ color: 'hsl(var(--primary))' }}>
             comissões recorrentes e vitalícias
           </span>{" "}
          todos os meses
        </h1>

        {/* Subtitle - hidden on mobile to save space */}
        <p className="hidden sm:block text-foreground/70 text-base md:text-xl max-w-3xl mx-auto mb-4 leading-relaxed">
          O mercado de energia solar está explodindo no Brasil. Quem está aproveitando agora já está faturando — <strong className="text-foreground">esse é o seu momento.</strong>
        </p>

        {/* Video - priority on mobile */}
        <div className="max-w-4xl mx-auto mb-3 md:mb-4 rounded-xl md:rounded-2xl overflow-hidden relative" style={{ boxShadow: 'var(--shadow-green-lg)' }}>
          <div className="absolute inset-0 rounded-xl md:rounded-2xl border border-primary/20 z-10 pointer-events-none" />
          <video controls playsInline autoPlay muted preload="auto" className="w-full aspect-video relative z-0">
            <source src="https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/video%20igreen/imagine-licenciado.mp4" type="video/mp4" />
          </video>
        </div>

        {/* CTA */}
        <a
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-cta-lg animate-pulse-green !py-2.5 sm:!py-3 !px-5 sm:!px-8 !text-sm sm:!text-base inline-block"
          onClick={() => handleClick("whatsapp")}
        >
          🚀 Quero ser Licenciado
        </a>

        {/* Social proof stats */}
        <div className="grid grid-cols-3 gap-4 md:gap-12 max-w-3xl mx-auto mt-6 md:mt-8 pt-4 md:pt-6 border-t border-border">
          <div>
            <AnimatedCounter target={600} suffix="mil+" />
            <p className="stat-label text-[10px] md:text-sm mt-1 md:mt-2 text-muted-foreground uppercase tracking-wider font-heading">Clientes ativos</p>
          </div>
          <div>
            <AnimatedCounter target={500} suffix="+" />
            <p className="stat-label text-[10px] md:text-sm mt-1 md:mt-2 text-muted-foreground uppercase tracking-wider font-heading">Usinas solares</p>
          </div>
          <div>
            <AnimatedCounter target={27} />
            <p className="stat-label text-[10px] md:text-sm mt-1 md:mt-2 text-muted-foreground uppercase tracking-wider font-heading">Estados</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LicHeroSection;

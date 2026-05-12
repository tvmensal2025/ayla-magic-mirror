import { trackClickEvent } from "@/hooks/useTrackEvent";
import { useEffect, useRef, useState } from "react";

interface HeroSectionProps {
  cadastroUrl?: string;
  whatsappUrl?: string;
  consultantId?: string;
}

const DEFAULT_CADASTRO_URL = "https://digital.igreenenergy.com.br/?sendcontract=true";
const DEFAULT_WHATSAPP_URL = "https://api.whatsapp.com/send?phone=5500000000000&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20desconto%20na%20conta%20de%20luz%20oferecido%20pela%20iGreen%20Energy";

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

const HeroSection = ({ cadastroUrl, whatsappUrl, consultantId }: HeroSectionProps) => {
  const CADASTRO = cadastroUrl || DEFAULT_CADASTRO_URL;
  const WHATSAPP = whatsappUrl || DEFAULT_WHATSAPP_URL;

  const handleClick = (target: string) => {
    if (consultantId) trackClickEvent(consultantId, target, "client");
  };

  return (
    <section className="relative overflow-hidden" style={{ background: 'var(--gradient-hero)' }}>
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, hsl(130, 100%, 36%), transparent 70%)' }} />
        <div className="absolute -bottom-60 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, hsl(130, 100%, 36%), transparent 70%)' }} />
      </div>

      <div className="section-container text-center py-8 sm:py-10 md:py-20 relative z-10">
        {/* Badge + Logo */}
        <div className="flex flex-col items-center gap-3 mb-5 md:mb-8">
          <div className="badge-green animate-fade-in !py-1.5 !px-4 md:!py-2 md:!px-4">
            <span className="glow-dot" />
            <span className="text-xs md:text-xs">Economia garantida</span>
          </div>
          <img
            src="/images/logo-colorida-igreen.png"
            alt="iGreen Energy Logo"
            width={300}
            height={92}
            className="w-32 md:w-64 animate-fade-in"
          />
        </div>

        {/* Title */}
        <h1 className="font-heading font-black mb-4 md:mb-6 text-[1.6rem] sm:text-3xl md:text-4xl lg:text-[3.2rem] leading-[1.2] max-w-5xl mx-auto text-foreground px-4">
          Descubra como receber até{" "}
           <span className="relative inline" style={{ color: 'hsl(var(--primary))' }}>
             20% de desconto
           </span>{" "}
          na sua conta de luz todos os meses gratuitamente
        </h1>

        {/* Subtitle - hidden on mobile to save space, visible on tablet+ */}
        <p className="hidden sm:block text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto mb-6 md:mb-12 leading-relaxed">
          Conheça agora a oportunidade da iGreen Energy e como você pode economizar na conta de luz da sua residência, comércio e empresa — sem instalar placas solares, sem obras, sem custos
        </p>

        {/* Video - priority on mobile, full width */}
        <div className="max-w-4xl mx-auto mb-6 md:mb-12 rounded-xl md:rounded-2xl overflow-hidden relative" style={{ boxShadow: 'var(--shadow-green-lg)' }}>
          <div className="absolute inset-0 rounded-xl md:rounded-2xl border border-primary/20 z-10 pointer-events-none" />
          <video controls playsInline autoPlay muted className="w-full aspect-video relative z-0" poster="">
            <source src="/videos/Green_Energy.mp4" type="video/mp4" />
            Seu navegador não suporta vídeos.
          </video>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-3 justify-center px-4 sm:px-0">
          <a href={CADASTRO} target="_blank" rel="noopener noreferrer" className="btn-cta-lg animate-pulse-green !py-3 sm:!py-3 !px-6 sm:!px-6 !text-base sm:!text-base" onClick={() => handleClick("cadastro")}>
            ⚡ Faça seu cadastro
          </a>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-whatsapp !px-6 sm:!px-6 !py-3 sm:!py-3 !text-base sm:!text-base !rounded-xl" onClick={() => handleClick("whatsapp")}>
            💬 Atendimento no WhatsApp
          </a>
        </div>

        {/* Social proof */}
        <div className="grid grid-cols-3 gap-2 sm:gap-6 md:gap-12 max-w-3xl mx-auto mt-10 md:mt-16 pt-8 md:pt-12 border-t border-border px-2">
          <div className="text-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black" style={{ color: 'hsl(var(--primary))' }}>
              <AnimatedCounter target={600} suffix="mil+" />
            </div>
            <p className="text-[11px] sm:text-xs md:text-sm mt-2 text-muted-foreground uppercase tracking-wider font-heading leading-tight">Clientes<br className="sm:hidden" /> ativos</p>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black" style={{ color: 'hsl(var(--primary))' }}>
              <AnimatedCounter target={500} suffix="+" />
            </div>
            <p className="text-[11px] sm:text-xs md:text-sm mt-2 text-muted-foreground uppercase tracking-wider font-heading leading-tight">Usinas<br className="sm:hidden" /> solares</p>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-4xl md:text-5xl font-black" style={{ color: 'hsl(var(--primary))' }}>
              <AnimatedCounter target={27} />
            </div>
            <p className="text-[11px] sm:text-xs md:text-sm mt-2 text-muted-foreground uppercase tracking-wider font-heading leading-tight">Estados</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

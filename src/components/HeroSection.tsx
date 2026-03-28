import { trackClickEvent } from "@/hooks/useTrackEvent";
import { useEffect, useRef, useState } from "react";

interface HeroSectionProps {
  cadastroUrl?: string;
  whatsappUrl?: string;
  consultantId?: string;
}

const DEFAULT_CADASTRO_URL = "https://digital.igreenenergy.com.br/?id=126928&sendcontract=true";
const DEFAULT_WHATSAPP_URL = "https://api.whatsapp.com/send?phone=5515981077416&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20desconto%20na%20conta%20de%20luz%20oferecido%20pela%20iGreen%20Energy";

const AnimatedCounter = ({ target, suffix = "" }: { target: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let start = 0;
          const duration = 2000;
          const step = (timestamp: number) => {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);
            setCount(Math.floor(progress * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
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

      <div className="section-container text-center py-12 md:py-20 relative z-10">
        <div className="badge-green mx-auto mb-8 animate-fade-in">
          <span className="glow-dot" />
          Economia garantida
        </div>

        <img
          src="/images/logo-colorida-igreen.png"
          alt="iGreen Energy Logo"
          width={300}
          height={92}
          className="mx-auto mb-8 w-48 md:w-64 animate-fade-in"
        />

        <h1 className="font-heading font-black mb-6 text-3xl md:text-4xl lg:text-[3.2rem] leading-[1.15] max-w-5xl mx-auto text-foreground">
          Descubra como receber até{" "}
          <span className="relative inline-block" style={{ color: 'hsl(var(--primary))' }}>
            20% de desconto
            <span className="absolute -bottom-1 left-0 w-full h-1 rounded-full" style={{ background: 'var(--gradient-green)' }} />
          </span>{" "}
          na sua conta de luz todos os meses gratuitamente
        </h1>

        <p className="text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto mb-12 leading-relaxed">
          Conheça agora a oportunidade da iGreen Energy e como você pode economizar na conta de luz da sua residência, comércio e empresa — sem instalar placas solares, sem obras, sem custos
        </p>

        <div className="max-w-4xl mx-auto mb-12 rounded-2xl overflow-hidden relative" style={{ boxShadow: 'var(--shadow-green-lg)' }}>
          <div className="absolute inset-0 rounded-2xl border border-primary/20 z-10 pointer-events-none" />
          <video controls className="w-full aspect-video relative z-0" poster="">
            <source src="/videos/igreen-energy.mp4" type="video/mp4" />
            Seu navegador não suporta vídeos.
          </video>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={CADASTRO} target="_blank" rel="noopener noreferrer" className="btn-cta-lg animate-pulse-green" onClick={() => handleClick("cadastro")}>
            ⚡ Faça seu cadastro
          </a>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-whatsapp !px-10 !py-5 !text-lg !rounded-2xl" onClick={() => handleClick("whatsapp")}>
            💬 Atendimento no WhatsApp
          </a>
        </div>

        {/* Social proof */}
        <div className="grid grid-cols-3 gap-6 md:gap-12 max-w-3xl mx-auto mt-16 pt-12 border-t border-border">
          <div>
            <AnimatedCounter target={600} suffix="mil+" />
            <p className="text-xs md:text-sm mt-2 text-muted-foreground uppercase tracking-wider font-heading">Clientes ativos</p>
          </div>
          <div>
            <AnimatedCounter target={500} suffix="+" />
            <p className="text-xs md:text-sm mt-2 text-muted-foreground uppercase tracking-wider font-heading">Usinas solares</p>
          </div>
          <div>
            <AnimatedCounter target={27} />
            <p className="text-xs md:text-sm mt-2 text-muted-foreground uppercase tracking-wider font-heading">Estados</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

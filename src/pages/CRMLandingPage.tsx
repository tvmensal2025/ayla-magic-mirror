import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureLeadSource } from "@/lib/fbclid";
import { Volume2 } from "lucide-react";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import { useCrmPageView, trackCrmClick } from "@/hooks/useCrmTracking";
import {
  MessageSquare,
  LayoutDashboard,
  Users,
  Clock,
  Send,
  BarChart3,
  Zap,
  Shield,
  Headphones,
  ChevronRight,
  Play,
  CheckCircle2,
} from "lucide-react";

const WHATSAPP_CTA = "https://api.whatsapp.com/send?phone=5511989000650&text=Ol%C3%A1,%20quero%20conhecer%20o%20CRM%20iGreen";

/* ── Animated Counter ── */
const AnimatedCounter = ({ target, suffix = "" }: { target: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    const start = () => {
      if (hasAnimated.current) return;
      hasAnimated.current = true;
      if (isMobile) { setCount(target); return; }
      let s = 0;
      const dur = 2000;
      const step = (ts: number) => {
        if (!s) s = ts;
        const p = Math.min((ts - s) / dur, 1);
        setCount(Math.floor(p * target));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (typeof IntersectionObserver === "undefined" || isMobile) { start(); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { start(); obs.disconnect(); } }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return <div ref={ref}><span className="stat-number">{count.toLocaleString("pt-BR")}{suffix}</span></div>;
};

/* ── Feature data ── */
const features = [
  {
    icon: MessageSquare,
    title: "WhatsApp Integrado",
    desc: "Envie e receba mensagens direto do CRM, com templates prontos, respostas rápidas e gravação de áudio. Tudo em uma única tela. ",
  },
  {
    icon: LayoutDashboard,
    title: "Kanban de Vendas",
    desc: "Pipeline visual com drag-and-drop para acompanhar cada etapa do primeiro contato até o o cliente pagar o boleto da igreen.",
  },
  {
    icon: Users,
    title: "Gestão de Clientes",
    desc: "Sincronizado com seus clientes da igreen.\n\nCadastro completo, importação em massa via planilha, histórico de conversas e segmentação por tags.",
  },
  {
    icon: Clock,
    title: "Mensagens Agendadas",
    desc: "Programe follow-ups automáticos e sequências de mensagens para nunca perder o timing , eu uso muito para o usuário que tem empréstimo, assim agendo uma msg automaticá.",
  },
  {
    icon: Send,
    title: "Mensagens em Massa",
    desc: "Envio em lote com templates personalizados, incluindo imagens e áudios para toda a sua base de contatos.",
  },
  {
    icon: BarChart3,
    title: "Dashboard de Métricas",
    desc: "Gráficos de performance, taxa de resposta, conversão por etapa e ranking de consultores em tempo real.",
  },
];

const steps = [
  { num: "01", title: "Crie sua conta", desc: "Cadastro rápido e seguro em menos de 2 minutos." },
  { num: "02", title: "Conecte seu WhatsApp", desc: "Escaneie o QR Code e comece a atender pelo CRM." },
  { num: "03", title: "Comece a vender", desc: "Gerencie clientes, automatize mensagens e acompanhe resultados." },
];

const differentials = [
  { icon: Zap, title: "Integração Nativa", desc: "Conecta direto com a plataforma iGreen Energy sem configurações extras." },
  { icon: Shield, title: "Sem Custo Extra", desc: "Incluído no seu plano de licenciado. Sem mensalidades adicionais." },
  { icon: Headphones, title: "Suporte Dedicado", desc: "Equipe pronta para te ajudar a tirar o máximo do CRM." },
];

interface AudioTemplate {
  id: string;
  name: string;
  media_url: string;
}

/* ── Secure Audio Player ── */
const SecureAudioPlayer = ({ url }: { url: string }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) {
      const a = new Audio();
      a.crossOrigin = "anonymous";
      a.preload = "metadata";
      a.src = url;
      a.addEventListener("timeupdate", () => {
        setCurrent(a.currentTime);
        setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
      });
      a.addEventListener("loadedmetadata", () => setDuration(a.duration));
      a.addEventListener("ended", () => { setPlaying(false); setProgress(0); setCurrent(0); });
      audioRef.current = a;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
      trackCrmClick("audio_play");
    }
  };

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  return (
    <div className="flex items-center gap-3 select-none" onContextMenu={(e) => e.preventDefault()}>
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center bg-primary/20 text-primary hover:bg-primary/30 transition-colors shrink-0"
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11l9-5.5z" /></svg>
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-2 rounded-full bg-secondary cursor-pointer" onClick={seek}>
          <div className="h-full rounded-full bg-primary transition-all duration-150" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>{fmt(currentTime)}</span>
          <span>{duration ? fmt(duration) : "0:00"}</span>
        </div>
      </div>
    </div>
  );
};
const CRMLandingPage = () => {
  const [audioTemplates, setAudioTemplates] = useState<AudioTemplate[]>([]);
  const trackedSections = useRef(new Set<string>());

  // Track page view
  useCrmPageView();
  useEffect(() => { captureLeadSource(); }, []);

  // Track scroll depth & section visibility
  useEffect(() => {
    const sections = ["funcionalidades", "templates", "como-funciona", "diferenciais", "cta-final"];
    const observers: IntersectionObserver[] = [];

    sections.forEach((id) => {
      const el = document.getElementById(`section-${id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !trackedSections.current.has(id)) {
            trackedSections.current.add(id);
            trackCrmClick(`scroll_${id}`);
          }
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  useEffect(() => {
    supabase
      .from("message_templates")
      .select("id, name, media_url")
      .eq("media_type", "audio")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAudioTemplates(data as AudioTemplate[]);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, hsl(130,100%,36%), transparent 70%)" }} />
          <div className="absolute -bottom-60 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, hsl(130,100%,36%), transparent 70%)" }} />
        </div>

        <div className="section-container text-center py-10 md:py-20 relative z-10">
          <div className="flex flex-col items-center gap-3 mb-6 md:mb-8">
            <div className="badge-green animate-fade-in !py-1.5 !px-4">
              <span className="glow-dot" />
              <span className="text-xs">CRM iGreen Energy</span>
            </div>
            <img src="/images/logo-colorida-igreen.png" alt="iGreen Energy Logo" width={300} height={92} className="w-32 md:w-56 animate-fade-in" />
          </div>

          <h1 className="font-heading font-black mb-4 md:mb-6 text-[1.5rem] sm:text-3xl md:text-4xl lg:text-[3rem] leading-[1.15] max-w-5xl mx-auto px-4">
            Gerencie seus clientes, automatize vendas e{" "}
            <span className="relative inline" style={{ color: "hsl(var(--primary))" }}>feche mais negócios</span>
          </h1>

          <p className="hidden sm:block text-foreground/70 text-lg md:text-xl max-w-3xl mx-auto mb-8 md:mb-12 leading-relaxed">
            O CRM completo com WhatsApp integrado, Kanban de vendas, mensagens automáticas e dashboard de métricas — tudo em um só lugar.
          </p>

          {/* Video */}
          <div className="max-w-4xl mx-auto mb-8 md:mb-12 rounded-xl md:rounded-2xl overflow-hidden relative" style={{ boxShadow: "var(--shadow-green-lg)" }}>
            <div className="absolute inset-0 rounded-xl md:rounded-2xl border border-primary/20 z-10 pointer-events-none" />
            <video
              controls
              playsInline
              className="w-full aspect-video relative z-0"
              poster=""
              onPlay={() => trackCrmClick("video_play")}
              onPause={() => trackCrmClick("video_pause")}
              onEnded={() => trackCrmClick("video_completed")}
            >
              <source src="https://igreen-minio.d9v63q.easypanel.host/igreen/Video%20para%20venda%20do%20crm.mp4" type="video/mp4" />
              Seu navegador não suporta vídeos.
            </video>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center px-4">
            <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer" className="btn-cta-lg animate-pulse-green !py-3 sm:!py-4 !px-8 !text-base sm:!text-lg" onClick={() => trackCrmClick("hero_cta")}>
              ⚡ Quero conhecer o CRM
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 sm:gap-8 max-w-3xl mx-auto mt-12 md:mt-16 pt-8 border-t border-border">
            <div className="text-center">
              <AnimatedCounter target={6} suffix="+" />
              <p className="text-[11px] sm:text-xs mt-2 text-muted-foreground uppercase tracking-wider font-heading">Módulos integrados</p>
            </div>
            <div className="text-center">
              <AnimatedCounter target={100} suffix="%" />
              <p className="text-[11px] sm:text-xs mt-2 text-muted-foreground uppercase tracking-wider font-heading">Automatizado</p>
            </div>
            <div className="text-center">
              <AnimatedCounter target={24} suffix="/7" />
              <p className="text-[11px] sm:text-xs mt-2 text-muted-foreground uppercase tracking-wider font-heading">Disponível</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FUNCIONALIDADES ═══ */}
      <section id="section-funcionalidades" className="section-gradient">
        <div className="section-container">
          <div className="text-center mb-12 md:mb-16">
            <div className="badge-green mx-auto mb-4">
              <span className="glow-dot" />
              <span className="text-xs">Funcionalidades</span>
            </div>
            <h2 className="section-heading !text-2xl sm:!text-3xl md:!text-4xl">
              Tudo que você precisa para vender mais
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
              Cada módulo foi pensado para simplificar sua rotina e aumentar suas conversões.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {features.map((f) => (
              <div key={f.title} className="glass-card group cursor-default">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-primary/15 text-primary group-hover:bg-primary/25 transition-colors">
                  <f.icon size={24} />
                </div>
                <h3 className="font-heading font-bold text-lg text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TEMPLATES DE ÁUDIO ═══ */}
      {audioTemplates.length > 0 && (
        <section id="section-templates">
          <div className="section-container">
            <div className="text-center mb-12 md:mb-16">
              <div className="badge-green mx-auto mb-4">
                <span className="glow-dot" />
                <span className="text-xs">Templates prontos</span>
              </div>
              <h2 className="section-heading !text-2xl sm:!text-3xl md:!text-4xl">
                Áudios profissionais inclusos
              </h2>
              <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
                Utilize templates de áudio prontos para cada etapa do funil. Envie com um clique direto pelo CRM.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {audioTemplates.map((t) => (
                <div key={t.id} className="glass-card flex flex-col gap-3" onContextMenu={(e) => e.preventDefault()}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/15 text-primary shrink-0">
                      <Volume2 size={20} />
                    </div>
                    <h3 className="font-heading font-bold text-sm text-foreground truncate">{t.name}</h3>
                  </div>
                  <SecureAudioPlayer url={t.media_url} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ COMO FUNCIONA ═══ */}
      <section id="section-como-funciona">
        <div className="section-container">
          <div className="text-center mb-12 md:mb-16">
            <div className="badge-green mx-auto mb-4">
              <span className="glow-dot" />
              <span className="text-xs">Como funciona</span>
            </div>
            <h2 className="section-heading !text-2xl sm:!text-3xl md:!text-4xl">
              Comece em 3 passos simples
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-4xl mx-auto">
            {steps.map((s, i) => (
              <div key={s.num} className="relative text-center">
                <div className="product-number mx-auto mb-5 text-2xl">{s.num}</div>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-[80%]">
                    <div className="border-t-2 border-dashed border-primary/30" />
                  </div>
                )}
                <h3 className="font-heading font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DIFERENCIAIS ═══ */}
      <section id="section-diferenciais" className="section-gradient">
        <div className="section-container">
          <div className="text-center mb-12 md:mb-16">
            <div className="badge-green mx-auto mb-4">
              <span className="glow-dot" />
              <span className="text-xs">Diferenciais</span>
            </div>
            <h2 className="section-heading !text-2xl sm:!text-3xl md:!text-4xl">
              Por que escolher o CRM iGreen?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {differentials.map((d) => (
              <div key={d.title} className="glass-card text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-primary/15 text-primary">
                  <d.icon size={28} />
                </div>
                <h3 className="font-heading font-bold text-lg mb-2">{d.title}</h3>
                <p className="text-sm text-muted-foreground">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section id="section-cta-final" className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, hsl(130 100% 36% / 0.08), transparent 70%)" }} />
        <div className="section-container text-center relative z-10">
          <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl mb-4">
            Pronto para transformar suas vendas?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-8 text-lg">
            Junte-se aos consultores que já estão fechando mais negócios com o CRM iGreen Energy.
          </p>
          <a href={WHATSAPP_CTA} target="_blank" rel="noopener noreferrer" className="btn-cta-lg animate-pulse-green !py-4 !px-10 !text-lg" onClick={() => trackCrmClick("footer_cta")}>
            Quero contratar o CRM
          </a>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mt-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> Sem cartão de crédito</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> Setup em minutos</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> Suporte incluso</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} iGreen Energy — Todos os direitos reservados.
        </div>
      </footer>

      <WhatsAppFloat url={WHATSAPP_CTA} onClickTrack={() => trackCrmClick("whatsapp_float")} />
    </div>
  );
};

export default CRMLandingPage;

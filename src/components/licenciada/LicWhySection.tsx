import LazyVideo from "@/components/ui/LazyVideo";

const LicWhySection = () => (
  <section className="section-gradient relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(circle at 80% 50%, hsl(130, 100%, 36%), transparent 60%)' }} />
    <div className="section-container text-center relative z-10">
      <div className="badge-green mx-auto mb-6">Descubra</div>
      <h2 className="section-heading mb-4">Por que ser um licenciado iGreen Energy?</h2>
      <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-12">
        Assista ao vídeo e entenda como essa oportunidade pode transformar sua vida financeira
      </p>
      <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden relative" style={{ boxShadow: 'var(--shadow-green-lg)' }}>
        <div className="absolute inset-0 rounded-2xl border border-primary/20 z-10 pointer-events-none" />
        <LazyVideo src="https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/video%20igreen/Licenciadao-1.mp4" />
      </div>
    </div>
  </section>
);

export default LicWhySection;

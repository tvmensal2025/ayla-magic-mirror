const videos = [
  "/videos/depoimento-1.mp4",
  "/videos/depoimento-2.mp4",
  "/videos/depoimento-3.mp4",
  "/videos/depoimento-4.mp4",
  "/videos/depoimento-5.mp4",
];

const TestimonialsSection = () => (
  <section className="section-gradient relative overflow-hidden">
    <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(circle at 50% 80%, hsl(130, 100%, 36%), transparent 50%)' }} />
    <div className="section-container relative z-10">
      <div className="badge-green mx-auto mb-6">Depoimentos</div>
      <h2 className="section-heading mb-4">Clientes satisfeitos iGreen Energy</h2>
      <p className="text-center text-muted-foreground text-lg mb-14">
        Mais de 170 mil clientes já estão economizando na conta de luz
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {videos.map((src, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border border-border relative" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="absolute inset-0 rounded-2xl border border-primary/10 z-10 pointer-events-none" />
            <video controls preload="metadata" className="w-full aspect-video">
              <source src={src} type="video/mp4" />
            </video>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default TestimonialsSection;

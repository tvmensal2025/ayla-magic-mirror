const ClubSection = () => (
  <section>
    <div className="section-container">
      <div className="badge-green mx-auto mb-6">Benefícios</div>
      <h2 className="section-heading mb-14">Acesso gratuito ao iGreen Club</h2>

      <div className="max-w-4xl mx-auto">
        <div className="grid sm:grid-cols-2 gap-5 mb-14">
          <div className="glass-card text-center">
            <div className="text-4xl mb-3">🛍️</div>
            <p className="text-foreground/90 leading-relaxed">
              Além de pagar menos na energia, aproveite vantagens exclusivas, experiências imperdíveis e preços especiais no <strong className="text-primary">iGreen Club</strong>
            </p>
          </div>
          <div className="glass-card text-center">
            <div className="text-4xl mb-3">🏪</div>
            <p className="text-foreground/90 leading-relaxed">
              Descontos em mais de <strong className="text-primary">600 mil produtos</strong> e serviços em <strong className="text-primary">60 mil lojas</strong> parceiras em todo o Brasil
            </p>
          </div>
        </div>

        <h3 className="section-heading text-xl md:text-2xl mb-8">
          Confira algumas lojas com descontos exclusivos
        </h3>

        <div className="max-w-3xl mx-auto rounded-2xl overflow-hidden relative" style={{ boxShadow: 'var(--shadow-green-lg)' }}>
          <div className="absolute inset-0 rounded-2xl border border-primary/20 z-10 pointer-events-none" />
          <video controls className="w-full aspect-video relative z-0">
            <source src="/videos/igreen-club.mp4" type="video/mp4" />
            Seu navegador não suporta vídeos.
          </video>
        </div>
      </div>
    </div>
  </section>
);

export default ClubSection;

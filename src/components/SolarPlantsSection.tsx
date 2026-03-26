
const SolarPlantsSection = () => {
  return (
    <section>
      <div className="section-container">
        <h2 className="section-heading mb-6">Nossas usinas solares</h2>

        <div className="max-w-4xl mx-auto text-center">
          <img
            src="/images/feed-1.jpeg"
            alt="Usinas Solares iGreen"
            width={1024}
            height={1024}
            loading="lazy"
            className="rounded-xl w-full mb-8 shadow-lg"
            style={{ boxShadow: 'var(--shadow-card)' }}
          />

          <div className="space-y-4 text-left max-w-2xl mx-auto">
            <div className="benefit-item">
              <span>Temos mais de 500 usinas espalhadas pelo Brasil produzindo energia limpa, sustentável e mais barata</span>
            </div>
            <div className="benefit-item">
              <span>E o melhor de tudo, reduzindo toneladas de CO2 no meio ambiente</span>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <h3 className="section-heading text-2xl md:text-3xl mb-4">Conheça a UFV Hélio Valgas</h3>
          <p className="text-muted-foreground text-lg mb-8">Nossa usina solar em Várzea da Palma MG</p>
        <div className="max-w-3xl mx-auto rounded-2xl overflow-hidden shadow-lg">
            <video controls className="w-full aspect-video">
              <source src="/videos/usina-helio-valgas.mp4" type="video/mp4" />
              Seu navegador não suporta vídeos.
            </video>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SolarPlantsSection;

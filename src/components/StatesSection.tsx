
const StatesSection = () => {
  return (
    <section className="bg-secondary">
      <div className="section-container text-center">
        <h2 className="section-heading mb-10">
          Atualmente nós atendemos os seguintes estados
        </h2>

        <img
          src="/images/imagem-3.jpeg"
          alt="Mapa do Brasil - Estados atendidos pela iGreen Energy"
          width={1024}
          height={1024}
          loading="lazy"
          className="rounded-xl mx-auto max-w-lg w-full mb-8 shadow-lg"
          style={{ boxShadow: 'var(--shadow-card)' }}
        />

        <p className="text-primary text-xl font-heading font-bold">
          Em breve estaremos em todo o Brasil
        </p>
      </div>
    </section>
  );
};

export default StatesSection;

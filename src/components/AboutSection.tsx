

const aboutItems = [
  "A maior empresa de geração compartilhada de energia solar do Brasil, com mais de 500 mil clientes satisfeitos que economizam na sua conta de luz todos os meses de forma gratuita",
  "Uma empresa Mineira da cidade de Uberlândia que nasceu com o propósito de conscientizar as pessoas e empresas da importância de um futuro melhor através de práticas sustentáveis",
  "A nossa missão é conscientizar as pessoas dando a possibilidade de utilizarem uma energia limpa, renovável e inesgotável sem agredir o meio ambiente",
  "Estamos impactando não só o Brasil, mas o mundo. Juntos vamos transformar a vida das pessoas, democratizando o uso de uma energia limpa e mais econômica",
  "Faça parte deste propósito, muito mais que economia, você contribuindo para um mundo melhor",
];

const AboutSection = () => {
  return (
    <section className="relative">
      <div className="green-divider" />
      <div className="section-container">
        <h2 className="section-heading mb-12">
          Somos a iGreen Energy
        </h2>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <img
            src="/images/feed-10.jpeg"
            alt="Usina Solar iGreen Energy"
            width={1024}
            height={1024}
            loading="lazy"
            className="rounded-xl w-full shadow-lg"
            style={{ boxShadow: 'var(--shadow-card)' }}
          />

          <div className="space-y-4">
            {aboutItems.map((item, i) => (
              <div key={i} className="benefit-item">
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;

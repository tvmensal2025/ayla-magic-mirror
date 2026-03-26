

const steps = [
  "Nossas usinas produzem energia solar, a energia é injetada na rede da distribuidora, a distribuidora envia a energia para sua casa ou empresa, você economiza de forma gratuita sem investimentos",
  "Como a nossa energia solar é mais barata do que a energia hidrelétrica normalmente utilizada pelas distribuidoras, nós conseguimos oferecer um desconto de até 15% por mês para nossos clientes",
  "Você não paga nenhum centavo para ter acesso a esses descontos, não precisa instalar placas solares, não alteramos sua instalação de energia, não tem obras, não tem taxa de adesão, não tem mensalidade, não tem fidelidade. Todo o cadastro é 100% online e gratuito",
  "Nós atendemos casas, apartamentos, prédios, condomínios, fazendas, comércios e empresas",
  "Nosso trabalho está regulamentado pela Lei Federal 14.300 de 6 de Janeiro de 2022",
];

const HowItWorksSection = () => {
  return (
    <section className="bg-secondary">
      <div className="section-container">
        <h2 className="section-heading mb-12">
          Como funciona a energia solar da iGreen Energy
        </h2>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="benefit-item">
                <span>{step}</span>
              </div>
            ))}
          </div>

          <img
            src="/images/foto-12-como-funciona.jpeg"
            alt="Como funciona a energia solar"
            width={1024}
            height={1024}
            loading="lazy"
            className="rounded-xl w-full shadow-lg"
            style={{ boxShadow: 'var(--shadow-card)' }}
          />
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;

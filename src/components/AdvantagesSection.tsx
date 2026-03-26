import phoneApp from "@/assets/phone-app.jpg";

const advantages = [
  "Economia de até 15% todos os meses na sua conta de luz",
  "Cashback Sustentável de até 2% por indicação, podendo zerar sua conta",
  "Descontos exclusivos em mais de 30 mil lojas em todo o Brasil",
  "Benefícios gratuitos",
  "Sem custos adicionais",
  "Sem burocracia e riscos",
  "Sem fidelidade",
  "Sem necessidade de comprar placas solares",
  "100% digital",
];

const AdvantagesSection = () => {
  return (
    <section className="bg-secondary">
      <div className="section-container">
        <h2 className="section-heading mb-12">
          Vantagens de ser iGreen Energy
        </h2>

        <div className="grid md:grid-cols-2 gap-10 items-center">
          <img
            src={phoneApp}
            alt="App iGreen Energy"
            width={800}
            height={800}
            loading="lazy"
            className="rounded-xl w-full max-w-sm mx-auto"
          />

          <div className="space-y-4">
            {advantages.map((adv, i) => (
              <div key={i} className="benefit-item text-lg">
                <span>{adv}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AdvantagesSection;

const referralItems = [
  "Você também participa do nosso Programa de Indicações, chamado de Cashback Sustentável",
  "Ao indicar um novo cliente aprovado, você receberá um cashback todos os meses, que será usado para reduzir o valor do seu boleto iGreen Energy",
  "Para cada indicação você ganha até 2% de cashback calculado com base no boleto iGreen Energy pago pelo cliente que você indicou",
  "Por exemplo, se você indicar um cliente com uma conta de luz no valor de R$ 500,00, será contabilizado o cashback de até 2% desse valor, equivalente a R$ 10,00 de cashback",
  "Esse valor de R$ 10,00 será abatido automaticamente no seu próximo boleto iGreen Energy",
  "Essa é uma excelente oportunidade para você aumentar sua economia apenas indicando novos clientes",
  "Quanto mais clientes você indicar, mais cashback acumulará, aumentando a possibilidade de zerar o valor da sua conta de luz",
];

const ReferralSection = () => {
  return (
    <section>
      <div className="section-container">
        <h2 className="section-heading mb-12">
          Programa de indicações iGreen Energy
        </h2>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          <img
            src="/images/cashback-sustentavel.jpeg"
            alt="Cashback Sustentável iGreen Energy"
            width={1024}
            height={931}
            loading="lazy"
            className="rounded-xl w-full shadow-lg"
            style={{ boxShadow: 'var(--shadow-card)' }}
          />

          <div className="space-y-4">
            {referralItems.map((item, i) => (
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

export default ReferralSection;

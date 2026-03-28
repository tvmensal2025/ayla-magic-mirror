const referralItems = [
  { icon: "🔄", text: "Você também participa do nosso Programa de Indicações, chamado de Cashback Sustentável" },
  { icon: "💰", text: "Ao indicar um novo cliente aprovado, você receberá um cashback todos os meses, que será usado para reduzir o valor do seu boleto iGreen Energy" },
  { icon: "📊", text: "Para cada indicação você ganha até 2% de cashback calculado com base no boleto iGreen Energy pago pelo cliente que você indicou" },
  { icon: "💡", text: "Por exemplo, se você indicar um cliente com uma conta de luz de R$ 500, será contabilizado até R$ 10,00 de cashback — abatido automaticamente no seu próximo boleto" },
  { icon: "🚀", text: "Quanto mais clientes você indicar, mais cashback acumulará, aumentando a possibilidade de zerar o valor da sua conta de luz" },
];

const ReferralSection = () => (
  <section>
    <div className="section-container">
      <div className="badge-green mx-auto mb-6">Indicação</div>
      <h2 className="section-heading mb-14">Programa de indicações iGreen Energy</h2>

      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="relative group">
          <div className="absolute -inset-4 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: 'radial-gradient(circle, hsl(130 100% 36% / 0.1), transparent 70%)' }} />
          <img
            src="/images/cashback-sustentavel.jpeg"
            alt="Cashback Sustentável iGreen Energy"
            loading="lazy"
            className="rounded-2xl w-full shadow-lg relative z-10 transition-transform duration-500 group-hover:scale-[1.02]"
            style={{ boxShadow: 'var(--shadow-card)' }}
          />
        </div>

        <div className="space-y-5">
          {referralItems.map((item, i) => (
            <div key={i} className="glass-card !p-4 !rounded-xl flex items-start gap-3">
              <span className="text-2xl shrink-0">{item.icon}</span>
              <span className="text-foreground/90 leading-relaxed">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default ReferralSection;

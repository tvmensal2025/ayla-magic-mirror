const benefits = [
  "Receba comissões sempre que pessoas e empresas pagam a conta de luz e planos de telefonia móvel todos os meses",
  "Construa uma carteira de clientes que te gera renda passiva, recorrente, vitalícia e hereditária",
  "Ofereça descontos e benefícios gratuitos para residências e empresas",
  "Conquiste sua Liberdade Financeira e se aposente em tempo recorde",
  "Receba bônus e premiações constantes",
  "Tenha acesso a materiais, treinamentos e suporte exclusivos",
  "Participe do Plano de Carreira da maior empresa de energia solar do Brasil",
  "Tenha acesso gratuito ao iGreen Club com descontos em mais de 30 mil lojas em todo o Brasil",
  "Seja um profissional muito bem remunerado, em um mercado bilionário com crescimento exponencial",
];

const LicBenefitsSection = () => (
  <section>
    <div className="section-container">
      <h2 className="section-heading mb-12">Benefícios dos licenciados iGreen Energy</h2>
      <div className="max-w-3xl mx-auto space-y-4">
        {benefits.map((b, i) => (
          <div key={i} className="benefit-item text-lg"><span>{b}</span></div>
        ))}
      </div>
    </div>
  </section>
);

export default LicBenefitsSection;

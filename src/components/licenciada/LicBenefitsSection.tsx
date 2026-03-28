const benefits = [
  { icon: "💰", text: "Receba comissões sempre que pessoas e empresas pagam a conta de luz e planos de telefonia móvel todos os meses" },
  { icon: "🔄", text: "Construa uma carteira de clientes que te gera renda passiva, recorrente, vitalícia e hereditária" },
  { icon: "🎁", text: "Ofereça descontos e benefícios gratuitos para residências e empresas" },
  { icon: "🏆", text: "Conquiste sua Liberdade Financeira e se aposente em tempo recorde" },
  { icon: "🎯", text: "Receba bônus e premiações constantes" },
  { icon: "📚", text: "Tenha acesso a materiais, treinamentos e suporte exclusivos" },
  { icon: "📈", text: "Participe do Plano de Carreira da maior empresa de energia solar do Brasil" },
  { icon: "🛒", text: "Tenha acesso gratuito ao iGreen Club com descontos em mais de 30 mil lojas em todo o Brasil" },
  { icon: "⚡", text: "Seja um profissional muito bem remunerado, em um mercado bilionário com crescimento exponencial" },
];

const LicBenefitsSection = () => (
  <section>
    <div className="section-container">
      <div className="badge-green mx-auto mb-6">Vantagens</div>
      <h2 className="section-heading mb-4">Benefícios dos licenciados iGreen Energy</h2>
      <p className="text-center text-muted-foreground mb-14 max-w-2xl mx-auto">
        Enquanto você lê isso, outros já estão faturando. <strong className="text-foreground">Não espere mais.</strong>
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
        {benefits.map((b, i) => (
          <div key={i} className="glass-card group cursor-default">
            <div className="text-3xl mb-4">{b.icon}</div>
            <p className="text-foreground/90 leading-relaxed">{b.text}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default LicBenefitsSection;

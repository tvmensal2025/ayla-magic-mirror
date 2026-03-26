const licenseItems = [
  "Receba um Kit com crachá, folders iGreen Energy e iGreen Telecom, adesivos de casa / empresa / condomínio sustentável, chips físicos e digitais",
  "Acesso ao aplicativo iGreen com todas as funções disponíveis para conexões, acompanhamento de status e muito mais",
  "Suporte personalizado para Licenciados e Clientes",
  "Material de apoio impresso e digital",
  "Treinamentos online do iGreen Academy",
  "Benefícios exclusivos do iGreen Club com descontos em mais de 30 mil estabelecimentos em todo o Brasil",
  "Amigo do meio ambiente, contribuindo para um mundo mais sustentável",
];

const LicLicenseSection = () => (
  <section className="bg-secondary">
    <div className="section-container">
      <h2 className="section-heading mb-4">Licença iGreen Energy</h2>
      <p className="text-center text-foreground/80 text-xl font-heading font-bold mb-12">
        Seja nosso licenciado e mude sua realidade financeira
      </p>
      <div className="max-w-3xl mx-auto space-y-4">
        {licenseItems.map((item, i) => (
          <div key={i} className="benefit-item text-lg"><span>{item}</span></div>
        ))}
      </div>
    </div>
  </section>
);

export default LicLicenseSection;

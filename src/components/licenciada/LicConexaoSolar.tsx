import CommissionBlock from "./CommissionBlock";

const LicConexaoSolar = () => (
  <section>
    <div className="section-container">
      <h2 className="section-heading mb-4">3. Conexão Solar</h2>
      <p className="text-center text-foreground/80 text-lg max-w-3xl mx-auto mb-12">
        Serviço prestado pela iGreen onde o cliente receberá a instalação de placas solares sem investimentos, sem custos de operação e manutenção, garantindo desconto na sua conta de luz todos os meses gratuitamente
      </p>
      <img src="/images/conexao-solar.webp" alt="Conexão Solar" loading="lazy" className="rounded-xl w-full max-w-2xl mx-auto mb-12 shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />

      <h3 className="section-heading text-2xl md:text-3xl mb-8">Como você é remunerado com a Conexão Solar?</h3>
      <div className="max-w-3xl mx-auto">
        <CommissionBlock title="CP (Conexão Própria)" items={["2% de comissão recorrente sobre o boleto da iGreen"]} />
        <CommissionBlock title="CI (Conexão Indireta)" items={["0,5% de comissão recorrente sobre o boleto da iGreen"]} />
      </div>
    </div>
  </section>
);

export default LicConexaoSolar;

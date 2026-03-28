import CommissionBlock from "./CommissionBlock";

const LicConexaoSolar = () => (
  <section>
    <div className="section-container">
      <div className="text-center mb-12">
        <div className="product-number mx-auto mb-4">3</div>
        <h2 className="section-heading mb-4">Conexão Solar</h2>
        <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
          Serviço prestado pela iGreen onde o cliente receberá a instalação de placas solares sem investimentos, sem custos de operação e manutenção, garantindo desconto na sua conta de luz todos os meses gratuitamente
        </p>
      </div>
      <img src="/images/conexao-solar.webp" alt="Conexão Solar" loading="lazy" className="rounded-2xl w-full max-w-2xl mx-auto mb-14 shadow-lg transition-transform duration-500 hover:scale-[1.02]" style={{ boxShadow: 'var(--shadow-card)' }} />

      <h3 className="section-heading text-2xl md:text-3xl mb-8">Como você é remunerado com a Conexão Solar?</h3>
      <div className="max-w-3xl mx-auto">
        <CommissionBlock title="CP (Conexão Própria)" items={["2% de comissão recorrente sobre o boleto da iGreen"]} />
        <CommissionBlock title="CI (Conexão Indireta)" items={["0,5% de comissão recorrente sobre o boleto da iGreen"]} />
      </div>
    </div>
  </section>
);

export default LicConexaoSolar;

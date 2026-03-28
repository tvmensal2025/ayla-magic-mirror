import CommissionBlock from "./CommissionBlock";
import CareerTable from "./CareerTable";

const LicConexaoLivre = () => (
  <section className="section-gradient">
    <div className="section-container">
      <div className="text-center mb-12">
        <div className="product-number mx-auto mb-4">2</div>
        <h2 className="section-heading mb-4">Conexão Livre</h2>
        <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
          Serviço prestado pela iGreen que conecta o cliente de média e alta tensão (como indústrias e grandes complexos comerciais) ao mercado livre de energia, oferecendo um desconto de até 30% na sua conta de luz, válido em todo o Brasil
        </p>
      </div>
      <img src="/images/conexao-livre.webp" alt="Conexão Livre" loading="lazy" className="rounded-2xl w-full max-w-2xl mx-auto mb-14 shadow-lg transition-transform duration-500 hover:scale-[1.02]" style={{ boxShadow: 'var(--shadow-card)' }} />

      <h3 className="section-heading text-2xl md:text-3xl mb-8">Como você é remunerado com a Conexão Livre?</h3>
      <div className="max-w-3xl mx-auto">
        <CommissionBlock title="CP (Conexão Própria)" items={[
          "Modalidade Varejista: até 2% de comissão recorrente sobre a energia contratada pelo cliente",
          "Modalidade Atacadista: de 4% até 12% sob o valor da gestão + 100% de kWh em cima da gestão",
        ]} />
        <CommissionBlock title="CI (Conexão Indireta)" items={[
          "Modalidade Varejista: até 0,5% de comissão recorrente sobre a energia contratada pelo cliente",
          "Modalidade Atacadista: 1% de comissão recorrente sobre o valor da gestão",
        ]} />
        <CareerTable label="Plano de Carreira — Conexão Livre:" items={[
          "S-Expansão ou Sênior: + 0,1%", "G-Expansão: + 0,15%", "Gestor: + 0,25%", "E-Expansão: + 0,3%",
          "Executivo: + 0,4%", "D-Expansão: + 0,45%", "Diretor: + 0,6%", "Acionista: + 0,75%",
        ]} />
      </div>
    </div>
  </section>
);

export default LicConexaoLivre;

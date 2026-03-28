import CommissionBlock from "./CommissionBlock";
import CareerTable from "./CareerTable";

const LicConexaoPlacas = () => (
  <section className="section-gradient">
    <div className="section-container">
      <div className="text-center mb-12">
        <div className="product-number mx-auto mb-4">4</div>
        <h2 className="section-heading mb-4">Conexão Placas</h2>
        <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
          Serviço prestado pela iGreen que conecta o cliente a um de nossos fornecedores para a compra e instalação de placas solares para economia de até 95% na conta de luz, válido em todo o Brasil
        </p>
      </div>
      <img src="/images/conexao-placas.webp" alt="Conexão Placas" loading="lazy" className="rounded-2xl w-full max-w-2xl mx-auto mb-14 shadow-lg transition-transform duration-500 hover:scale-[1.02]" style={{ boxShadow: 'var(--shadow-card)' }} />

      <h3 className="section-heading text-2xl md:text-3xl mb-8">Como você é remunerado com a Conexão Placas?</h3>
      <div className="max-w-3xl mx-auto">
        <CommissionBlock title="CP (Conexão Própria)" items={[
          "Até 10% de comissão sobre o valor total do projeto. Por exemplo, se o projeto de placas solares ficar em R$ 10.000, você recebe até R$ 1.000 de comissão",
        ]} />
        <CommissionBlock title="CI (Conexão Indireta)" items={["1% de comissão sobre o valor total do projeto"]} />
        <CareerTable label="Plano de Carreira — Conexão Placas:" items={[
          "S-Expansão ou Sênior: + 0,2%", "G-Expansão: + 0,3%", "Gestor: + 0,5%", "E-Expansão: + 0,6%",
          "Executivo: + 0,8%", "D-Expansão: + 0,9%", "Diretor: + 1,2%", "Acionista: + 1,5%",
        ]} />
      </div>
    </div>
  </section>
);

export default LicConexaoPlacas;

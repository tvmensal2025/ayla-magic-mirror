import CommissionBlock from "./CommissionBlock";
import CareerTable from "./CareerTable";

const LicConexaoTelecom = () => (
  <section className="bg-secondary">
    <div className="section-container">
      <h2 className="section-heading mb-4">8. Conexão Telecom</h2>
      <p className="text-center text-foreground/80 text-lg max-w-3xl mx-auto mb-12">
        A solução para clientes que buscam telefonia com planos acessíveis e internet de alta velocidade, com a maior cobertura 5G do Brasil
      </p>

      <p className="text-foreground/80 text-center max-w-3xl mx-auto mb-8">
        Para todos os planos oferecidos, os valores das comissões permanecem iguais, independentemente do plano escolhido
      </p>

      <h3 className="section-heading text-2xl md:text-3xl mb-8">Como você é remunerado com a Conexão Telecom?</h3>
      <div className="max-w-3xl mx-auto">
        <CommissionBlock title="CP (Conexão Própria)" items={[
          "R$ 7,00 de comissão recorrente por plano conectado + R$ 10,00 na ativação",
        ]} />
        <CommissionBlock title="CI (Conexão Indireta)" items={[
          "R$ 1,00 de comissão recorrente por plano conectado",
        ]} />
        <CareerTable label="Plano de Carreira — Conexão Telecom:" items={[
          "S-Expansão ou Sênior: + R$ 1,00", "G-Expansão: + R$ 1,50", "Gestor: + R$ 2,00", "E-Expansão: + R$ 2,50",
          "Executivo: + R$ 3,00", "D-Expansão: + R$ 3,50", "Diretor: + R$ 5,00", "Acionista: + R$ 6,00",
        ]} />
      </div>
    </div>
  </section>
);

export default LicConexaoTelecom;

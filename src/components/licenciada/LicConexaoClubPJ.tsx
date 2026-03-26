import CommissionBlock from "./CommissionBlock";
import CareerTable from "./CareerTable";

const pjItems = [
  "Ao aderir à Conexão Club Empresarial, há uma cobrança mensal conforme o plano escolhido pelo seu cliente",
  "É importante observar que clientes da Conexão Green e Licenciados já possuem acesso ao iGreen Club de forma totalmente gratuita",
  "Ao cadastrar um cliente através do Conexão Club Empresarial, você passa a receber ganhos recorrentes com base na mensalidade",
];

const LicConexaoClubPJ = () => (
  <section className="bg-secondary">
    <div className="section-container">
      <h2 className="section-heading mb-4">6. Conexão Club PJ (Empresarial)</h2>
      <p className="text-center text-foreground/80 text-lg max-w-3xl mx-auto mb-12">
        Serviço prestado pela iGreen que conecta empresas interessadas em fidelizar clientes e colaboradores por meio dos benefícios exclusivos do iGreen Club
      </p>
      <img src="/images/igreen-club-2.jpeg" alt="Conexão Club PJ" loading="lazy" className="rounded-xl w-full max-w-2xl mx-auto mb-12 shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />

      <div className="max-w-3xl mx-auto space-y-4 mb-12">
        {pjItems.map((item, i) => <div key={i} className="benefit-item"><span>{item}</span></div>)}
      </div>

      <h3 className="section-heading text-2xl md:text-3xl mb-8">Como você é remunerado com a Conexão Club PJ (Empresarial)?</h3>
      <div className="max-w-3xl mx-auto">
        <CommissionBlock title="CP (Conexão Própria)" items={["20% do valor da assinatura todos os meses"]} />
        <CommissionBlock title="CI (Conexão Indireta)" items={["5% do valor da assinatura todos os meses"]} />
        <CareerTable label="Plano de Carreira — Conexão Club PJ:" items={[
          "S-Expansão ou Sênior: + 1,3%", "G-Expansão: + 2%", "Gestor: + 3,3%", "E-Expansão: + 4%",
          "Executivo: + 5,3%", "D-Expansão: + 6%", "Diretor: + 8%", "Acionista: + 10%",
        ]} />
      </div>
    </div>
  </section>
);

export default LicConexaoClubPJ;

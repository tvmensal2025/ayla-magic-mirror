import CommissionBlock from "./CommissionBlock";
import CareerTable from "./CareerTable";

const clubItems = [
  "Clientes Conexão Club tem um novo jeito de economizar, aproveitando vantagens exclusivas, experiências imperdíveis e preços especiais no iGreen Club",
  "Nosso clube de benefícios oferece descontos em mais de 600.000 produtos e serviços nas 30 mil lojas parceiras em todo o Brasil, como farmácias, restaurantes, cinemas, roupas, calçados, eletrônicos, eletrodomésticos, faculdades, escolas de inglês, clínicas médicas e muito mais",
  "Ao se cadastrar na Conexão Club, o cliente paga apenas R$ 19,90 por mês",
  "É importante observar que clientes da Conexão Green e Licenciados já possuem acesso ao iGreen Club de forma totalmente gratuita",
];

const LicConexaoClub = () => (
  <section>
    <div className="section-container">
      <h2 className="section-heading mb-4">5. Conexão Club (Individual)</h2>
      <p className="text-center text-foreground/80 text-lg max-w-3xl mx-auto mb-12">
        Serviço prestado pela iGreen que conecta o cliente ao iGreen Club, nosso clube de descontos em mais de 30 mil estabelecimentos em todo o Brasil
      </p>
      <img src="/images/conexao-club.webp" alt="iGreen Club" loading="lazy" className="rounded-xl w-full max-w-2xl mx-auto mb-12 shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />

      <h3 className="section-heading text-2xl md:text-3xl mb-8">iGreen Club</h3>
      <div className="max-w-3xl mx-auto space-y-4 mb-12">
        {clubItems.map((item, i) => <div key={i} className="benefit-item"><span>{item}</span></div>)}
      </div>

      <h3 className="section-heading text-xl md:text-2xl mb-8">Confira algumas lojas onde clientes e licenciados iGreen têm descontos exclusivos</h3>
      <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
        <img src="/images/igreen-club-1.jpeg" alt="Lojas parceiras" loading="lazy" className="rounded-xl w-full shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />
        <img src="/images/igreen-club-2.jpeg" alt="Lojas parceiras" loading="lazy" className="rounded-xl w-full shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />
        <img src="/images/igreen-club-3.jpeg" alt="Lojas parceiras" loading="lazy" className="rounded-xl w-full shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />
      </div>

      <div className="green-divider mb-12" />
      <h3 className="section-heading text-2xl md:text-3xl mb-8">Como você é remunerado com a Conexão Club (Individual)?</h3>
      <div className="max-w-3xl mx-auto">
        <CommissionBlock title="CP (Conexão Própria)" items={["25% do valor da assinatura todos os meses"]} />
        <CommissionBlock title="CI (Conexão Indireta)" items={["5% do valor da assinatura todos os meses"]} />
        <CareerTable label="Plano de Carreira — Conexão Club:" items={[
          "S-Expansão ou Sênior: + 2%", "G-Expansão: + 3%", "Gestor: + 5%", "E-Expansão: + 6%",
          "Executivo: + 8%", "D-Expansão: + 9%", "Diretor: + 12%", "Acionista: + 15%",
        ]} />
      </div>
    </div>
  </section>
);

export default LicConexaoClub;

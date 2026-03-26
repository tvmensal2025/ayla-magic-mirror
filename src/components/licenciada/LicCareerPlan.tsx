const levels = [
  { title: "1. Sênior", kwh: "10.000 kWh", income: "R$ 500/mês", items: [
    "Conexão Green: + 0,2%", "Conexão Livre: + 0,1%", "Conexão Placas: + 0,2%",
    "Conexão Club: + 2%", "Conexão Club PJ: + 1,3%", "Conexão Telecom: + R$ 1,00",
    "Conexão Expansão: + R$ 70 por Licenciado Direto",
  ]},
  { title: "2. Gestor", kwh: "50.000 kWh", income: "R$ 2.000/mês + iGreen Experience", items: [
    "Conexão Green: + 0,5%", "Conexão Livre: + 0,25%", "Conexão Placas: + 0,5%",
    "Conexão Club: + 5%", "Conexão Club PJ: + 3,3%", "Conexão Telecom: + R$ 2,00",
    "Conexão Expansão: + R$ 130 por Licenciado Direto",
  ]},
  { title: "3. Executivo", kwh: "150.000 kWh", income: "R$ 5.000/mês + Viagem de Cruzeiro", items: [
    "Conexão Green: + 0,8%", "Conexão Livre: + 0,4%", "Conexão Placas: + 0,8%",
    "Conexão Club: + 8%", "Conexão Club PJ: + 5,3%", "Conexão Telecom: + R$ 3,00",
    "Conexão Expansão: + R$ 190 por Licenciado Direto",
  ]},
  { title: "4. Diretor", kwh: "500.000 kWh", income: "R$ 25.000/mês + Viagem Internacional", items: [
    "Conexão Green: + 1,4%", "Conexão Livre: + 0,6%", "Conexão Placas: + 1,2%",
    "Conexão Club: + 12%", "Conexão Club PJ: + 8%", "Conexão Telecom: + R$ 5,00",
    "Conexão Expansão: + R$ 250 por Licenciado Direto",
  ]},
  { title: "5. Acionista", kwh: "1.000.000 kWh", income: "R$ 50.000/mês + Viagem Internacional", items: [
    "Conexão Green: + 1,8%", "Conexão Livre: + 0,75%", "Conexão Placas: + 1,5%",
    "Conexão Club: + 15%", "Conexão Club PJ: + 10%", "Conexão Telecom: + R$ 6,00",
    "Conexão Expansão: + R$ 300 por Licenciado Direto",
  ]},
];

const LicCareerPlan = () => (
  <section>
    <div className="section-container">
      <h2 className="section-heading mb-12">Plano de Carreira iGreen Energy</h2>
      <img src="/images/plano-carreira.webp" alt="Plano de Carreira iGreen Energy" loading="lazy" className="rounded-xl w-full max-w-3xl mx-auto mb-12 shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />
      <div className="max-w-4xl mx-auto space-y-10">
        {levels.map((level, i) => (
          <div key={i} className="bg-card rounded-xl p-6 md:p-8 border border-border" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h3 className="section-heading text-2xl md:text-3xl mb-2 text-left">{level.title}</h3>
            <p className="text-foreground/80 mb-6">
              Ao acumular {level.kwh}, prévia de ganho de {level.income}
            </p>
            <div className="space-y-3">
              {level.items.map((item, j) => (
                <div key={j} className="benefit-item"><span>{item}</span></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default LicCareerPlan;

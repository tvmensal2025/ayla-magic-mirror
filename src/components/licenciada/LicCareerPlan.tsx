const levels = [
  { title: "1. Sênior", kwh: "10.000 kWh", income: "R$ 500/mês", color: "hsl(130, 60%, 40%)", items: [
    "Conexão Green: + 0,2%", "Conexão Livre: + 0,1%", "Conexão Placas: + 0,2%",
    "Conexão Club: + 2%", "Conexão Club PJ: + 1,3%", "Conexão Telecom: + R$ 1,00",
    "Conexão Expansão: + R$ 70 por Licenciado Direto",
  ]},
  { title: "2. Gestor", kwh: "50.000 kWh", income: "R$ 2.000/mês + iGreen Experience", color: "hsl(130, 70%, 38%)", items: [
    "Conexão Green: + 0,5%", "Conexão Livre: + 0,25%", "Conexão Placas: + 0,5%",
    "Conexão Club: + 5%", "Conexão Club PJ: + 3,3%", "Conexão Telecom: + R$ 2,00",
    "Conexão Expansão: + R$ 130 por Licenciado Direto",
  ]},
  { title: "3. Executivo", kwh: "150.000 kWh", income: "R$ 5.000/mês + Viagem de Cruzeiro", color: "hsl(130, 80%, 36%)", items: [
    "Conexão Green: + 0,8%", "Conexão Livre: + 0,4%", "Conexão Placas: + 0,8%",
    "Conexão Club: + 8%", "Conexão Club PJ: + 5,3%", "Conexão Telecom: + R$ 3,00",
    "Conexão Expansão: + R$ 190 por Licenciado Direto",
  ]},
  { title: "4. Diretor", kwh: "500.000 kWh", income: "R$ 25.000/mês + Viagem Internacional", color: "hsl(35, 100%, 50%)", items: [
    "Conexão Green: + 1,4%", "Conexão Livre: + 0,6%", "Conexão Placas: + 1,2%",
    "Conexão Club: + 12%", "Conexão Club PJ: + 8%", "Conexão Telecom: + R$ 5,00",
    "Conexão Expansão: + R$ 250 por Licenciado Direto",
  ]},
  { title: "5. Acionista", kwh: "1.000.000 kWh", income: "R$ 50.000/mês + Viagem Internacional", color: "hsl(30, 100%, 50%)", items: [
    "Conexão Green: + 1,8%", "Conexão Livre: + 0,75%", "Conexão Placas: + 1,5%",
    "Conexão Club: + 15%", "Conexão Club PJ: + 10%", "Conexão Telecom: + R$ 6,00",
    "Conexão Expansão: + R$ 300 por Licenciado Direto",
  ]},
];

const LicCareerPlan = () => (
  <section>
    <div className="section-container">
      <div className="badge-green mx-auto mb-6">Carreira</div>
      <h2 className="section-heading mb-14">Plano de Carreira iGreen Energy</h2>
      <img src="/images/plano-carreira.webp" alt="Plano de Carreira iGreen Energy" loading="lazy" className="rounded-2xl w-full max-w-3xl mx-auto mb-14 shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }} />
      <div className="max-w-4xl mx-auto space-y-6">
        {levels.map((level, i) => (
          <div key={i} className="glass-card relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: level.color }} />
            <div className="pl-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h3 className="font-heading font-black text-2xl md:text-3xl" style={{ color: level.color }}>{level.title}</h3>
                <div className="badge-green !text-xs">{level.income}</div>
              </div>
              <p className="text-foreground/70 mb-6 text-sm">
                Ao acumular <strong className="text-foreground">{level.kwh}</strong>
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {level.items.map((item, j) => (
                  <div key={j} className="flex items-center gap-2 text-sm text-foreground/80 py-1.5 px-3 rounded-lg bg-muted/50">
                    <span className="glow-dot !w-2 !h-2" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default LicCareerPlan;

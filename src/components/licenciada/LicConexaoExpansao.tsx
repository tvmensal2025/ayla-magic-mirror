const LicConexaoExpansao = () => (
  <section>
    <div className="section-container">
      <div className="text-center mb-12">
        <div className="product-number mx-auto mb-4">7</div>
        <h2 className="section-heading mb-4">Conexão Expansão</h2>
        <p className="text-foreground/70 text-lg max-w-3xl mx-auto">
          Você também recebe Bônus e Comissões quando faz a Expansão do seu negócio, formando uma Equipe de Licenciados
        </p>
      </div>

      <img src="/images/conexao-expansao.webp" alt="Conexão Expansão" loading="lazy" className="rounded-2xl w-full max-w-2xl mx-auto mb-14 shadow-lg transition-transform duration-500 hover:scale-[1.02]" style={{ boxShadow: 'var(--shadow-card)' }} />

      <div className="max-w-3xl mx-auto space-y-8">
        <div className="glass-card">
          <p className="text-foreground/80 mb-6">Ao se tornar um Licenciado iGreen Energy, você recebe o direito de formar uma Equipe Comercial cadastrando Novos Licenciados</p>

          <h4 className="font-heading font-bold text-lg mb-4" style={{ color: 'hsl(var(--primary))' }}>Para cada Licenciado Direto que você cadastrar (1º nível)</h4>
          <div className="space-y-3 mb-8">
            <div className="benefit-item"><span>R$ 300,00 de Bônus</span></div>
            <div className="benefit-item"><span>Porcentagens de Comissão sobre todo o trabalho que o Licenciado desenvolver na iGreen</span></div>
            <div className="benefit-item"><span>30% de todo o kWh que seu Licenciado acumular, para você utilizar na sua progressão no Plano de Carreira</span></div>
          </div>

          <h4 className="font-heading font-bold text-lg mb-4" style={{ color: 'hsl(var(--primary))' }}>Quando seu Licenciado Direto cadastra outro Licenciado (2º nível)</h4>
          <div className="space-y-3">
            <div className="benefit-item"><span>R$ 100,00 de Bônus</span></div>
            <div className="benefit-item"><span>Porcentagens de Comissão sobre todo o trabalho que o Licenciado desenvolver na iGreen</span></div>
            <div className="benefit-item"><span>Isso vai acontecendo até o Licenciado cadastrado no seu 5º nível</span></div>
          </div>
        </div>

        <div className="glass-card">
          <h4 className="font-heading font-bold text-lg mb-4" style={{ color: 'hsl(var(--accent))' }}>Qualificação por Equipe de Licenciados</h4>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              "S-Expansão: 2 Licenciados Diretos Ativos",
              "G-Expansão: 5 Licenciados Diretos Ativos sendo 2 S-Expansão",
              "E-Expansão: 7 Licenciados Diretos Ativos sendo 2 G-Expansão",
              "D-Expansão: 10 Licenciados Diretos Ativos sendo 2 G-Expansão e 2 E-Expansão",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-foreground/80 py-1.5 px-3 rounded-lg bg-muted/50">
                <span className="glow-dot !w-2 !h-2" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default LicConexaoExpansao;

const LicConexaoExpansao = () => (
  <section>
    <div className="section-container">
      <h2 className="section-heading mb-4">7. Conexão Expansão</h2>
      <p className="text-center text-foreground/80 text-lg max-w-3xl mx-auto mb-12">
        Você também recebe Bônus e Comissões quando faz a Expansão do seu negócio, formando uma Equipe de Licenciados
      </p>

      <div className="max-w-3xl mx-auto">
        <p className="text-foreground/80 mb-6">Ao se tornar um Licenciado iGreen Energy, você recebe o direito de formar uma Equipe Comercial cadastrando Novos Licenciados</p>

        <h4 className="text-primary font-heading font-bold text-lg mb-4">Para cada Licenciado Direto (1º nível):</h4>
        <div className="space-y-3 mb-8">
          <div className="benefit-item"><span>R$ 300,00 de Bônus</span></div>
          <div className="benefit-item"><span>Porcentagens de Comissão sobre todo o trabalho que o Licenciado desenvolver na iGreen</span></div>
          <div className="benefit-item"><span>30% de todo o kWh que seu Licenciado acumular, para você utilizar na sua progressão no Plano de Carreira</span></div>
        </div>

        <h4 className="text-primary font-heading font-bold text-lg mb-4">Quando seu Licenciado Direto cadastra outro (2º nível):</h4>
        <div className="space-y-3 mb-8">
          <div className="benefit-item"><span>R$ 100,00 de Bônus</span></div>
          <div className="benefit-item"><span>Porcentagens de Comissão sobre todo o trabalho que o Licenciado desenvolver na iGreen</span></div>
          <div className="benefit-item"><span>Isso vai acontecendo até o Licenciado cadastrado no seu 5º nível</span></div>
        </div>

        <h4 className="text-primary font-heading font-bold text-lg mb-4">Qualificação por Equipe de Licenciados:</h4>
        <div className="space-y-3">
          <div className="benefit-item"><span>S-Expansão: 2 Licenciados Diretos Ativos</span></div>
          <div className="benefit-item"><span>G-Expansão: 5 Licenciados Diretos Ativos sendo 2 S-Expansão</span></div>
          <div className="benefit-item"><span>E-Expansão: 7 Licenciados Diretos Ativos sendo 2 G-Expansão</span></div>
          <div className="benefit-item"><span>D-Expansão: 10 Licenciados Diretos Ativos sendo 2 G-Expansão e 2 E-Expansão</span></div>
        </div>
      </div>
    </div>
  </section>
);

export default LicConexaoExpansao;

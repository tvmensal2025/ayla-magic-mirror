const ClubSection = () => {
  return (
    <section>
      <div className="section-container">
        <h2 className="section-heading mb-12">Acesso gratuito ao iGreen Club</h2>

        <div className="max-w-4xl mx-auto">
          <div className="space-y-4 mb-10">
            <div className="benefit-item">
              <span>Além de pagar menos na sua energia, você também tem mais um novo jeito de economizar, aproveitando vantagens exclusivas, experiências imperdíveis e preços especiais no iGreen Club</span>
            </div>
            <div className="benefit-item">
              <span>Nosso clube de benefícios oferece descontos em mais de 600.000 produtos e serviços nas 30 mil lojas parceiras em todo o Brasil, como farmácias, restaurantes, cinemas, roupas, calçados, eletrônicos, eletrodomésticos, faculdades, escolas de inglês, clínicas médicas e muito mais</span>
            </div>
          </div>

          <h3 className="section-heading text-xl md:text-2xl mb-8">
            Confira algumas lojas onde os clientes iGreen têm descontos exclusivos
          </h3>

          <div className="max-w-3xl mx-auto rounded-2xl overflow-hidden shadow-lg" style={{ boxShadow: 'var(--shadow-card)' }}>
            <video controls className="w-full aspect-video">
              <source src="/videos/igreen-club.mp4" type="video/mp4" />
              Seu navegador não suporta vídeos.
            </video>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClubSection;

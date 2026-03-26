import consultantDefault from "@/assets/consultant.jpg";

interface LicConsultantSectionProps {
  name?: string;
  whatsappUrl?: string;
  photoUrl?: string | null;
  igreenId?: string | null;
}

const DEFAULT_WHATSAPP = "https://api.whatsapp.com/send?phone=5515981077416&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20a%20oportunidade%20de%20Licenciado%20iGreen%20Energy";

const LicConsultantSection = ({
  name = "Ayla Viana",
  whatsappUrl,
  photoUrl,
  igreenId = "126928",
}: LicConsultantSectionProps) => {
  const WHATSAPP = whatsappUrl || DEFAULT_WHATSAPP;
  const photo = photoUrl || consultantDefault;
  const displayId = igreenId || "126928";

  return (
    <section>
      <div className="green-divider" />
      <div className="section-container">
        <h2 className="section-heading mb-2">Licenciada e Líder de Expansão iGreen Energy</h2>
        <p className="text-center text-primary font-heading font-bold text-lg mb-10">ID {displayId}</p>

        <div className="grid md:grid-cols-2 gap-10 items-center max-w-4xl mx-auto">
          <img src={photo} alt={`${name} - Licenciada iGreen Energy`} loading="lazy" className="rounded-xl w-full max-w-sm mx-auto shadow-lg" style={{ boxShadow: 'var(--shadow-green)' }} />
          <div>
            <div className="space-y-4 mb-8">
              <div className="benefit-item"><span>Estou muito feliz com seu interesse em conhecer melhor a iGreen Energy e será um grande prazer tê-lo(a) conosco</span></div>
              <div className="benefit-item"><span>Estou à disposição para tirar todas as suas dúvidas e fornecer o melhor suporte. Pode contar comigo!</span></div>
              <div className="benefit-item"><span>Envie uma mensagem para meu WhatsApp clicando no botão abaixo e comece hoje mesmo a faturar com todos os 8 produtos oferecidos pela iGreen Energy</span></div>
            </div>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-cta text-center w-full block">
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </div>

      <footer className="bg-secondary py-8 text-center">
        <img src="/images/logo-colorida-igreen.png" alt="iGreen Energy" loading="lazy" className="mx-auto mb-4 w-36" />
        <p className="text-muted-foreground font-heading text-sm">
          {name.toUpperCase()} | LICENCIADA E LÍDER DE EXPANSÃO IGREEN ENERGY ID {displayId}
        </p>
      </footer>
    </section>
  );
};

export default LicConsultantSection;

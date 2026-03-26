import consultantDefault from "@/assets/consultant.jpg";

interface ConsultantSectionProps {
  name?: string;
  phone?: string;
  cadastroUrl?: string;
  whatsappUrl?: string;
  photoUrl?: string | null;
  igreenId?: string | null;
}

const DEFAULT_CADASTRO_URL = "https://digital.igreenenergy.com.br/?id=126928&sendcontract=true";
const DEFAULT_WHATSAPP_URL = "https://api.whatsapp.com/send?phone=5515981077416&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20desconto%20na%20conta%20de%20luz%20oferecido%20pela%20iGreen%20Energy";

const ConsultantSection = ({
  name = "Ayla Viana",
  cadastroUrl,
  whatsappUrl,
  photoUrl,
  igreenId = "126928",
}: ConsultantSectionProps) => {
  const CADASTRO = cadastroUrl || DEFAULT_CADASTRO_URL;
  const WHATSAPP = whatsappUrl || DEFAULT_WHATSAPP_URL;
  const photo = photoUrl || consultantDefault;
  const displayId = igreenId || "126928";

  return (
    <section>
      <div className="green-divider" />
      <div className="section-container">
        <h2 className="section-heading mb-2">{name}</h2>
        <p className="text-center text-primary font-heading font-bold text-lg mb-10">
          Consultor(a) iGreen Energy — ID {displayId}
        </p>

        <div className="grid md:grid-cols-2 gap-10 items-center max-w-4xl mx-auto">
          <img
            src={photo}
            alt={`${name} - Consultor(a) iGreen Energy`}
            width={768}
            height={1152}
            loading="lazy"
            className="rounded-xl w-full max-w-sm mx-auto shadow-lg"
            style={{ boxShadow: 'var(--shadow-green)' }}
          />

          <div>
            <div className="space-y-4 mb-8">
              <div className="benefit-item">
                <span>Estou muito feliz com seu interesse em conhecer melhor a iGreen Energy e será um grande prazer tê-lo(a) conosco</span>
              </div>
              <div className="benefit-item">
                <span>Estou à disposição para tirar todas as suas dúvidas e fornecer o melhor suporte. Pode contar comigo!</span>
              </div>
              <div className="benefit-item">
                <span>Envie uma mensagem para meu WhatsApp clicando no botão abaixo e comece a economizar na sua conta de luz hoje mesmo</span>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <a href={CADASTRO} target="_blank" rel="noopener noreferrer" className="btn-cta text-center">
                Faça seu cadastro
              </a>
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-whatsapp text-center">
                Atendimento no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>

      <footer className="bg-secondary py-8 text-center">
        <img
          src="/images/logo-colorida-igreen.png"
          alt="iGreen Energy"
          width={300}
          height={92}
          loading="lazy"
          className="mx-auto mb-4 w-36"
        />
        <p className="text-muted-foreground font-heading text-sm">
          {name.toUpperCase()} | CONSULTOR(A) IGREEN ENERGY{displayId ? ` ID ${displayId}` : ""}
        </p>
      </footer>
    </section>
  );
};

export default ConsultantSection;

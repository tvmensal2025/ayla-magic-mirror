import { trackClickEvent } from "@/hooks/useTrackEvent";

interface HeroSectionProps {
  cadastroUrl?: string;
  whatsappUrl?: string;
  consultantId?: string;
}

const DEFAULT_CADASTRO_URL = "https://digital.igreenenergy.com.br/?id=126928&sendcontract=true";
const DEFAULT_WHATSAPP_URL = "https://api.whatsapp.com/send?phone=5515981077416&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20desconto%20na%20conta%20de%20luz%20oferecido%20pela%20iGreen%20Energy";

const HeroSection = ({ cadastroUrl, whatsappUrl, consultantId }: HeroSectionProps) => {
  const CADASTRO = cadastroUrl || DEFAULT_CADASTRO_URL;
  const WHATSAPP = whatsappUrl || DEFAULT_WHATSAPP_URL;

  const handleClick = (target: string) => {
    if (consultantId) trackClickEvent(consultantId, target, "client");
  };

  return (
    <section className="relative py-12 md:py-20">
      <div className="section-container text-center py-0">
        <img
          src="/images/logo-colorida-igreen.png"
          alt="iGreen Energy Logo"
          width={300}
          height={92}
          className="mx-auto mb-8 w-48 md:w-72"
        />

        <h1 className="section-heading mb-6 text-3xl md:text-4xl lg:text-5xl leading-tight">
          Descubra como receber até 20% de desconto na sua conta de luz todos os meses gratuitamente
        </h1>

        <p className="text-foreground/80 text-lg md:text-xl max-w-3xl mx-auto mb-10">
          Conheça agora a oportunidade da iGreen Energy e como você pode economizar na conta de luz da sua residência, comércio e empresa
        </p>

        <div className="max-w-4xl mx-auto mb-10 rounded-2xl overflow-hidden shadow-lg">
          <video
            controls
            className="w-full aspect-video"
            poster=""
          >
            <source src="/videos/igreen-energy.mp4" type="video/mp4" />
            Seu navegador não suporta vídeos.
          </video>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={CADASTRO} target="_blank" rel="noopener noreferrer" className="btn-cta" onClick={() => handleClick("cadastro")}>
            Faça seu cadastro
          </a>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-whatsapp" onClick={() => handleClick("whatsapp")}>
            Atendimento no WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

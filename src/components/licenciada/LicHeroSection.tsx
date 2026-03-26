import { trackClickEvent } from "@/hooks/useTrackEvent";

interface LicHeroSectionProps {
  cadastroUrl?: string;
  whatsappUrl?: string;
  consultantId?: string;
}

const DEFAULT_CADASTRO = "https://digital.igreenenergy.com.br/?id=126928&sendcontract=true";
const DEFAULT_WHATSAPP = "https://api.whatsapp.com/send?phone=5515981077416&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20a%20oportunidade%20de%20Licenciado%20iGreen%20Energy";

const LicHeroSection = ({ cadastroUrl, whatsappUrl, consultantId }: LicHeroSectionProps) => {
  const CADASTRO = cadastroUrl || DEFAULT_CADASTRO;
  const WHATSAPP = whatsappUrl || DEFAULT_WHATSAPP;

  const handleClick = (target: string) => {
    if (consultantId) trackClickEvent(consultantId, target, "licenciada");
  };

  return (
    <section className="relative py-12 md:py-20">
      <div className="section-container text-center py-0">
        <img src="/images/logo-colorida-igreen.png" alt="iGreen Energy Logo" className="mx-auto mb-8 w-48 md:w-72" />
        <h1 className="section-heading mb-6 text-3xl md:text-4xl lg:text-5xl leading-tight">
          Descubra como se tornar um licenciado iGreen Energy e receba comissões sobre contas de luz e telefonia móvel todos os meses
        </h1>
        <p className="text-foreground/80 text-lg md:text-xl max-w-3xl mx-auto mb-10">
          Conheça agora a oportunidade da iGreen Energy e como você pode receber renda recorrente sempre que pessoas e empresas pagam a conta de luz e planos de internet no celular
        </p>
        <div className="max-w-4xl mx-auto mb-10 rounded-2xl overflow-hidden shadow-lg">
          <video controls className="w-full aspect-video">
            <source src="/videos/igreen-energy.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="btn-cta" onClick={() => handleClick("whatsapp")}>
            Quero ser Licenciado
          </a>
        </div>
      </div>
    </section>
  );
};

export default LicHeroSection;

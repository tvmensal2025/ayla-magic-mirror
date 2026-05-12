import { useParams } from "react-router-dom";
import { useConsultant } from "@/hooks/useConsultant";
import { useTrackView } from "@/hooks/useTrackView";
import HeroSection from "@/components/HeroSection";

import AboutSection from "@/components/AboutSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import SolarPlantsSection from "@/components/SolarPlantsSection";
import StatesSection from "@/components/StatesSection";
import ReferralSection from "@/components/ReferralSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import NewsSection from "@/components/NewsSection";
import ClubSection from "@/components/ClubSection";
import AdvantagesSection from "@/components/AdvantagesSection";
import ConsultantSection from "@/components/ConsultantSection";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import LoadingScreen from "@/components/LoadingScreen";
import SEOHead from "@/components/SEOHead";
import PixelInjector from "@/components/PixelInjector";
import { useInstancePhone } from "@/hooks/useInstancePhone";

const ConsultantPage = () => {
  const { licenca } = useParams<{ licenca: string }>();
  const { data: consultant, isLoading } = useConsultant(licenca || "");
  useTrackView(consultant?.id, "client");

  const { data: instancePhone } = useInstancePhone(consultant?.id);

  if (isLoading) return <LoadingScreen />;

  if (!consultant) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-32 mx-auto mb-6 opacity-50" />
          <h1 className="text-3xl font-bold font-heading text-foreground mb-4">Consultor não encontrado</h1>
          <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  // Normalizar telefone do perfil com prefixo 55
  const rawPhone = consultant.phone?.replace(/\D/g, '') || "";
  const normalizedPhone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
  
  // Botão de atendimento: priorizar instância
  const contactPhone = instancePhone || normalizedPhone;
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${contactPhone}&text=${encodeURIComponent("Olá, gostaria de mais informações sobre o desconto na conta de luz oferecido pela iGreen Energy")}`;

  return (
    <>
      <PixelInjector facebookPixelId={consultant.facebook_pixel_id} googleAnalyticsId={consultant.google_analytics_id} />
      <SEOHead
        title={`${consultant.name} – iGreen Energy`}
        description={`Descubra como receber até 15% de desconto na sua conta de luz com ${consultant.name}, consultor(a) iGreen Energy`}
      />
      <div className="min-h-screen">
        <HeroSection cadastroUrl={consultant.cadastro_url} whatsappUrl={whatsappUrl} consultantId={consultant.id} />
        <AboutSection />
        <HowItWorksSection />
        <SolarPlantsSection />
        <StatesSection />
        <ReferralSection />
        <TestimonialsSection />
        <NewsSection />
        <ClubSection />
        <AdvantagesSection />
        <ConsultantSection
          name={consultant.name}
          phone={consultant.phone}
          cadastroUrl={consultant.cadastro_url}
          whatsappUrl={whatsappUrl}
          photoUrl={consultant.photo_url}
          igreenId={consultant.igreen_id}
          consultantId={consultant.id}
        />
      </div>
      <WhatsAppFloat url={whatsappUrl} />
    </>
  );
};

export default ConsultantPage;

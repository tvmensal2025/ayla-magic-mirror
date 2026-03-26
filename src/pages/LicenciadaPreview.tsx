import LicHeroSection from "@/components/licenciada/LicHeroSection";
import LicAboutSection from "@/components/licenciada/LicAboutSection";
import LicWhySection from "@/components/licenciada/LicWhySection";
import LicBenefitsSection from "@/components/licenciada/LicBenefitsSection";
import LicProductsIntro from "@/components/licenciada/LicProductsIntro";
import LicConexaoGreen from "@/components/licenciada/LicConexaoGreen";
import LicConexaoLivre from "@/components/licenciada/LicConexaoLivre";
import LicConexaoSolar from "@/components/licenciada/LicConexaoSolar";
import LicConexaoPlacas from "@/components/licenciada/LicConexaoPlacas";
import LicConexaoClub from "@/components/licenciada/LicConexaoClub";
import LicConexaoClubPJ from "@/components/licenciada/LicConexaoClubPJ";
import LicConexaoExpansao from "@/components/licenciada/LicConexaoExpansao";
import LicConexaoTelecom from "@/components/licenciada/LicConexaoTelecom";
import LicCareerPlan from "@/components/licenciada/LicCareerPlan";
import LicLicenseSection from "@/components/licenciada/LicLicenseSection";
import LicConsultantSection from "@/components/licenciada/LicConsultantSection";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import SEOHead from "@/components/SEOHead";

const DEFAULT_WHATSAPP = "https://api.whatsapp.com/send?phone=5515981077416&text=Ol%C3%A1,%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es%20sobre%20a%20oportunidade%20de%20Licenciado%20iGreen%20Energy";

const LicenciadaPreview = () => (
  <>
    <SEOHead title="Licenciada Ayla Viana – iGreen Energy" description="Descubra como se tornar um Licenciado iGreen Energy" />
    <div className="min-h-screen">
      <LicHeroSection />
      <LicAboutSection />
      <LicWhySection />
      <LicBenefitsSection />
      <LicProductsIntro />
      <LicConexaoGreen />
      <LicConexaoLivre />
      <LicConexaoSolar />
      <LicConexaoPlacas />
      <LicConexaoClub />
      <LicConexaoClubPJ />
      <LicConexaoExpansao />
      <LicConexaoTelecom />
      <LicCareerPlan />
      <LicLicenseSection />
      <LicConsultantSection />
    </div>
    <WhatsAppFloat url={DEFAULT_WHATSAPP} />
  </>
);

export default LicenciadaPreview;

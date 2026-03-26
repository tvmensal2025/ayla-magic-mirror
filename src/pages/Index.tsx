import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import SolarPlantsSection from "@/components/SolarPlantsSection";
import StatesSection from "@/components/StatesSection";
import ReferralSection from "@/components/ReferralSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import ClubSection from "@/components/ClubSection";
import AdvantagesSection from "@/components/AdvantagesSection";
import ConsultantSection from "@/components/ConsultantSection";

const Index = () => {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <AboutSection />
      <HowItWorksSection />
      <SolarPlantsSection />
      <StatesSection />
      <ReferralSection />
      <TestimonialsSection />
      <ClubSection />
      <AdvantagesSection />
      <ConsultantSection />
    </div>
  );
};

export default Index;

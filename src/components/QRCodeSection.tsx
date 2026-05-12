import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect } from "react";
import { Smartphone, Camera, FileText, CheckCircle2 } from "lucide-react";

const G_LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="white"/><text x="20" y="28" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="26" font-weight="900" fill="#00B74F">G</text></svg>'
)}`;

interface QRCodeSectionProps {
  whatsappUrl: string;
  consultantName: string;
  consultantId?: string;
}

const QRCodeSection = ({ whatsappUrl, consultantName, consultantId }: QRCodeSectionProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Usar a URL recebida diretamente (já contém o número correto da instância)
  const whatsappBotUrl = whatsappUrl;

  return (
    <section 
      className={`relative overflow-hidden transition-all duration-1000 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
      style={{ 
        background: 'linear-gradient(135deg, hsl(130, 100%, 36%) 0%, hsl(130, 80%, 28%) 100%)',
      }}
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10" 
          style={{ background: 'radial-gradient(circle, white, transparent 70%)' }} 
        />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-10" 
          style={{ background: 'radial-gradient(circle, white, transparent 70%)' }} 
        />
      </div>

      <div className="section-container py-12 md:py-16 relative z-10">
        {/* Badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="text-white text-sm font-semibold">Cadastro Rápido via WhatsApp</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white text-center mb-4 font-heading">
          📱 Cadastro em 3 Minutos
        </h2>
        <p className="text-white/90 text-center text-lg md:text-xl max-w-3xl mx-auto mb-12">
          Escaneie o QR Code e envie seus documentos pelo WhatsApp. Nosso sistema automatizado cuida de tudo!
        </p>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12 max-w-5xl mx-auto items-center">
          {/* QR Code Card */}
          <div className="order-2 md:order-1">
            <div className="bg-white rounded-3xl p-8 shadow-2xl transform hover:scale-105 transition-transform duration-300">
              <div className="flex flex-col items-center">
                <div className="mb-6 text-center">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2 font-heading">
                    Escaneie Agora
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Aponte a câmera do seu celular
                  </p>
                </div>

                {/* QR Code */}
                <div className="bg-white p-4 rounded-2xl shadow-inner mb-6">
                  <QRCodeSVG
                    value={whatsappBotUrl}
                    size={220}
                    level="H"
                    includeMargin={true}
                  imageSettings={{
                      src: G_LOGO_DATA_URI,
                      height: 40,
                      width: 40,
                      excavate: true,
                    }}
                  />
                </div>

                {/* Mobile button */}
                <a
                  href={whatsappBotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="md:hidden w-full bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg"
                >
                  <Smartphone className="w-5 h-5" />
                  Abrir WhatsApp
                </a>

                {/* Desktop info */}
                <div className="hidden md:block text-center">
                  <p className="text-gray-500 text-sm">
                    Ou acesse pelo celular:
                  </p>
                  <a
                    href={whatsappBotUrl}
                    className="text-[#25D366] hover:text-[#20BA5A] font-semibold text-sm underline"
                  >
                    Clique aqui
                  </a>
                </div>
              </div>
            </div>

            {/* Consultant info */}
            <div className="mt-6 text-center">
              <p className="text-white/80 text-sm">
                Atendimento personalizado com
              </p>
              <p className="text-white font-bold text-lg">
                {consultantName}
              </p>
              {consultantId && (
                <p className="text-white/60 text-xs">
                  ID iGreen: {consultantId}
                </p>
              )}
            </div>
          </div>

          {/* Steps */}
          <div className="order-1 md:order-2 space-y-6">
            <div className="flex gap-4 items-start group">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40 group-hover:scale-110 transition-transform">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1 font-heading">
                  1. Escaneie o QR Code
                </h4>
                <p className="text-white/80 text-sm leading-relaxed">
                  Use a câmera do seu celular para escanear o código e abrir o WhatsApp automaticamente
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start group">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40 group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1 font-heading">
                  2. Envie seus Documentos
                </h4>
                <p className="text-white/80 text-sm leading-relaxed">
                  Tire fotos do RG (frente e verso) e da conta de energia. Nosso bot vai extrair os dados automaticamente
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start group">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/40 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1 font-heading">
                  3. Pronto! Cadastro Completo
                </h4>
                <p className="text-white/80 text-sm leading-relaxed">
                  Em poucos minutos você receberá o link para finalizar e começar a economizar
                </p>
              </div>
            </div>

            {/* Benefits */}
            <div className="mt-8 pt-8 border-t border-white/20">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-black text-white mb-1">100%</div>
                  <div className="text-white/80 text-xs uppercase tracking-wider">Automático</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black text-white mb-1">3min</div>
                  <div className="text-white/80 text-xs uppercase tracking-wider">Tempo médio</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-12 flex justify-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-6 py-3 rounded-full border border-white/20">
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span className="text-white text-sm">
              🔒 Seus dados estão seguros e protegidos
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default QRCodeSection;

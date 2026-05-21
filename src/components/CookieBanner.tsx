// LGPD cookie banner — Fase 3 auditoria. Visual alinhado ao glassmorphism verde da LP.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

const KEY = "igreen_lgpd_consent_v1";

export function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setShow(true); } catch { /* ignore */ }
  }, []);
  const decide = (v: "accepted" | "rejected") => {
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
    setShow(false);
  };
  if (!show) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto max-w-3xl mx-auto rounded-2xl border border-primary/30 bg-background/85 backdrop-blur-xl shadow-2xl shadow-primary/10 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-xs sm:text-sm text-foreground/90 flex-1">
          Usamos cookies para melhorar sua experiência e medir resultados. Veja nossa{" "}
          <Link to="/politica-privacidade" className="text-primary underline underline-offset-2">Política de Privacidade</Link>.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => decide("rejected")} className="text-xs">Rejeitar</Button>
          <Button size="sm" onClick={() => decide("accepted")} className="text-xs">Aceitar</Button>
          <button onClick={() => decide("rejected")} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

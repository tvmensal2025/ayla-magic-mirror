import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CaptureLeadList } from "@/components/captacao/CaptureLeadList";
import { CaptureStepsGrid } from "@/components/captacao/CaptureStepsGrid";
import { CaptureLeadCard } from "@/components/captacao/CaptureLeadCard";
import { CaptureScoreboard } from "@/components/captacao/CaptureScoreboard";
import { useCaptureScoreboard } from "@/hooks/useCaptureScoreboard";
import { Button } from "@/components/ui/button";
import { Gamepad2, ExternalLink, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { consultantId: string; onOpenChat?: (phone: string) => void; }

export function CaptacaoPanel({ consultantId, onOpenChat }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sentSteps, setSentSteps] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState<string | null>(null);
  const { today, week, streak, bump } = useCaptureScoreboard(consultantId);
  const { toast } = useToast();

  useEffect(() => { setSentSteps(new Set()); setPhone(null); }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void (async () => {
      const { data } = await supabase.from("customers").select("phone_whatsapp").eq("id", selectedId).maybeSingle();
      setPhone((data as any)?.phone_whatsapp || null);
    })();
  }, [selectedId]);

  const handleSubmitted = async () => {
    await bump();
    toast({ title: "🏆 +1 cadastro no placar!", duration: 2000 });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[640px] rounded-xl border border-border overflow-hidden bg-background/60">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/60">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-bold">Modo Captação</h2>
            <p className="text-[11px] text-muted-foreground">Capture dados do lead enquanto conversa — estilo game</p>
          </div>
        </div>
        <CaptureScoreboard today={today} week={week} streak={streak} />
      </header>

      <div className="flex-1 flex overflow-hidden">
        <CaptureLeadList consultantId={consultantId} selectedId={selectedId} onSelect={setSelectedId} />

        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <Gamepad2 className="w-12 h-12 text-muted-foreground/40" />
              <h3 className="text-base font-semibold">Selecione um lead para começar</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Para adicionar um lead à captação, vá para o chat do WhatsApp, abra o cliente e marque "Capturar manualmente".
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border bg-card/40 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Conversando com</p>
                  <p className="text-sm font-semibold">{phone || "—"}</p>
                </div>
                {phone && onOpenChat && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOpenChat(phone)}>
                    <MessageCircle className="w-3.5 h-3.5" /> Abrir conversa
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">10 Passos · clique para enviar</h3>
                  <CaptureStepsGrid
                    consultantId={consultantId}
                    customerId={selectedId}
                    sentSteps={sentSteps}
                    onSent={(stepId) => setSentSteps((s) => new Set(s).add(stepId))}
                  />
                </div>
                <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-3 text-[11px] text-muted-foreground space-y-1">
                  <p>💡 <span className="font-semibold">Como funciona:</span> envie os passos, conforme o cliente responde os campos vão sendo preenchidos automaticamente (OCR já está ativo para conta e documento).</p>
                  <p>Você também pode editar manualmente qualquer campo na ficha à direita.</p>
                </div>
              </div>
            </>
          )}
        </main>

        {selectedId && <CaptureLeadCard customerId={selectedId} onSubmitted={handleSubmitted} />}
      </div>
    </div>
  );
}

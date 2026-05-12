import { useEffect, useState } from "react";
import { Settings2, Loader2, Save, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getConsultantAdSettings, saveConsultantAdSettings } from "@/services/facebookAds";

function digits(s: string) { return s.replace(/\D/g, ""); }

export function ConsultantAdSettingsCard({ consultantId, onReady }: { consultantId: string; onReady?: (ok: boolean) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await getConsultantAdSettings(consultantId);
        setWhatsapp(s.whatsapp_destination_number || "");
        setDisplayName(s.display_name || "");
        onReady?.(!!s.whatsapp_destination_number);
      } finally { setLoading(false); }
    })();
  }, [consultantId]);

  async function handleSave() {
    const phone = digits(whatsapp);
    if (phone.length < 10) {
      toast({ title: "Número inválido", description: "Use o formato com DDI: 5511999998888", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveConsultantAdSettings(consultantId, {
        whatsapp_destination_number: phone,
        display_name: displayName || null,
      });
      toast({ title: "Configurações salvas" });
      onReady?.(true);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
      <header className="flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-primary" />
        <div>
          <h3 className="font-bold text-foreground">Para onde os leads chegam</h3>
          <p className="text-xs text-muted-foreground">Os anúncios usam a conta da plataforma — você só configura para onde mandar os leads.</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="wa" className="text-sm">WhatsApp de destino *</Label>
            <div className="relative mt-1">
              <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="wa"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="55 11 99999-8888"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Inclua DDI (55) + DDD + número. Para onde o cliente é direcionado ao clicar no anúncio.</p>
          </div>

          <div>
            <Label htmlFor="dn" className="text-sm">Seu nome (aparece em relatórios internos)</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex: João Silva" className="mt-1" />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar configurações
          </Button>
        </div>
      )}
    </div>
  );
}
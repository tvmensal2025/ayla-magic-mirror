import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pause, Play, Loader2, MapPin, TrendingUp, Users, MessageCircle, DollarSign, Heart, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CampaignHealthCheck } from "./CampaignHealthCheck";

interface Campaign {
  id: string; name: string; status: string; cities: any[];
  daily_budget_cents: number; fb_campaign_id: string | null;
  created_at: string; rejection_reason: string | null;
}
interface Metric { campaign_id: string; impressions: number; clicks: number; spend_cents: number; leads: number; messaging_conversations_started: number; cost_per_lead_cents: number }

function healthOf(m: { spend_cents: number; leads: number; messaging_conversations_started: number; cost_per_lead_cents: number }): { level: "green" | "yellow" | "red" | "idle"; label: string } {
  const spend = m.spend_cents / 100;
  if (spend < 5) return { level: "idle", label: "Aquecendo" };
  const actions = m.leads + m.messaging_conversations_started;
  if (actions === 0 && spend >= 30) return { level: "red", label: "Sem leads — revisar" };
  if (actions === 0) return { level: "yellow", label: "Sem leads ainda" };
  const cpl = m.cost_per_lead_cents / 100;
  if (cpl > 0 && cpl <= 10) return { level: "green", label: `CPL R$${cpl.toFixed(2)}` };
  if (cpl > 0 && cpl <= 25) return { level: "yellow", label: `CPL R$${cpl.toFixed(2)}` };
  return { level: "red", label: `CPL R$${cpl.toFixed(2)} alto` };
}

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  paused: "bg-yellow-500/20 text-yellow-400",
  draft: "bg-blue-500/20 text-blue-400",
  pending_review: "bg-purple-500/20 text-purple-400",
  rejected: "bg-red-500/20 text-red-400",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Ativa", paused: "Pausada", draft: "Rascunho", pending_review: "Em revisão", rejected: "Rejeitada",
};

// Mapeia mensagem crua do Meta pra explicação + sugestão amigável.
function explainRejection(raw: string | null | undefined): { title: string; suggestion: string } | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes("2446885") || r.includes("conta pessoal") || r.includes("whatsapp business")) {
    return { title: "Página sem WhatsApp Business", suggestion: "Vá no Meta Business Suite → Configurações → WhatsApp e vincule um número Business à Página. Depois reabra 'Selecionar assets' e republique." };
  }
  if (r.includes("token") && (r.includes("expired") || r.includes("expirou") || r.includes("invalid"))) {
    return { title: "Token do Facebook expirou", suggestion: "Reconecte sua conta Facebook no card de conexão e republique a campanha." };
  }
  if (r.includes("ad_account") || r.includes("disabled") || r.includes("desativada")) {
    return { title: "Conta de anúncios desativada", suggestion: "Acesse business.facebook.com → Conta de Anúncios e resolva o aviso (geralmente cartão recusado ou política violada)." };
  }
  if (r.includes("payment") || r.includes("pagamento") || r.includes("funding")) {
    return { title: "Problema com forma de pagamento", suggestion: "Adicione/atualize o cartão no Meta Business Manager → Configurações → Pagamentos." };
  }
  if (r.includes("policy") || r.includes("política") || r.includes("rejected")) {
    return { title: "Anúncio rejeitado por política", suggestion: "Ajuste foto/texto — evite promessas exageradas, % específicos, depoimentos atribuídos. Republique." };
  }
  if (r.includes("rate") || r.includes("limit") || r.includes("17") || r.includes("4")) {
    return { title: "Limite de chamadas da Meta", suggestion: "Aguarde 5-10 min e clique em 'Tentar reativar'. Erro temporário." };
  }
  return { title: "Erro ao publicar no Meta", suggestion: raw };
}

export function CampaignsList({ consultantId, refreshKey }: { consultantId: string; refreshKey: number }) {
  const [items, setItems] = useState<Campaign[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metric>>({});
  const [waNumber, setWaNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: camps } = await supabase
        .from("facebook_campaigns")
        .select("id,name,status,cities,daily_budget_cents,fb_campaign_id,created_at,rejection_reason")
        .eq("consultant_id", consultantId)
        .order("created_at", { ascending: false });
      const list = (camps || []) as Campaign[];
      setItems(list);

      if (list.length > 0) {
        const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
        const { data: ms } = await supabase
          .from("facebook_metrics_daily")
          .select("campaign_id,impressions,clicks,spend_cents,leads,messaging_conversations_started,cost_per_lead_cents")
          .in("campaign_id", list.map(c => c.id))
          .gte("date", since);
        const agg: Record<string, Metric> = {};
        (ms || []).forEach((m: any) => {
          const cur = agg[m.campaign_id] || { campaign_id: m.campaign_id, impressions: 0, clicks: 0, spend_cents: 0, leads: 0, messaging_conversations_started: 0, cost_per_lead_cents: 0 };
          cur.impressions += m.impressions || 0;
          cur.clicks += m.clicks || 0;
          cur.spend_cents += m.spend_cents || 0;
          cur.leads += m.leads || 0;
          cur.messaging_conversations_started += m.messaging_conversations_started || 0;
          agg[m.campaign_id] = cur;
        });
        Object.values(agg).forEach(m => { m.cost_per_lead_cents = m.leads > 0 ? Math.round(m.spend_cents / m.leads) : 0; });
        setMetrics(agg);
      }
      setLoading(false);
    })();
  }, [consultantId, refreshKey]);

  async function tryReactivate(c: Campaign) {
    if (!c.fb_campaign_id) return;
    setReactivating(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-campaign-healthcheck", {
        body: { campaign_id: c.id },
      });
      if (error) throw error;
      if ((data as any)?.activated) {
        toast({ title: "Campanha reativada!", description: "Voltou a rodar." });
        setItems((prev) => prev.map((x) => x.id === c.id ? { ...x, status: "active", rejection_reason: null } : x));
      } else {
        toast({ title: "Ainda não foi possível reativar", description: (data as any)?.reason || "Veja o motivo no card.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Falha ao tentar reativar", description: e?.message || "Erro desconhecido", variant: "destructive" });
    } finally { setReactivating(null); }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (items.length === 0) return <div className="text-center py-10 text-muted-foreground text-sm">Nenhuma campanha ainda. Clique em "Nova campanha" pra começar.</div>;

  return (
    <div className="grid gap-3">
      {items.map(c => {
        const m = metrics[c.id] || { impressions: 0, clicks: 0, spend_cents: 0, leads: 0, messaging_conversations_started: 0, cost_per_lead_cents: 0 };
        return (
          <Card key={c.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-foreground truncate">{c.name}</h4>
                  <Badge className={STATUS_COLOR[c.status] || "bg-secondary"}>{STATUS_LABEL[c.status] || c.status}</Badge>
                  {(() => {
                    const h = healthOf(m);
                    const cls = h.level === "green" ? "bg-emerald-500/20 text-emerald-400" : h.level === "yellow" ? "bg-amber-500/20 text-amber-400" : h.level === "red" ? "bg-destructive/20 text-destructive" : "bg-secondary text-muted-foreground";
                    const Icon = h.level === "red" ? AlertTriangle : Heart;
                    return <Badge className={`${cls} gap-1`}><Icon className="w-3 h-3" />{h.label}</Badge>;
                  })()}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {(c.cities || []).slice(0, 3).map((x: any) => x.name).join(", ")}{(c.cities || []).length > 3 ? `... +${c.cities.length - 3}` : ""}
                  · R$ {(c.daily_budget_cents / 100).toFixed(0)}/dia
                </div>
                {c.rejection_reason && (() => {
                  const exp = explainRejection(c.rejection_reason);
                  return (
                    <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs space-y-1.5">
                      <div className="font-bold text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{exp?.title || "Erro"}</div>
                      <div className="text-muted-foreground">{exp?.suggestion}</div>
                      {(c.status === "pending_review" || c.status === "paused") && (
                        <Button size="sm" variant="outline" onClick={() => tryReactivate(c)} disabled={reactivating === c.id} className="h-7 text-xs gap-1">
                          {reactivating === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Tentar reativar
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <Stat icon={<TrendingUp className="w-3.5 h-3.5" />} label="Impressões" value={m.impressions.toLocaleString("pt-BR")} />
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Cliques" value={m.clicks.toLocaleString("pt-BR")} />
              <Stat icon={<MessageCircle className="w-3.5 h-3.5" />} label="Conversas" value={String(m.messaging_conversations_started)} />
              <Stat icon={<Users className="w-3.5 h-3.5" />} label="Leads" value={String(m.leads)} />
              <Stat icon={<DollarSign className="w-3.5 h-3.5" />} label={m.leads > 0 ? "CPL" : "Gasto"} value={m.leads > 0 ? `R$ ${(m.cost_per_lead_cents / 100).toFixed(2)}` : `R$ ${(m.spend_cents / 100).toFixed(2)}`} highlight />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 ${highlight ? "bg-primary/10 border border-primary/20" : "bg-secondary/40"}`}>
      <div className="flex items-center gap-1 text-muted-foreground">{icon}{label}</div>
      <div className={`font-bold mt-0.5 ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

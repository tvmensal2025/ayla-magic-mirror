import { useEffect, useState } from "react";
import { Megaphone, Sparkles, Users, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LeadSourceCardProps {
  consultantId: string;
  periodDays: number;
}

const SOURCE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  meta_ads: { label: "Anúncios Meta (FB/IG)", icon: "📣", color: "hsl(200, 100%, 50%)" },
  google_ads: { label: "Google Ads", icon: "🔎", color: "hsl(30, 100%, 50%)" },
  indicacao: { label: "Indicação", icon: "🤝", color: "hsl(280, 80%, 60%)" },
  organic: { label: "Orgânico", icon: "🌱", color: "hsl(130, 100%, 36%)" },
  manual: { label: "Cadastro manual", icon: "✍️", color: "hsl(0, 0%, 55%)" },
  unknown: { label: "Não classificado", icon: "❓", color: "hsl(0, 0%, 45%)" },
};

export function LeadSourceCard({ consultantId, periodDays }: LeadSourceCardProps) {
  const [data, setData] = useState<{ source: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      const since = new Date(Date.now() - periodDays * 24 * 3600 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("customers")
        .select("lead_source")
        .eq("consultant_id", consultantId)
        .eq("customer_origin", "whatsapp_lead")
        .gte("created_at", since)
        .limit(5000);
      if (cancelled) return;
      const counts: Record<string, number> = {};
      (rows || []).forEach((r: any) => {
        const k = r.lead_source || "unknown";
        counts[k] = (counts[k] || 0) + 1;
      });
      const arr = Object.entries(counts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
      setData(arr);
      setLoading(false);
    };
    fetchData();
    return () => { cancelled = true; };
  }, [consultantId, periodDays]);

  const total = data.reduce((s, x) => s + x.count, 0);
  const adsLeads = data.find((d) => d.source === "meta_ads")?.count ?? 0;
  const adsPct = total > 0 ? Math.round((adsLeads / total) * 100) : 0;

  return (
    <div className="premium-card">
      <div className="flex items-start justify-between mb-1 gap-2 flex-wrap">
        <div>
          <h3 className="font-heading font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" /> Origem dos Leads (WhatsApp)
          </h3>
          <p className="text-xs text-muted-foreground">Últimos {periodDays} dias — atribuição automática por palavra-chave da 1ª mensagem</p>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              {adsLeads} via anúncio ({adsPct}%)
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Carregando…</p>
      ) : total === 0 ? (
        <div className="text-center py-6">
          <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sem leads novos no período</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Quando você subir anúncios Click-to-WhatsApp, os leads aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          {data.map((row) => {
            const meta = SOURCE_LABELS[row.source] || { label: row.source, icon: "•", color: "hsl(0,0%,50%)" };
            const pct = Math.round((row.count / total) * 100);
            return (
              <div key={row.source}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-foreground flex items-center gap-1.5">
                    <span>{meta.icon}</span> {meta.label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.count} ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: meta.color }}
                  />
                </div>
              </div>
            );
          })}
          {adsLeads > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50 flex items-start gap-2 text-xs text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
              <span>
                Dica: a tag <strong className="text-foreground">Anúncios Meta</strong> é detectada quando o
                lead manda no WhatsApp termos como <em>"vim do anúncio"</em>, <em>"Facebook"</em>,
                <em>"Instagram"</em>, <em>"reels"</em> ou <em>"patrocinado"</em>. Configure a mensagem
                pré-preenchida do seu anúncio Click-to-WhatsApp começando com "Oi! Vim do anúncio…".
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

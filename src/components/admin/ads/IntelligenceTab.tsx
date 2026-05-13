import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Activity, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CompetitorsPanel } from "./CompetitorsPanel";
import { InsightsPanel } from "./InsightsPanel";
import { CreativeImageGenerator, type CreativeImageGeneratorHandle } from "./CreativeImageGenerator";

interface Props {
  consultantId: string;
  onUseCreativeInAd?: (imageUrl: string) => void;
}

interface Event { ts: string; label: string; emoji: string }

export function IntelligenceTab({ consultantId, onUseCreativeInAd }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const generatorRef = useRef<CreativeImageGeneratorHandle>(null);

  useEffect(() => {
    (async () => {
      const [comp, ins, gen] = await Promise.all([
        supabase.from("ad_competitor_creatives").select("ingested_at, advertiser").order("ingested_at", { ascending: false }).limit(20),
        supabase.from("ad_creative_insights").select("updated_at, sample_size").eq("consultant_id", consultantId).order("updated_at", { ascending: false }).limit(5),
        supabase.from("ad_generated_creatives").select("created_at, format").eq("consultant_id", consultantId).order("created_at", { ascending: false }).limit(10),
      ]);

      const ev: Event[] = [];

      // Agrupar scrapes por timestamp aproximado (mesmo minuto)
      const scrapeBuckets = new Map<string, number>();
      (comp.data || []).forEach((c: any) => {
        const key = c.ingested_at?.slice(0, 16) || "";
        scrapeBuckets.set(key, (scrapeBuckets.get(key) || 0) + 1);
      });
      Array.from(scrapeBuckets.entries()).slice(0, 5).forEach(([ts, n]) => {
        ev.push({ ts: ts + ":00Z", emoji: "🕵️", label: `Scraper de concorrentes — ${n} anúncios coletados` });
      });

      (ins.data || []).forEach((i: any) => {
        ev.push({ ts: i.updated_at, emoji: "🧠", label: `Análise da IA executada — ${i.sample_size} anúncios avaliados` });
      });

      (gen.data || []).forEach((g: any) => {
        ev.push({ ts: g.created_at, emoji: "✨", label: `Criativo gerado — ${g.format.replace("_", " ")}` });
      });

      ev.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
      setEvents(ev.slice(0, 15));
    })();
  }, [consultantId]);

  return (
    <div className="space-y-4">
      {/* Botão estrela: gerador de criativo */}
      <CreativeImageGenerator consultantId={consultantId} />

      <div className="grid lg:grid-cols-2 gap-4">
        <InsightsPanel consultantId={consultantId} />
        <Card className="p-5 bg-card/50 backdrop-blur border-border/60">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-primary" />
            Timeline de atualizações
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Cron: scraper toda 2ª às 06:00 UTC · Learner diário 07:00 UTC · Rotator diário 08:00 UTC
          </p>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem eventos ainda.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {events.map((e, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-secondary/30 border border-border/30">
                  <span className="text-base leading-tight">{e.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">{e.label}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="w-2.5 h-2.5" />
                      {formatDistanceToNow(new Date(e.ts), { locale: ptBR, addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <CompetitorsPanel />
    </div>
  );
}

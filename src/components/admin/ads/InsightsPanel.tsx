import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Brain, RefreshCw, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Insight {
  winning_patterns: any;
  losing_patterns: any;
  best_image_traits: any;
  best_image_briefs: any;
  summary: string | null;
  sample_size: number;
  best_ctr_bps: number;
  best_cpa_cents: number | null;
  updated_at: string;
}

interface Props { consultantId: string }

function patternsToList(p: any): string[] {
  if (!Array.isArray(p)) return [];
  return p.map(x => typeof x === "string" ? x : (x?.pattern || x?.text || JSON.stringify(x))).filter(Boolean).slice(0, 6);
}

export function InsightsPanel({ consultantId }: Props) {
  const { toast } = useToast();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("ad_creative_insights")
      .select("winning_patterns, losing_patterns, best_image_traits, best_image_briefs, summary, sample_size, best_ctr_bps, best_cpa_cents, updated_at")
      .eq("consultant_id", consultantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInsight(data as Insight | null);
    setLoading(false);
  }

  useEffect(() => { load(); }, [consultantId]);

  async function run() {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("ad-creative-learner", { body: {} });
      if (error) throw error;
      toast({ title: "Análise concluída", description: "Insights atualizados." });
      await load();
    } catch (e) {
      toast({ title: "Erro", description: String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const winners = patternsToList(insight?.winning_patterns);
  const losers = patternsToList(insight?.losing_patterns);
  const traits = patternsToList(insight?.best_image_traits);

  return (
    <Card className="p-5 bg-card/50 backdrop-blur border-border/60">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Insights da IA (sua performance)
          </h3>
          {insight && (
            <p className="text-xs text-muted-foreground mt-1">
              {insight.sample_size} anúncios analisados · atualizado {formatDistanceToNow(new Date(insight.updated_at), { locale: ptBR, addSuffix: true })}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={running} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Analisando..." : "Atualizar agora"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
      ) : !insight ? (
        <div className="text-center py-6 space-y-2">
          <Lightbulb className="w-8 h-8 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground">Sem insights ainda.</p>
          <p className="text-xs text-muted-foreground">Suba 3+ anúncios e a IA começa a identificar seus padrões vencedores automaticamente todo dia às 07:00.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {insight.summary && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-sm text-foreground font-medium">💡 {insight.summary}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <h4 className="text-xs font-semibold text-primary flex items-center gap-1 mb-2">
                <TrendingUp className="w-3.5 h-3.5" /> O que funciona
              </h4>
              {winners.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sem dados suficientes</p>
              ) : (
                <ul className="space-y-1">
                  {winners.map((w, i) => <li key={i} className="text-xs text-foreground flex gap-1.5"><span className="text-primary">▸</span>{w}</li>)}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-destructive flex items-center gap-1 mb-2">
                <TrendingDown className="w-3.5 h-3.5" /> O que evitar
              </h4>
              {losers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Sem dados suficientes</p>
              ) : (
                <ul className="space-y-1">
                  {losers.map((w, i) => <li key={i} className="text-xs text-foreground flex gap-1.5"><span className="text-destructive">▸</span>{w}</li>)}
                </ul>
              )}
            </div>
          </div>

          {traits.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2">🎨 Traços de imagem vencedores</h4>
              <div className="flex flex-wrap gap-1.5">
                {traits.map((t, i) => <Badge key={i} variant="secondary" className="text-[11px]">{t}</Badge>)}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Melhor CTR</p>
              <p className="text-base font-bold text-foreground tabular-nums">{(insight.best_ctr_bps / 100).toFixed(2)}%</p>
            </div>
            {insight.best_cpa_cents != null && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Melhor CPA</p>
                <p className="text-base font-bold text-foreground tabular-nums">R$ {(insight.best_cpa_cents / 100).toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

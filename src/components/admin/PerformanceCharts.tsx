import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { TrendingUp, TrendingDown, Calendar, Target, Layers } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface Props {
  analytics: any;
}

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return {
    grid: isDark ? "hsl(120, 8%, 18%)" : "hsl(220, 10%, 88%)",
    text: isDark ? "hsl(120, 5%, 65%)" : "hsl(220, 10%, 45%)",
    tooltipBg: isDark ? "hsl(120, 8%, 8%)" : "hsl(0, 0%, 100%)",
    tooltipBorder: isDark ? "hsl(120, 8%, 18%)" : "hsl(220, 15%, 90%)",
    tooltipText: isDark ? "hsl(0, 0%, 95%)" : "hsl(220, 15%, 15%)",
  };
}

export function PerformanceCharts({ analytics }: Props) {
  const colors = useChartColors();
  const TT = { background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: "12px", fontSize: "13px", color: colors.tooltipText };

  if (!analytics) return null;

  const { funnel, weekday, weekComparison, topCampaigns } = analytics;

  const ChangeChip = ({ value }: { value: number }) => {
    const up = value >= 0;
    const Icon = up ? TrendingUp : TrendingDown;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-primary" : "text-destructive"}`}>
        <Icon className="w-3 h-3" />
        {Math.abs(value).toFixed(0)}%
      </span>
    );
  };

  const funnelColors = ["hsl(130, 100%, 36%)", "hsl(160, 80%, 45%)", "hsl(200, 100%, 50%)", "hsl(30, 100%, 50%)"];

  return (
    <div className="space-y-6">
      {/* WEEK COMPARISON */}
      <div className="premium-card">
        <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" /> Esta Semana vs Semana Anterior
        </h3>
        <p className="text-xs text-muted-foreground mb-4">Últimos 7 dias comparados aos 7 dias anteriores</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Visitas", data: weekComparison?.views },
            { label: "Cliques", data: weekComparison?.clicks },
            { label: "Novos Leads", data: weekComparison?.leads },
          ].map(({ label, data }) => (
            <div key={label} className="bg-secondary/40 dark:bg-secondary/60 rounded-xl p-4 border border-border/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                {data && <ChangeChip value={data.change} />}
              </div>
              <p className="text-3xl font-bold font-heading text-foreground">{data?.current ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Anterior: {data?.previous ?? 0}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FUNNEL */}
      {funnel && (
        <div className="premium-card">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> Funil de Conversão
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Do visitante ao cliente aprovado</p>
          <div className="space-y-3">
            {funnel.map((step: any, i: number) => {
              const widthPct = funnel[0].count > 0 ? (step.count / funnel[0].count) * 100 : 0;
              const conversionFromPrev = i > 0 && funnel[i - 1].count > 0
                ? (step.count / funnel[i - 1].count) * 100
                : null;
              return (
                <div key={step.stage}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-foreground">{step.stage}</span>
                    <div className="flex items-center gap-2">
                      {conversionFromPrev !== null && (
                        <span className="text-[11px] text-muted-foreground">
                          ↓ {conversionFromPrev.toFixed(1)}% da etapa anterior
                        </span>
                      )}
                      <span className="text-sm font-bold text-foreground">{step.count}</span>
                    </div>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-7 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                      style={{ width: `${Math.max(widthPct, 5)}%`, background: funnelColors[i] }}
                    >
                      <span className="text-[11px] font-semibold text-white drop-shadow">{step.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEKDAY */}
      {weekday && (
        <div className="premium-card">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Performance por Dia da Semana
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Descubra os dias mais quentes para concentrar anúncios</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekday} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis dataKey="day" tick={{ fill: colors.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: colors.text, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="views" name="Visitas" fill="hsl(130, 100%, 36%)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="clicks" name="Cliques" fill="hsl(30, 100%, 50%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TOP CAMPAIGNS */}
      {topCampaigns && topCampaigns.length > 0 && (
        <div className="premium-card">
          <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Top Origens de Tráfego
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Quais canais trazem mais visitas e convertem</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  <th className="py-2 pr-4">Origem</th>
                  <th className="py-2 pr-4 text-right">Visitas</th>
                  <th className="py-2 pr-4 text-right">Cliques</th>
                  <th className="py-2 text-right">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {topCampaigns.map((c: any) => (
                  <tr key={c.source} className="border-b border-border/30 last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-foreground capitalize">{c.source}</td>
                    <td className="py-2.5 pr-4 text-right text-foreground">{c.views}</td>
                    <td className="py-2.5 pr-4 text-right text-foreground">{c.clicks}</td>
                    <td className="py-2.5 text-right">
                      <span className={`font-semibold ${c.conversionRate > 5 ? "text-primary" : "text-muted-foreground"}`}>
                        {c.conversionRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

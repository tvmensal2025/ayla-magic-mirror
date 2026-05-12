import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Clock, Send, TrendingUp, Calendar, Users } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays, differenceInMinutes, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WhatsAppDashboardProps {
  consultantId: string;
}

function KpiCard({ icon, label, value, subtitle, accentClass = "text-primary" }: {
  icon: React.ReactNode; label: string; value: string | number; subtitle?: string; accentClass?: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 ${accentClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold font-heading text-foreground leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export function WhatsAppDashboard({ consultantId }: WhatsAppDashboardProps) {
  // Fetch all conversations for this consultant's customers
  const { data: conversations, isLoading: loadingConvos } = useQuery({
    queryKey: ["waDashConvos", consultantId],
    queryFn: async () => {
      const { data: customerIds } = await supabase
        .from("customers")
        .select("id")
        .eq("consultant_id", consultantId);
      if (!customerIds?.length) return [];
      const ids = customerIds.map((c) => c.id);
      const all: any[] = [];
      // Fetch in batches of 50 customer IDs
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { data } = await supabase
          .from("conversations")
          .select("customer_id, message_direction, created_at")
          .in("customer_id", batch)
          .gte("created_at", subDays(new Date(), 30).toISOString())
          .order("created_at", { ascending: true });
        if (data) all.push(...data);
      }
      return all;
    },
  });

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ["waDashCustomerNames", consultantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone_whatsapp")
        .eq("consultant_id", consultantId);
      return data || [];
    },
  });

  const { data: deals } = useQuery({
    queryKey: ["waDashDeals", consultantId],
    queryFn: async () => {
      const { data } = await supabase.from("crm_deals").select("stage").eq("consultant_id", consultantId);
      return data || [];
    },
  });

  const { data: kanbanStages } = useQuery({
    queryKey: ["waDashStages", consultantId],
    queryFn: async () => {
      const { data } = await supabase.from("kanban_stages").select("stage_key, label, color").eq("consultant_id", consultantId).order("position");
      return data || [];
    },
  });

  const { data: scheduledMsgs } = useQuery({
    queryKey: ["waDashScheduled", consultantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("scheduled_messages")
        .select("id, status, scheduled_at, remote_jid, message_text")
        .eq("consultant_id", consultantId)
        .eq("status", "pending")
        .order("scheduled_at", { ascending: true })
        .limit(5);
      return data || [];
    },
  });

  // KPIs
  const kpis = useMemo(() => {
    if (!conversations) return null;
    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);

    const recent = conversations.filter((c) => new Date(c.created_at) >= sevenDaysAgo);
    const activeChats = new Set(recent.map((c) => c.customer_id)).size;
    const sentMessages = conversations.filter((c) => c.message_direction === "outbound").length;
    const inbound = conversations.filter((c) => c.message_direction === "inbound");
    const outbound = conversations.filter((c) => c.message_direction === "outbound");

    // Response rate: % of unique customers who sent inbound that also got outbound
    const inboundCustomers = new Set(inbound.map((c) => c.customer_id));
    const outboundCustomers = new Set(outbound.map((c) => c.customer_id));
    const respondedCustomers = [...inboundCustomers].filter((id) => outboundCustomers.has(id));
    const responseRate = inboundCustomers.size > 0 ? Math.round((respondedCustomers.length / inboundCustomers.size) * 100) : 0;

    // Average response time
    const byCustomer = new Map<string, any[]>();
    for (const c of conversations) {
      if (!byCustomer.has(c.customer_id)) byCustomer.set(c.customer_id, []);
      byCustomer.get(c.customer_id)!.push(c);
    }
    const responseTimes: number[] = [];
    for (const msgs of byCustomer.values()) {
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].message_direction === "inbound" && msgs[i + 1].message_direction === "outbound") {
          const diff = differenceInMinutes(parseISO(msgs[i + 1].created_at), parseISO(msgs[i].created_at));
          if (diff >= 0 && diff < 1440) responseTimes.push(diff);
        }
      }
    }
    const avgResponse = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;
    const avgResponseLabel = avgResponse >= 60 ? `${Math.floor(avgResponse / 60)}h ${avgResponse % 60}m` : `${avgResponse}m`;

    return { activeChats, sentMessages, responseRate, avgResponseLabel };
  }, [conversations]);

  // Daily messages chart (last 14 days)
  const dailyChart = useMemo(() => {
    if (!conversations) return [];
    const days: { date: string; enviadas: number; recebidas: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const dayStr = format(day, "yyyy-MM-dd");
      const label = format(day, "dd/MM", { locale: ptBR });
      const dayConvos = conversations.filter((c) => c.created_at.startsWith(dayStr));
      days.push({
        date: label,
        enviadas: dayConvos.filter((c) => c.message_direction === "outbound").length,
        recebidas: dayConvos.filter((c) => c.message_direction === "inbound").length,
      });
    }
    return days;
  }, [conversations]);

  // CRM Funnel
  const funnel = useMemo(() => {
    if (!deals || !kanbanStages?.length) return [];
    const stageMap = new Map<string, number>();
    for (const d of deals) stageMap.set(d.stage, (stageMap.get(d.stage) || 0) + 1);
    const total = deals.length || 1;
    return kanbanStages.map((s, i) => {
      const count = stageMap.get(s.stage_key) || 0;
      const pct = Math.round((count / total) * 100);
      return { label: s.label, count, pct, color: s.color };
    });
  }, [deals, kanbanStages]);

  // Top contacts
  const topContacts = useMemo(() => {
    if (!conversations || !customers) return [];
    const countMap = new Map<string, number>();
    for (const c of conversations) countMap.set(c.customer_id, (countMap.get(c.customer_id) || 0) + 1);
    const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    return sorted.map(([id, count]) => {
      const cust = customerMap.get(id);
      return { name: cust?.name || cust?.phone_whatsapp || "Desconhecido", count };
    });
  }, [conversations, customers]);

  const isLoading = loadingConvos || loadingCustomers;

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 overflow-auto h-full">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={<MessageSquare className="w-5 h-5" />} label="Conversas Ativas" value={kpis?.activeChats ?? 0} subtitle="Últimos 7 dias" />
        <KpiCard icon={<Clock className="w-5 h-5" />} label="Tempo Médio Resposta" value={kpis?.avgResponseLabel ?? "—"} subtitle="Entre recebida → enviada" />
        <KpiCard icon={<Send className="w-5 h-5" />} label="Mensagens Enviadas" value={kpis?.sentMessages ?? 0} subtitle="Últimos 30 dias" />
        <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Taxa de Resposta" value={`${kpis?.responseRate ?? 0}%`} subtitle="Clientes respondidos" />
      </div>

      {/* Row 2: Funnel + Area Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CRM Funnel */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-5">
          <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4 text-primary" /> Funil do CRM
          </h3>
          {funnel.length > 0 ? (
            <div className="space-y-2">
              {funnel.map((stage, i) => {
                const widthPct = Math.max(stage.pct, 8);
                const hue = 130 - (i * (80 / Math.max(funnel.length - 1, 1)));
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground truncate">{stage.label}</span>
                        <span className="text-foreground font-medium">{stage.count} ({stage.pct}%)</span>
                      </div>
                      <div className="w-full bg-muted/30 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${widthPct}%`,
                            background: `hsl(${hue}, 70%, 45%)`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum deal no CRM</p>
          )}
        </div>

        {/* Messages per Day */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-5">
          <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
            <Send className="w-4 h-4 text-primary" /> Mensagens por Dia (14 dias)
          </h3>
          {dailyChart.some((d) => d.enviadas > 0 || d.recebidas > 0) ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEnv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(130, 70%, 45%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(130, 70%, 45%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Area type="monotone" dataKey="enviadas" name="Enviadas" stroke="hsl(130, 70%, 45%)" fill="url(#colorEnv)" strokeWidth={2} />
                  <Area type="monotone" dataKey="recebidas" name="Recebidas" stroke="hsl(200, 80%, 55%)" fill="url(#colorRec)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem mensagens no período</p>
          )}
        </div>
      </div>

      {/* Row 3: Scheduled + Top Contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scheduled Messages */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-5">
          <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-primary" /> Próximos Agendamentos
          </h3>
          {scheduledMsgs && scheduledMsgs.length > 0 ? (
            <div className="space-y-3">
              {scheduledMsgs.map((msg) => {
                const phone = msg.remote_jid?.replace("@s.whatsapp.net", "") || "";
                const customer = customers?.find((c) => c.phone_whatsapp === phone || c.phone_whatsapp?.replace(/\D/g, "") === phone);
                return (
                  <div key={msg.id} className="flex items-start gap-3 p-2 rounded-xl bg-muted/20">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {customer?.name || phone || "Destinatário"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{msg.message_text}</p>
                      <p className="text-[10px] text-primary mt-0.5">
                        {format(parseISO(msg.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum agendamento pendente</p>
          )}
        </div>

        {/* Top Contacts */}
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-5">
          <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" /> Top Contatos (30 dias)
          </h3>
          {topContacts.length > 0 ? (
            <div className="space-y-2">
              {topContacts.map((contact, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-muted/20">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{contact.name}</p>
                  </div>
                  <span className="text-xs font-bold text-primary">{contact.count} msgs</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem interações recentes</p>
          )}
        </div>
      </div>
    </div>
  );
}

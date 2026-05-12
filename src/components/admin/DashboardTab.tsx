import { useMemo, useState, useEffect, useRef } from "react";
import { Eye, Users, MousePointerClick, Zap, TrendingUp, RefreshCw, Loader2, Filter, KeyRound, FileDown, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAnalytics } from "@/hooks/useAnalytics";
import { StatCard } from "./StatCard";
import { CustomerCharts } from "./CustomerCharts";
import { AnalyticsCharts } from "./AnalyticsCharts";
import { Eye as EyeIcon, EyeOff } from "lucide-react";

interface DashboardTabProps {
  userId: string;
  form: { igreen_portal_email: string; igreen_portal_password: string };
  onFormUpdate: (updates: Record<string, string>) => void;
  periodDays: number;
  onPeriodChange: (days: number) => void;
}

export function DashboardTab({ userId, form, onFormUpdate, periodDays, onPeriodChange }: DashboardTabProps) {
  const { data: analytics } = useAnalytics(userId, periodDays);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncingDashboard, setSyncingDashboard] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(0);
  const [selectedLicenciado, setSelectedLicenciado] = useState("all");
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [credForm, setCredForm] = useState({ email: "", password: "" });
  const [showCredPassword, setShowCredPassword] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [sharedAccountCount, setSharedAccountCount] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("sync_cooldown_until");
    if (stored) { const remaining = Math.ceil((parseInt(stored) - Date.now()) / 1000); if (remaining > 0) setSyncCooldown(remaining); }
  }, []);

  // Detecta se outro consultor usa a mesma credencial do portal iGreen.
  // RLS dos `consultants` só deixa SELECT no próprio registro, então
  // perguntamos ao Postgres via head/count com o mesmo email — nenhum
  // dado sensível trafega.
  useEffect(() => {
    const email = form.igreen_portal_email?.trim().toLowerCase();
    if (!email) { setSharedAccountCount(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from("consultants")
          .select("id", { count: "exact", head: true })
          .eq("igreen_portal_email", email);
        if (cancelled) return;
        // count inclui o próprio consultor — só sinalizamos se houver outros.
        setSharedAccountCount(Math.max(0, (count ?? 1) - 1));
      } catch { /* RLS pode bloquear; ignora silenciosamente */ }
    })();
    return () => { cancelled = true; };
  }, [form.igreen_portal_email]);

  useEffect(() => {
    if (syncCooldown <= 0) return;
    const timer = setInterval(() => { setSyncCooldown((prev) => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; }); }, 1000);
    return () => clearInterval(timer);
  }, [syncCooldown]);

  const startCooldown = () => { setSyncCooldown(60); localStorage.setItem("sync_cooldown_until", String(Date.now() + 60000)); };

  const licenciadoOptions = useMemo(() => {
    if (!analytics?.allCustomers) return [];
    const names = new Set<string>();
    for (const c of analytics.allCustomers) { if (c.registered_by_name) names.add(c.registered_by_name); }
    return Array.from(names).sort();
  }, [analytics?.allCustomers]);

  const filteredMetrics = useMemo(() => {
    if (!analytics) return null;
    const filtered = selectedLicenciado === "all" ? analytics.allCustomers : analytics.allCustomers.filter((c: any) => c.registered_by_name === selectedLicenciado);
    const totalCustomers = filtered.length;
    const totalKw = filtered.reduce((sum: number, c: any) => sum + (Number(c.media_consumo) || 0), 0);
    const withConsumption = filtered.filter((c: any) => Number(c.media_consumo) > 0);
    const avgKw = withConsumption.length > 0 ? totalKw / withConsumption.length : 0;

    const statusMap = new Map<string, number>();
    for (const c of filtered) { const s = (c as any).status || "pending"; statusMap.set(s, (statusMap.get(s) || 0) + 1); }
    const statusLabels: Record<string, string> = { approved: "Aprovados", pending: "Pendentes", rejected: "Reprovados", lead: "Leads", devolutiva: "Devolutiva", awaiting_signature: "Falta Assinatura", data_complete: "Dados Completos", registered_igreen: "Cadastrado iGreen", contract_sent: "Contrato Enviado" };
    const chartOnlyStatuses = ["approved", "devolutiva", "rejected"];
    for (const s of chartOnlyStatuses) { if (!statusMap.has(s)) statusMap.set(s, 0); }
    const customersByStatus = Array.from(statusMap.entries()).filter(([status]) => chartOnlyStatuses.includes(status)).map(([status, count]) => ({ status, count, label: statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1) })).sort((a, b) => b.count - a.count);

    const daysAgoDate = new Date(); daysAgoDate.setDate(daysAgoDate.getDate() - periodDays);
    const weeks = Math.ceil(periodDays / 7);
    const weekMap = new Map<string, number>();
    for (let i = weeks - 1; i >= 0; i--) {
      const start = new Date(); start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date(); end.setDate(end.getDate() - i * 7);
      weekMap.set(`${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} - ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`, 0);
    }
    for (const c of filtered) {
      const created = new Date((c as any).created_at);
      if (created >= daysAgoDate) {
        const daysAgo = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = Math.min(weeks - 1, Math.floor(daysAgo / 7));
        const keys = Array.from(weekMap.keys());
        const key = keys[keys.length - 1 - weekIdx];
        if (key) weekMap.set(key, (weekMap.get(key) || 0) + 1);
      }
    }
    const weeklyNewCustomers = Array.from(weekMap.entries()).map(([week, count]) => ({ week, count }));
    return { totalCustomers, totalKw, avgKw, customersByStatus, weeklyNewCustomers };
  }, [analytics, selectedLicenciado, periodDays]);

  const runSync = async (email: string, password: string) => {
    setSyncingDashboard(true); startCooldown();
    try {
      const { data, error } = await supabase.functions.invoke("sync-igreen-customers", { body: { portal_email: email, portal_password: password, consultant_id: userId } });
      if (error) throw error;
      if (data?.success) { toast({ title: "✅ Sincronização concluída!", description: `${data.processed} clientes processados, ${data.updated} atualizados.` }); queryClient.invalidateQueries({ queryKey: ["analytics"] }); }
      else toast({ title: "Erro na sincronização", description: data?.error || "Erro desconhecido", variant: "destructive" });
    } catch (err: unknown) { toast({ title: "Erro na sincronização", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" }); }
    finally { setSyncingDashboard(false); }
  };

  const handleDashboardSync = () => {
    if (form.igreen_portal_email && form.igreen_portal_password) runSync(form.igreen_portal_email, form.igreen_portal_password);
    else { setCredForm({ email: "", password: "" }); setShowCredentialsDialog(true); }
  };

  const handleSaveCredentialsAndSync = async () => {
    if (!credForm.email || !credForm.password) return;
    try {
      const { error } = await supabase.from("consultants").update({ igreen_portal_email: credForm.email, igreen_portal_password: credForm.password }).eq("id", userId);
      if (error) throw error;
      onFormUpdate({ igreen_portal_email: credForm.email, igreen_portal_password: credForm.password });
      setShowCredentialsDialog(false);
      toast({ title: "✅ Credenciais salvas!" });
      runSync(credForm.email, credForm.password);
    } catch (err: unknown) { toast({ title: "Erro ao salvar credenciais", description: err instanceof Error ? err.message : "Erro", variant: "destructive" }); }
  };

  const chartData = analytics?.daily.map((d) => ({ ...d, label: new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) })) || [];

  const handleExportPdf = async () => {
    if (!dashboardRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(dashboardRef.current, { scale: 1.5, useCORS: true, backgroundColor: "#0a0a0a" });
      const imgData = canvas.toDataURL("image/jpeg", 0.85);
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = pdfHeight; let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();
      while (heightLeft > 0) { position -= pdf.internal.pageSize.getHeight(); pdf.addPage(); pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight); heightLeft -= pdf.internal.pageSize.getHeight(); }
      pdf.save(`relatorio-${new Date().toISOString().split("T")[0]}.pdf`);
      toast({ title: "✅ PDF exportado!" });
    } catch { toast({ title: "Erro ao exportar PDF", variant: "destructive" }); }
    finally { setExporting(false); }
  };

  return (
    <div ref={dashboardRef} className="space-y-6">
      {sharedAccountCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-amber-200/90">
            <strong className="text-amber-300">Conta iGreen compartilhada</strong> com {sharedAccountCount} outro{sharedAccountCount > 1 ? "s" : ""} consultor{sharedAccountCount > 1 ? "es" : ""}.
            Cada consultor vê apenas seus próprios clientes no painel — a sincronização não afeta os dados dos outros.
          </div>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting} className="h-8 text-xs gap-1.5">
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          {exporting ? "Gerando..." : "Exportar PDF"}
        </Button>
        <Select value={String(periodDays)} onValueChange={(v) => onPeriodChange(Number(v))}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="15">Últimos 15 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={<Eye className="w-5 h-5" />} label="Total de Visualizações" value={analytics?.total ?? 0} color="primary" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Página Cliente" value={analytics?.totalClient ?? 0} color="accent" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Página Licenciado" value={analytics?.totalLicenciada ?? 0} color="primary" />
        <StatCard icon={<MousePointerClick className="w-5 h-5" />} label="Cliques nos Botões" value={analytics?.totalClicks ?? 0} color="accent" />
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-heading font-bold text-foreground text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Clientes iGreen</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedLicenciado} onValueChange={setSelectedLicenciado}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue placeholder="Filtrar licenciado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Licenciados</SelectItem>
              {licenciadoOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleDashboardSync} disabled={syncingDashboard || syncCooldown > 0} className="h-8 text-xs gap-1.5">
            {syncingDashboard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncingDashboard ? "Sincronizando..." : syncCooldown > 0 ? `Aguarde ${syncCooldown}s` : "Sincronizar iGreen"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="Total de Clientes" value={filteredMetrics?.totalCustomers ?? 0} color="primary" />
        <StatCard icon={<Zap className="w-5 h-5" />} label="Total kW (Consumo)" value={`${(filteredMetrics?.totalKw ?? 0).toLocaleString("pt-BR")} kW`} color="accent" subtitle={`Média: ${(filteredMetrics?.avgKw ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kW`} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Taxa de Conversão" value={`${(analytics?.conversionRate ?? 0).toFixed(1)}%`} color="primary" subtitle="Cliques / Visualizações" />
      </div>

      <CustomerCharts filteredMetrics={filteredMetrics} topLicenciados={analytics?.topLicenciados} />
      <AnalyticsCharts chartData={chartData} periodDays={periodDays} analytics={analytics} weeklyNewCustomers={filteredMetrics?.weeklyNewCustomers} />

      {/* Credentials Dialog */}
      <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" />Conectar ao Portal iGreen</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Informe suas credenciais do portal iGreen para sincronizar seus clientes automaticamente.</p>
          <div className="space-y-4 mt-2">
            <div><Label htmlFor="cred-email">Email do Portal</Label><Input id="cred-email" type="email" placeholder="seu@email.com" value={credForm.email} onChange={(e) => setCredForm(prev => ({ ...prev, email: e.target.value }))} /></div>
            <div>
              <Label htmlFor="cred-password">Senha do Portal</Label>
              <div className="relative">
                <Input id="cred-password" type={showCredPassword ? "text" : "password"} placeholder="••••••••" value={credForm.password} onChange={(e) => setCredForm(prev => ({ ...prev, password: e.target.value }))} />
                <button type="button" onClick={() => setShowCredPassword(!showCredPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCredPassword ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveCredentialsAndSync} disabled={!credForm.email || !credForm.password}><RefreshCw className="w-4 h-4 mr-2" />Conectar e Sincronizar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

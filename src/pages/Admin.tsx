import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { Consultant } from "@/types/consultant";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Eye, Users, Copy, ExternalLink, LogOut, Save, Camera, BarChart3, LinkIcon, Settings, Monitor, MousePointerClick, Clock, Smartphone, Globe, QrCode, Download, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "dados" | "links" | "preview">("dashboard");
  const [qrModal, setQrModal] = useState<{ url: string; label: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", license: "", phone: "", cadastro_url: "", igreen_id: "", licenciada_cadastro_url: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: analytics } = useAnalytics(userId);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) navigate("/auth");
      else { setUserId(session.user.id); loadConsultant(session.user.id); }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else { setUserId(session.user.id); loadConsultant(session.user.id); }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadConsultant = async (uid: string) => {
    const { data } = await supabase.from("consultants").select("*").eq("id", uid).maybeSingle();
    if (data) {
      const c = data as Consultant;
      setForm({ name: c.name, license: c.license, phone: c.phone, cadastro_url: c.cadastro_url, igreen_id: c.igreen_id || "", licenciada_cadastro_url: (c as any).licenciada_cadastro_url || "" });
      if (c.photo_url) setPhotoPreview(c.photo_url);
    }
    setLoading(false);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    try {
      let photo_url: string | undefined;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop();
        const path = `${userId}/photo.${ext}`;
        const { error: uploadError } = await supabase.storage.from("consultant-photos").upload(path, photoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("consultant-photos").getPublicUrl(path);
        photo_url = urlData.publicUrl;
      }
      const payload: any = {
        id: userId, name: form.name, license: form.license.toLowerCase().replace(/\s+/g, "-"),
        phone: form.phone.replace(/\D/g, ""), cadastro_url: form.cadastro_url, igreen_id: form.igreen_id || null,
        licenciada_cadastro_url: form.licenciada_cadastro_url || null,
      };
      if (photo_url) payload.photo_url = photo_url;
      const { error } = await supabase.from("consultants").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      toast({ title: "✅ Dados salvos com sucesso!" });
    } catch (error: any) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/auth"); };

  const baseUrl = "igreen.institutodossonhos.com.br";
  const slug = form.license || "sua-licenca";

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "✅ Link copiado!" });
  };

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
    { id: "dados" as const, label: "Dados", icon: Settings },
    { id: "links" as const, label: "Links", icon: LinkIcon },
    { id: "preview" as const, label: "Preview", icon: Monitor },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-32 animate-pulse" />
        <p className="text-muted-foreground">Carregando painel...</p>
      </div>
    );
  }

  const chartData = analytics?.daily.map((d) => ({
    ...d,
    label: new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  })) || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-20 sm:w-24" />
            <div className="hidden sm:block">
              <h1 className="text-base font-bold font-heading text-foreground leading-tight">Painel do Consultor</h1>
              <p className="text-xs text-muted-foreground">{form.name || "Bem-vindo"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      {/* Tab Navigation - Scrollable on mobile */}
      <nav className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                icon={<Eye className="w-5 h-5" />}
                label="Total de Visualizações"
                value={analytics?.total ?? 0}
                color="primary"
              />
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Página Cliente"
                value={analytics?.totalClient ?? 0}
                color="accent"
              />
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="Página Licenciado"
                value={analytics?.totalLicenciada ?? 0}
                color="primary"
              />
              <StatCard
                icon={<MousePointerClick className="w-5 h-5" />}
                label="Cliques nos Botões"
                value={analytics?.totalClicks ?? 0}
                color="accent"
              />
            </div>

            {/* Clicks by target */}
            {analytics?.clicksByTarget && Object.keys(analytics.clicksByTarget).length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
                <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4 text-primary" /> Cliques por Botão
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Quais botões seus visitantes mais clicam</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(analytics.clicksByTarget).map(([target, count]) => (
                    <div key={target} className="bg-secondary rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold font-heading text-foreground">{count}</p>
                      <p className="text-xs text-muted-foreground capitalize">{target}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Area Chart */}
            <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
              <h3 className="font-heading font-bold text-foreground mb-1">Visualizações — Últimos 30 dias</h3>
              <p className="text-xs text-muted-foreground mb-4">Acompanhe o tráfego das suas landing pages</p>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorClient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(130, 100%, 36%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(130, 100%, 36%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorLic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(30, 100%, 50%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(120, 8%, 8%)",
                        border: "1px solid hsl(120, 8%, 18%)",
                        borderRadius: "12px",
                        fontSize: "13px",
                        color: "hsl(0, 0%, 95%)",
                      }}
                      labelStyle={{ color: "hsl(0, 0%, 95%)", fontWeight: 600 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="client"
                      name="Cliente"
                      stroke="hsl(130, 100%, 36%)"
                      strokeWidth={2}
                      fill="url(#colorClient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="licenciada"
                      name="Licenciado"
                      stroke="hsl(30, 100%, 50%)"
                      strokeWidth={2}
                      fill="url(#colorLic)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: "hsl(130, 100%, 36%)" }} />
                  <span className="text-xs text-muted-foreground">Cliente</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: "hsl(30, 100%, 50%)" }} />
                  <span className="text-xs text-muted-foreground">Licenciado</span>
                </div>
              </div>
            </div>

            {/* Hourly + Device + UTM row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Hourly Distribution */}
              <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
                <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Horários de Pico
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Visitas por hora do dia</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.hourly || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(h) => `${h}h`}
                      />
                      <YAxis
                        tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(120, 8%, 8%)",
                          border: "1px solid hsl(120, 8%, 18%)",
                          borderRadius: "12px",
                          fontSize: "13px",
                          color: "hsl(0, 0%, 95%)",
                        }}
                        labelFormatter={(h) => `${h}:00`}
                      />
                      <Bar dataKey="views" name="Visitas" fill="hsl(130, 100%, 36%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Device Distribution */}
              <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
                <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" /> Dispositivos
                </h3>
                <p className="text-xs text-muted-foreground mb-4">De onde seus visitantes acessam</p>
                <div className="space-y-3">
                  {(analytics?.devices || []).map((d) => {
                    const total = analytics?.total || 1;
                    const pct = Math.round((d.count / total) * 100);
                    const labels: Record<string, string> = { mobile: "📱 Mobile", tablet: "📱 Tablet", desktop: "💻 Desktop", desconhecido: "❓ Outro" };
                    return (
                      <div key={d.device}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-foreground">{labels[d.device] || d.device}</span>
                          <span className="text-muted-foreground">{d.count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {(!analytics?.devices || analytics.devices.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">Sem dados ainda</p>
                  )}
                </div>
              </div>

              {/* UTM Sources - Pie Chart */}
              <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
                <h3 className="font-heading font-bold text-foreground mb-1 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" /> Origem do Tráfego
                </h3>
                <p className="text-xs text-muted-foreground mb-4">De onde vêm seus visitantes</p>
                {analytics?.utmSources && analytics.utmSources.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics.utmSources.map((u) => ({ name: u.source, value: u.count }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {analytics.utmSources.map((_, i) => (
                            <Cell key={i} fill={["hsl(130,100%,36%)", "hsl(30,100%,50%)", "hsl(200,100%,50%)", "hsl(280,80%,60%)", "hsl(0,80%,55%)"][i % 5]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "hsl(120, 8%, 8%)",
                            border: "1px solid hsl(120, 8%, 18%)",
                            borderRadius: "12px",
                            fontSize: "13px",
                            color: "hsl(0, 0%, 95%)",
                          }}
                          formatter={(value: number, name: string) => {
                            const total = analytics?.total || 1;
                            return [`${value} (${Math.round((value / total) * 100)}%)`, name];
                          }}
                        />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          formatter={(value: string) => <span className="text-xs text-muted-foreground capitalize">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados ainda</p>
                )}
              </div>
            </div>

            {/* Bar Chart */}
            <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
              <h3 className="font-heading font-bold text-foreground mb-1">Comparativo diário</h3>
              <p className="text-xs text-muted-foreground mb-4">Visitas por tipo de página</p>
              <div className="h-52 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.slice(-14)} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(120, 8%, 18%)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: "hsl(120, 5%, 65%)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(120, 8%, 8%)",
                        border: "1px solid hsl(120, 8%, 18%)",
                        borderRadius: "12px",
                        fontSize: "13px",
                        color: "hsl(0, 0%, 95%)",
                      }}
                    />
                    <Bar dataKey="client" name="Cliente" fill="hsl(130, 100%, 36%)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="licenciada" name="Licenciado" fill="hsl(30, 100%, 50%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Dados Tab */}
        {activeTab === "dados" && (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Photo Section */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" /> Sua Foto
              </h3>
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="relative group">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Foto" className="w-28 h-28 rounded-2xl object-cover border-2 border-border group-hover:border-primary transition-colors" />
                  ) : (
                    <div className="w-28 h-28 rounded-2xl bg-secondary flex items-center justify-center border-2 border-dashed border-border">
                      <Camera className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 w-full">
                  <Input type="file" accept="image/*" onChange={handlePhotoChange} className="bg-secondary border-border" />
                  <p className="text-xs text-muted-foreground mt-2">JPG ou PNG, recomendado 400×400px</p>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="bg-card rounded-2xl border border-border p-6">
              <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" /> Informações
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm text-muted-foreground">Nome completo</Label>
                  <Input id="name" value={form.name} onChange={(e) => {
                    const newName = e.target.value;
                    const slug = newName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
                    setForm({ ...form, name: newName, license: slug });
                  }} placeholder="Seu nome" className="bg-secondary border-border" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license" className="text-sm text-muted-foreground">Licença (slug)</Label>
                  <Input id="license" value={form.license} readOnly className="bg-secondary/50 border-border text-muted-foreground cursor-not-allowed" />
                  <p className="text-xs text-muted-foreground">Gerado automaticamente a partir do nome</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm text-muted-foreground">WhatsApp (com DDD)</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" className="bg-secondary border-border" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="igreen_id" className="text-sm text-muted-foreground">ID iGreen</Label>
                  <Input id="igreen_id" value={form.igreen_id} onChange={(e) => setForm({ ...form, igreen_id: e.target.value })} placeholder="ex: 126928" className="bg-secondary border-border" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="cadastro_url" className="text-sm text-muted-foreground">Link de cadastro iGreen (Conta de Energia)</Label>
                <Input id="cadastro_url" value={form.cadastro_url} onChange={(e) => setForm({ ...form, cadastro_url: e.target.value })} placeholder="https://digital.igreenenergy.com.br/?id=..." className="bg-secondary border-border" required />
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="licenciada_cadastro_url" className="text-sm text-muted-foreground">Link de cadastro Licença</Label>
                <Input id="licenciada_cadastro_url" value={form.licenciada_cadastro_url} onChange={(e) => setForm({ ...form, licenciada_cadastro_url: e.target.value })} placeholder="https://..." className="bg-secondary border-border" />
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full h-12 text-base font-bold rounded-xl gap-2" style={{ background: "var(--gradient-green)" }}>
              <Save className="w-5 h-5" />
              {saving ? "Salvando..." : "Salvar dados"}
            </Button>
          </form>
        )}

        {/* Links Tab */}
        {activeTab === "links" && (
          <div className="space-y-6">
            {/* Main Links */}
            <div className="space-y-4">
              <h2 className="font-heading font-bold text-foreground text-lg flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" /> Links Principais
              </h2>
              <LinkCard
                emoji="🏠"
                title="Landing Page — Cliente"
                description="Para captar clientes que querem desconto na conta de luz"
                url={`https://${baseUrl}/${slug}`}
                onCopy={copyLink}
                previewUrl={`/${slug}`}
              />
              <LinkCard
                emoji="💼"
                title="Landing Page — Licenciado"
                description="Para recrutar novos licenciados para sua equipe"
                url={`https://${baseUrl}/licenciada/${slug}`}
                onCopy={copyLink}
                previewUrl={`/licenciada/${slug}`}
              />
            </div>

            {/* Tracking Links */}
            {[
              { pageLabel: "Cliente", pagePath: slug, emoji: "🏠" },
              { pageLabel: "Licenciado", pagePath: `licenciada/${slug}`, emoji: "💼" },
            ].map((page) => (
              <div key={page.pagePath} className="space-y-3">
                <h2 className="font-heading font-bold text-foreground text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" /> Links de Rastreamento — {page.emoji} {page.pageLabel}
                </h2>
                <p className="text-xs text-muted-foreground -mt-1">Compartilhe o link certo em cada rede social para saber de onde vem seu tráfego</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { source: "whatsapp", label: "WhatsApp", icon: "💬", color: "bg-[hsl(142,70%,45%)]" },
                    { source: "instagram", label: "Instagram", icon: "📸", color: "bg-[hsl(330,80%,55%)]" },
                    { source: "facebook", label: "Facebook", icon: "📘", color: "bg-[hsl(220,80%,55%)]" },
                    { source: "youtube", label: "YouTube", icon: "🎬", color: "bg-[hsl(0,80%,50%)]" },
                    { source: "tiktok", label: "TikTok", icon: "🎵", color: "bg-[hsl(270,80%,55%)]" },
                    { source: "google", label: "Google", icon: "🔍", color: "bg-[hsl(45,90%,50%)]" },
                  ].map((s) => {
                    const fullUrl = `https://${baseUrl}/${page.pagePath}?utm_source=${s.source}`;
                    return (
                      <div key={s.source} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${s.color} bg-opacity-20`}>
                          {s.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground">{s.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{fullUrl.replace("https://", "")}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => copyLink(fullUrl)} className="gap-1 shrink-0 rounded-lg text-xs">
                          <Copy className="w-3 h-3" /> Copiar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === "preview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a href={`/${slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:opacity-90 transition-opacity">
                <ExternalLink className="w-4 h-4" /> Página de Cliente
              </a>
              <a href={`/licenciada/${slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 border-2 border-primary text-primary font-bold py-3 rounded-xl hover:bg-primary/10 transition-colors">
                <ExternalLink className="w-4 h-4" /> Página de Licenciado
              </a>
            </div>
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="bg-secondary px-4 py-2.5 flex items-center gap-2 border-b border-border">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-accent/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-primary/60" />
                </div>
                <span className="text-xs text-muted-foreground ml-2 truncate">{baseUrl}/{slug}</span>
              </div>
              <iframe
                src={`/${slug}`}
                className="w-full border-0 pointer-events-none"
                style={{ height: "70vh", minHeight: "400px", pointerEvents: "none" }}
                title="Preview da landing page"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

/* ── Sub-components ── */

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: "primary" | "accent" }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
        color === "primary" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"
      }`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold font-heading text-foreground">{value.toLocaleString("pt-BR")}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function LinkCard({ emoji, title, description, url, onCopy, previewUrl }: {
  emoji: string; title: string; description: string; url: string; onCopy: (url: string) => void; previewUrl: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-heading font-bold text-foreground flex items-center gap-2">
            <span>{emoji}</span> {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors shrink-0">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-secondary px-3 py-2.5 rounded-xl text-primary text-sm break-all font-mono">
          {url.replace("https://", "")}
        </code>
        <Button size="sm" variant="outline" onClick={() => onCopy(url)} className="gap-1.5 shrink-0 rounded-xl">
          <Copy className="w-3.5 h-3.5" /> Copiar
        </Button>
      </div>
    </div>
  );
}

export default Admin;

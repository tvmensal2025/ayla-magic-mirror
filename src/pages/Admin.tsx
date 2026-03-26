import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Consultant } from "@/types/consultant";

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"dados" | "links" | "preview">("dados");
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", license: "", phone: "", cadastro_url: "", igreen_id: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

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
      setForm({ name: c.name, license: c.license, phone: c.phone, cadastro_url: c.cadastro_url, igreen_id: c.igreen_id || "" });
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

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-32 animate-pulse" />
        <p className="text-muted-foreground">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/images/logo-colorida-igreen.png" alt="iGreen" className="w-28" />
            <div>
              <h1 className="text-2xl font-bold font-heading text-foreground">Painel do Consultor</h1>
              <p className="text-muted-foreground text-sm">Gerencie suas landing pages</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} size="sm">Sair</Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-card rounded-lg p-1 border border-border">
          {(["dados", "links", "preview"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-heading font-bold uppercase transition-all ${
                activeTab === tab
                  ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={activeTab === tab ? { background: "var(--gradient-green)" } : {}}
            >
              {tab === "dados" ? "📝 Meus Dados" : tab === "links" ? "🔗 Meus Links" : "👁 Preview"}
            </button>
          ))}
        </div>

        {/* Tab: Dados */}
        {activeTab === "dados" && (
          <form onSubmit={handleSave} className="space-y-5 bg-card p-6 rounded-xl border border-border">
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Seu nome" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license">Licença (slug da URL)</Label>
                <Input id="license" value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} placeholder="ex: ayla-viana" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">WhatsApp (com DDD)</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="igreen_id">ID iGreen</Label>
                <Input id="igreen_id" value={form.igreen_id} onChange={(e) => setForm({ ...form, igreen_id: e.target.value })} placeholder="ex: 126928" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cadastro_url">Link de cadastro iGreen</Label>
              <Input id="cadastro_url" value={form.cadastro_url} onChange={(e) => setForm({ ...form, cadastro_url: e.target.value })} placeholder="https://digital.igreenenergy.com.br/?id=..." required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo">Sua foto</Label>
              <div className="flex items-center gap-4">
                {photoPreview && <img src={photoPreview} alt="Preview" className="w-24 h-24 rounded-xl object-cover border border-border" />}
                <Input id="photo" type="file" accept="image/*" onChange={handlePhotoChange} className="flex-1" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Salvando..." : "💾 Salvar dados"}
            </Button>
          </form>
        )}

        {/* Tab: Links */}
        {activeTab === "links" && (
          <div className="space-y-4">
            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-heading font-bold text-lg text-foreground mb-1">🏠 Landing Page — Cliente</h3>
              <p className="text-muted-foreground text-sm mb-3">Para captar clientes que querem desconto na conta de luz</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-secondary px-4 py-2.5 rounded-lg text-primary text-sm break-all">
                  {baseUrl}/{slug}
                </code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`https://${baseUrl}/${slug}`); toast({ title: "Link copiado!" }); }}>
                  Copiar
                </Button>
              </div>
            </div>
            <div className="bg-card p-6 rounded-xl border border-border">
              <h3 className="font-heading font-bold text-lg text-foreground mb-1">💼 Landing Page — Licenciado</h3>
              <p className="text-muted-foreground text-sm mb-3">Para recrutar novos licenciados para sua equipe</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-secondary px-4 py-2.5 rounded-lg text-primary text-sm break-all">
                  {baseUrl}/licenciada/{slug}
                </code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`https://${baseUrl}/licenciada/${slug}`); toast({ title: "Link copiado!" }); }}>
                  Copiar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Preview */}
        {activeTab === "preview" && (
          <div className="space-y-4">
            <div className="bg-card p-4 rounded-xl border border-border">
              <p className="text-muted-foreground text-sm mb-3">Visualize como suas páginas ficam para os visitantes:</p>
              <div className="grid md:grid-cols-2 gap-3">
                <a href={`/${slug}`} target="_blank" rel="noopener noreferrer" className="btn-cta text-center text-sm py-3">
                  👁 Ver página de Cliente
                </a>
                <a href={`/licenciada/${slug}`} target="_blank" rel="noopener noreferrer" className="btn-whatsapp text-center text-sm py-3">
                  👁 Ver página de Licenciado
                </a>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="bg-secondary px-4 py-2 flex items-center gap-2 border-b border-border">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500/60" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <span className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <span className="text-xs text-muted-foreground ml-2">{baseUrl}/{slug}</span>
              </div>
              <iframe
                src={`/${slug}`}
                className="w-full border-0"
                style={{ height: "600px" }}
                title="Preview da landing page"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;

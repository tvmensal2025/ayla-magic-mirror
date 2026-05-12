import { useState } from "react";
import { Camera, Settings, Globe, KeyRound, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DadosTabProps {
  form: {
    name: string;
    license: string;
    phone: string;
    igreen_id: string;
    cadastro_url: string;
    licenciada_cadastro_url: string;
    facebook_pixel_id: string;
    google_analytics_id: string;
    igreen_portal_email: string;
    igreen_portal_password: string;
  };
  photoPreview: string | null;
  saving: boolean;
  onFormChange: (updates: Record<string, string>) => void;
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: (e: React.FormEvent) => void;
  userId: string;
}

export function DadosTab({ form, photoPreview, saving, onFormChange, onPhotoChange, onSave, userId }: DadosTabProps) {
  const [showPortalPassword, setShowPortalPassword] = useState(false);

  return (
    <form onSubmit={onSave} className="space-y-6">
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
            <Input type="file" accept="image/*" onChange={onPhotoChange} className="bg-secondary border-border" />
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
              onFormChange({ name: newName, license: slug });
            }} placeholder="Seu nome" className="bg-secondary border-border" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="license" className="text-sm text-muted-foreground">Licença (slug)</Label>
            <Input id="license" value={form.license} readOnly className="bg-secondary/50 border-border text-muted-foreground cursor-not-allowed" />
            <p className="text-xs text-muted-foreground">Gerado automaticamente a partir do nome</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm text-muted-foreground">WhatsApp (com DDD)</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-muted text-muted-foreground text-sm">+55</span>
              <Input
                id="phone"
                value={form.phone.replace(/^55/, "")}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
                  onFormChange({ phone: raw ? `55${raw}` : "" });
                }}
                placeholder="11989000650"
                className="bg-secondary border-border rounded-l-none"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="igreen_id" className="text-sm text-muted-foreground">ID iGreen</Label>
            <Input id="igreen_id" value={form.igreen_id} onChange={(e) => {
              const id = e.target.value;
              onFormChange({
                igreen_id: id,
                cadastro_url: id ? `https://digital.igreenenergy.com.br/?id=${id}&sendcontract=true` : "",
                licenciada_cadastro_url: id ? `https://expansao.igreenenergy.com.br/?id=${id}&checkout=true` : "",
              });
            }} placeholder="ex: 126928" className="bg-secondary border-border" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="cadastro_url" className="text-sm text-muted-foreground">Link de cadastro iGreen (Conta de Energia)</Label>
          <Input id="cadastro_url" value={form.cadastro_url} readOnly className="bg-secondary/50 border-border text-muted-foreground cursor-not-allowed" />
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="licenciada_cadastro_url" className="text-sm text-muted-foreground">Link de cadastro Licença</Label>
          <Input id="licenciada_cadastro_url" value={form.licenciada_cadastro_url} readOnly className="bg-secondary/50 border-border text-muted-foreground cursor-not-allowed" />
        </div>
      </div>

      {/* Pixel Tracking */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" /> Pixels de Rastreamento
        </h3>
        <p className="text-xs text-muted-foreground mb-4">Cole seus IDs para rastrear conversões nas suas páginas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="facebook_pixel_id" className="text-sm text-muted-foreground">Facebook Pixel ID</Label>
            <Input id="facebook_pixel_id" value={form.facebook_pixel_id} onChange={(e) => onFormChange({ facebook_pixel_id: e.target.value })} placeholder="Ex: 123456789012345" className="bg-secondary border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_analytics_id" className="text-sm text-muted-foreground">Google Analytics ID (GA4)</Label>
            <Input id="google_analytics_id" value={form.google_analytics_id} onChange={(e) => onFormChange({ google_analytics_id: e.target.value })} placeholder="Ex: G-XXXXXXXXXX" className="bg-secondary border-border" />
          </div>

          {/* Portal iGreen Credentials */}
          <div className="bg-card rounded-2xl border border-border p-6 col-span-full">
            <h3 className="font-heading font-bold text-foreground mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Credenciais Portal iGreen
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Email e senha do escritório virtual iGreen para sincronização automática de clientes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="igreen_portal_email" className="text-sm text-muted-foreground">Email do Portal</Label>
                <Input id="igreen_portal_email" type="email" value={form.igreen_portal_email} onChange={(e) => onFormChange({ igreen_portal_email: e.target.value })} placeholder="seu@email.com" className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="igreen_portal_password" className="text-sm text-muted-foreground">Senha do Portal</Label>
                <div className="relative">
                  <Input id="igreen_portal_password" type={showPortalPassword ? "text" : "password"} value={form.igreen_portal_password} onChange={(e) => onFormChange({ igreen_portal_password: e.target.value })} placeholder="••••••••" className="bg-secondary border-border pr-10" />
                  <button type="button" onClick={() => setShowPortalPassword(!showPortalPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPortalPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving} className="w-full h-12 text-base font-bold rounded-xl gap-2" style={{ background: "var(--gradient-green)" }}>
        <Save className="w-5 h-5" />
        {saving ? "Salvando..." : "Salvar dados"}
      </Button>
    </form>
  );
}

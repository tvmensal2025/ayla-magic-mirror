import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ImageIcon, Settings2, Pause, Play, Trash2 } from "lucide-react";
import { AdTemplate, listAdTemplates, deleteAdTemplate } from "@/services/adTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { UseTemplateDialog } from "./UseTemplateDialog";
import { SmartPublishButton } from "./SmartPublishButton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props { consultantId: string; onPublished?: () => void }

export function AdTemplatesGallery({ consultantId, onPublished }: Props) {
  const [items, setItems] = useState<AdTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<AdTemplate | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdTemplate | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const { isSuperAdmin } = useUserRole(authUserId);
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null));
  }, []);

  function reload() {
    setLoading(true);
    listAdTemplates({ onlyPublished: !isSuperAdmin })
      .then((r) => setItems(r))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isSuperAdmin]);

  async function handleToggle(t: AdTemplate) {
    const next = t.status === "published" ? "archived" : "published";
    setToggling(t.id);
    try {
      const { error } = await supabase
        .from("ad_templates")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) throw error;
      setItems((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x));
      toast({ title: next === "published" ? "Modelo ativado" : "Modelo pausado" });
    } catch (e: any) {
      toast({ title: "Falha", description: e?.message || "Erro", variant: "destructive" });
    } finally { setToggling(null); }
  }

  async function handleDelete(t: AdTemplate) {
    setDeleting(t.id);
    try {
      await deleteAdTemplate(t.id);
      setItems((prev) => prev.filter((x) => x.id !== t.id));
      toast({ title: "Modelo apagado" });
    } catch (e: any) {
      toast({ title: "Falha ao apagar", description: e?.message || "Erro", variant: "destructive" });
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (items.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
        Nenhum modelo de anúncio disponível ainda. Volte em breve.
      </Card>
    );
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((t) => (
          <Card key={t.id} className={`overflow-hidden flex flex-col ${t.status !== "published" ? "opacity-70" : ""}`}>
            <div className="aspect-square bg-muted grid grid-cols-3 grid-rows-1 gap-0.5 relative">
              {t.photos.slice(0, 3).map((p, i) => (
                <img key={i} src={p.url} alt="" className="w-full h-full object-cover" />
              ))}
              {Array.from({ length: Math.max(0, 3 - t.photos.length) }).map((_, i) => (
                <div key={i} className="bg-muted/50" />
              ))}
              {t.status !== "published" && (
                <div className="absolute top-1 left-1 bg-amber-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {t.status === "archived" ? "PAUSADO" : "RASCUNHO"}
                </div>
              )}
              {isSuperAdmin && (
                <div className="absolute top-1 right-1 flex gap-1">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 bg-background/90 backdrop-blur"
                    onClick={() => handleToggle(t)}
                    disabled={toggling === t.id}
                    title={t.status === "published" ? "Pausar modelo" : "Ativar modelo"}
                  >
                    {toggling === t.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : t.status === "published" ? <Pause className="w-3.5 h-3.5 text-amber-500" /> : <Play className="w-3.5 h-3.5 text-emerald-500" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 bg-background/90 backdrop-blur text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(t)}
                    disabled={deleting === t.id}
                    title="Apagar modelo (SuperAdmin)"
                  >
                    {deleting === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              )}
            </div>
            <div className="p-3 space-y-2 flex-1 flex flex-col">
              <h4 className="font-bold leading-tight">{t.title}</h4>
              <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{t.headline}</p>
              <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                <span>R$ {(t.suggested_daily_budget_cents / 100).toFixed(0)}/dia</span>
                {t.usage_count > 0 && <span>{t.usage_count} consultor(es) usando</span>}
              </div>
              <SmartPublishButton
                template={t}
                consultantId={consultantId}
                onPublished={onPublished}
                onFallback={(tpl) => setPicked(tpl)}
              />
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setPicked(t)}>
                <Settings2 className="w-3.5 h-3.5" /> Personalizar
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <UseTemplateDialog
        open={!!picked}
        onClose={() => setPicked(null)}
        template={picked}
        consultantId={consultantId}
        onPublished={onPublished}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar modelo de anúncio?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.title}
              <br />
              Esta ação é irreversível. Consultores que já usaram esse modelo mantêm suas campanhas — só o modelo é removido da galeria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

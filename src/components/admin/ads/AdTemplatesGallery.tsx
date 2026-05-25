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
import { TemplateInfoCard } from "./TemplateInfoCard";
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
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((t) => (
          <TemplateInfoCard
            key={t.id}
            template={t}
            mode="use"
            consultantId={consultantId}
            onTogglePublish={isSuperAdmin ? () => handleToggle(t) : undefined}
            onDelete={isSuperAdmin ? () => setConfirmDelete(t) : undefined}
            busy={toggling === t.id || deleting === t.id}
            footer={
              <div className="space-y-1.5">
                <SmartPublishButton
                  template={t}
                  consultantId={consultantId}
                  onPublished={onPublished}
                  onFallback={(tpl) => setPicked(tpl)}
                />
                <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setPicked(t)}>
                  <Settings2 className="w-3.5 h-3.5" /> Personalizar antes de publicar
                </Button>
              </div>
            }
          />
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

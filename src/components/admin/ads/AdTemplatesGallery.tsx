import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ImageIcon, Settings2 } from "lucide-react";
import { AdTemplate, listAdTemplates } from "@/services/adTemplates";
import { UseTemplateDialog } from "./UseTemplateDialog";
import { SmartPublishButton } from "./SmartPublishButton";

interface Props { consultantId: string; onPublished?: () => void }

export function AdTemplatesGallery({ consultantId, onPublished }: Props) {
  const [items, setItems] = useState<AdTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<AdTemplate | null>(null);

  useEffect(() => {
    listAdTemplates({ onlyPublished: true })
      .then((r) => setItems(r))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

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
          <Card key={t.id} className="overflow-hidden flex flex-col">
            <div className="aspect-square bg-muted grid grid-cols-3 grid-rows-1 gap-0.5">
              {t.photos.slice(0, 3).map((p, i) => (
                <img key={i} src={p.url} alt="" className="w-full h-full object-cover" />
              ))}
              {Array.from({ length: Math.max(0, 3 - t.photos.length) }).map((_, i) => (
                <div key={i} className="bg-muted/50" />
              ))}
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
    </>
  );
}
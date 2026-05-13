import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { smartPublish } from "@/services/smartPublish";
import { AdTemplate } from "@/services/adTemplates";

interface Props {
  template: AdTemplate;
  consultantId: string;
  onPublished?: () => void;
  onFallback?: (template: AdTemplate) => void;
}

export function SmartPublishButton({ template, consultantId, onPublished, onFallback }: Props) {
  const [loading, setLoading] = useState(false);
  const [stepLabel, setStepLabel] = useState("");

  async function handleClick() {
    setLoading(true);
    setStepLabel("");
    const toastId = toast.loading("Iniciando publicação inteligente...");
    try {
      const r = await smartPublish({
        template,
        consultantId,
        onProgress: (p) => {
          setStepLabel(p.label);
          toast.loading(p.label, { id: toastId });
        },
      });
      toast.success(
        `Campanha publicada em ${r.preset.nome} (${r.cities.map((c) => c.name).join(", ")})`,
        { id: toastId, description: "Em revisão pelo Facebook." }
      );
      onPublished?.();
    } catch (e: any) {
      toast.error("Não consegui publicar automaticamente", {
        id: toastId,
        description: `${e?.message || "Tente o modo personalizado."}`,
      });
      onFallback?.(template);
    } finally {
      setLoading(false);
      setStepLabel("");
    }
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="w-full gap-1.5 bg-primary hover:bg-primary/90"
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="truncate">{stepLabel || "Publicando..."}</span>
        </>
      ) : (
        <>
          <Zap className="w-3.5 h-3.5" /> Publicar inteligente
        </>
      )}
    </Button>
  );
}

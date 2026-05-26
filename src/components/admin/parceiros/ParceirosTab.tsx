import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PartnerList } from "./PartnerList";
import { PartnerForm } from "./PartnerForm";
import { PartnerMetrics } from "./PartnerMetrics";
import { PartnerQrCode } from "./PartnerQrCode";
import {
  useReferralPartners,
  type ReferralPartner,
} from "./hooks/useReferralPartners";
import { useToast } from "@/hooks/use-toast";

interface ParceirosTabProps {
  consultantPhone: string;
}

export function ParceirosTab({ consultantPhone }: ParceirosTabProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ReferralPartner | null>(
    null,
  );
  const [qrPartner, setQrPartner] = useState<ReferralPartner | null>(null);
  const { partners, metrics, create, update, remove, isLoading } =
    useReferralPartners();
  const { toast } = useToast();

  const handleSave = (data: {
    nome: string;
    cli: string;
    keywords: string[];
    qr_phrase: string | null;
  }) => {
    if (editingPartner) {
      update.mutate(
        { id: editingPartner.id, ...data },
        {
          onSuccess: () =>
            toast({ title: "Parceiro atualizado com sucesso!" }),
          onError: () =>
            toast({
              title: "Erro ao atualizar parceiro",
              variant: "destructive",
            }),
        },
      );
    } else {
      create.mutate(data, {
        onSuccess: () => toast({ title: "Parceiro criado com sucesso!" }),
        onError: () =>
          toast({
            title: "Erro ao criar parceiro",
            variant: "destructive",
          }),
      });
    }
  };

  const handleDelete = (id: string) => {
    remove.mutate(id, {
      onSuccess: () => toast({ title: "Parceiro removido." }),
      onError: () =>
        toast({ title: "Erro ao remover parceiro", variant: "destructive" }),
    });
  };

  const handleEdit = (partner: ReferralPartner) => {
    setEditingPartner(partner);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingPartner(null);
  };

  return (
    <div className="space-y-6">
      <PartnerMetrics metrics={metrics} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Parceiros Indicadores</CardTitle>
          <Button onClick={() => setFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Parceiro
          </Button>
        </CardHeader>
        <CardContent>
          <PartnerList
            partners={partners}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onQrCode={setQrPartner}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      <PartnerForm
        open={formOpen}
        partner={editingPartner}
        onClose={handleCloseForm}
        onSave={handleSave}
      />

      {qrPartner && (
        <PartnerQrCode
          open={!!qrPartner}
          onClose={() => setQrPartner(null)}
          partnerName={qrPartner.nome}
          keyword={qrPartner.keywords?.[0] || ""}
          consultantPhone={consultantPhone}
          qrPhrase={qrPartner.qr_phrase}
        />
      )}
    </div>
  );
}

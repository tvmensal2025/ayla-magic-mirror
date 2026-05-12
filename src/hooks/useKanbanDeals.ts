import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type CrmDealRow = Tables<"crm_deals">;
type CrmDealUpdate = TablesUpdate<"crm_deals">;

export function useKanbanDeals(consultantId: string) {
  const [deals, setDeals] = useState<CrmDealRow[]>([]);
  const { toast } = useToast();

  const fetchDeals = useCallback(async () => {
    const { data } = await supabase
      .from("crm_deals")
      .select("*, customers(name, phone_whatsapp)")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false });
    if (data) {
      // Enrich deals with customer_name from joined data
      const enriched = data.map((d: any) => ({
        ...d,
        customer_name: d.customers?.name || null,
      }));
      setDeals(enriched);
    }
  }, [consultantId]);

  // Also try to resolve names by phone for deals without customer_id
  const resolveNames = useCallback(async (rawDeals: CrmDealRow[]) => {
    const needsLookup = rawDeals.filter((d) => !(d as any).customer_name && d.remote_jid);
    if (needsLookup.length === 0) return;
    const phones = needsLookup.map((d) => d.remote_jid!.split("@")[0]);
    const { data: customers } = await supabase.from("customers").select("name, phone_whatsapp").in("phone_whatsapp", phones);
    if (!customers || customers.length === 0) return;
    const phoneMap = new Map(customers.map((c) => [c.phone_whatsapp, c.name]));
    setDeals((prev) =>
      prev.map((d) => {
        if ((d as any).customer_name) return d;
        const phone = d.remote_jid?.split("@")[0];
        const name = phone ? phoneMap.get(phone) : null;
        return name ? { ...d, customer_name: name } as any : d;
      })
    );
  }, []);

  const moveDeal = async (dealId: string, stageKey: string, rejectionReason?: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return null;

    const updateData: CrmDealUpdate = { stage: stageKey };
    if (stageKey === "aprovado") {
      updateData.approved_at = new Date().toISOString();
      (updateData as any).deal_origin = "aprovado";
      (updateData as any).rejected_at = null;
      (updateData as any).rejection_reason = null;
    }
    if (stageKey === "reprovado") {
      (updateData as any).rejected_at = new Date().toISOString();
      (updateData as any).deal_origin = "reprovado";
    }
    if (rejectionReason) {
      (updateData as any).rejection_reason = rejectionReason;
    }

    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, ...updateData } : d)));

    const { error } = await supabase.from("crm_deals").update(updateData).eq("id", dealId);
    if (error) {
      toast({ title: "Erro ao mover deal", variant: "destructive" });
      fetchDeals();
      return null;
    }
    return { ...deal, ...updateData } as CrmDealRow;
  };

  const editDeal = async (dealId: string, phone: string, notes: string, originalJid: string | null) => {
    const newJid = phone.replace(/\D/g, "");
    const { error } = await supabase.from("crm_deals").update({
      remote_jid: newJid ? `${newJid}@s.whatsapp.net` : originalJid,
      notes: notes || null,
    }).eq("id", dealId);
    if (error) {
      toast({ title: "Erro ao editar deal", variant: "destructive" });
    } else {
      setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, remote_jid: newJid ? `${newJid}@s.whatsapp.net` : d.remote_jid, notes: notes || null } : d));
      toast({ title: "Deal atualizado!" });
    }
  };

  const deleteDeal = async (dealId: string) => {
    const { error } = await supabase.from("crm_deals").delete().eq("id", dealId);
    if (error) {
      toast({ title: "Erro ao excluir deal", variant: "destructive" });
    } else {
      setDeals((prev) => prev.filter((d) => d.id !== dealId));
      toast({ title: "Deal excluído!" });
    }
  };

  return { deals, setDeals, fetchDeals, resolveNames, moveDeal, editDeal, deleteDeal };
}

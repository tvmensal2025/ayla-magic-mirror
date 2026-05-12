import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCustomerPhone, type Customer } from "@/components/whatsapp/customerUtils";

export function useCustomerDeals(consultantId: string, customers: Customer[]) {
  const [dealsByCustomer, setDealsByCustomer] = useState<Record<string, { stage: string; deal_origin?: string | null }>>({});

  useEffect(() => {
    async function fetchDeals() {
      const { data } = await supabase
        .from("crm_deals")
        .select("customer_id, remote_jid, stage, deal_origin, updated_at")
        .eq("consultant_id", consultantId)
        .order("updated_at", { ascending: false });

      if (data) {
        const map: Record<string, { stage: string; deal_origin?: string | null }> = {};

        for (const deal of data) {
          if (deal.customer_id && !map[deal.customer_id]) {
            map[deal.customer_id] = { stage: deal.stage, deal_origin: deal.deal_origin };
            continue;
          }

          const dealPhone = normalizeCustomerPhone(deal.remote_jid);
          if (!dealPhone) continue;

          for (const customer of customers) {
            const customerPhone = normalizeCustomerPhone(customer.phone_whatsapp);
            if (!customerPhone || map[customer.id]) continue;
            if (customerPhone === dealPhone || customerPhone.endsWith(dealPhone) || dealPhone.endsWith(customerPhone)) {
              map[customer.id] = { stage: deal.stage, deal_origin: deal.deal_origin };
            }
          }
        }

        setDealsByCustomer(map);
      }
    }

    fetchDeals();
  }, [consultantId, customers]);

  return dealsByCustomer;
}

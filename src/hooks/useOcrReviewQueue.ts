// Hook que escuta `customers.ocr_review_pending` em realtime e devolve a
// fila de leads aguardando o consultor revisar foto + dados (OCR de
// conta de luz ou documento). Usado pelo banner global do painel admin.
//
// Auto-timeout de 5 min é tratado pelo backend (`ocr-review-timeout-cron`),
// não pelo frontend — assim funciona mesmo se a aba estiver fechada.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OcrReviewItem {
  customer_id: string;
  customer_name: string | null;
  phone_whatsapp: string | null;
  kind: "bill" | "doc";
  started_at: string;
  electricity_bill_photo_url?: string | null;
  document_front_url?: string | null;
}

export function useOcrReviewQueue(consultantId: string | null) {
  const [items, setItems] = useState<OcrReviewItem[]>([]);

  const refresh = useCallback(async () => {
    if (!consultantId) { setItems([]); return; }
    try {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone_whatsapp, ocr_review_pending, ocr_review_started_at, electricity_bill_photo_url, document_front_url")
        .eq("consultant_id", consultantId)
        .not("ocr_review_pending", "is", null)
        .order("ocr_review_started_at", { ascending: true });
      const rows = (data as any[]) || [];
      setItems(rows.map((r) => ({
        customer_id: r.id,
        customer_name: r.name,
        phone_whatsapp: r.phone_whatsapp,
        kind: r.ocr_review_pending,
        started_at: r.ocr_review_started_at,
        electricity_bill_photo_url: r.electricity_bill_photo_url,
        document_front_url: r.document_front_url,
      })));
    } catch (e) {
      console.warn("[ocr-review-queue] refresh failed", e);
    }
  }, [consultantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: escuta updates em customers do mesmo consultor.
  useEffect(() => {
    if (!consultantId) return;
    const ch = supabase
      .channel(`ocr-review:${consultantId}-${Math.random().toString(36).slice(2, 6)}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "customers", filter: `consultant_id=eq.${consultantId}` },
        () => { void refresh(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [consultantId, refresh]);

  return { items, refresh };
}

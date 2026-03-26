import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTrackingMeta } from "./useTrackEvent";

export function useTrackView(consultantId: string | undefined, pageType: "client" | "licenciada") {
  useEffect(() => {
    if (!consultantId) return;
    const meta = getTrackingMeta();
    supabase.from("page_views").insert({
      consultant_id: consultantId,
      page_type: pageType,
      ...meta,
    }).then(() => {});
  }, [consultantId, pageType]);
}

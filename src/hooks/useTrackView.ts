import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useTrackView(consultantId: string | undefined, pageType: "client" | "licenciada") {
  useEffect(() => {
    if (!consultantId) return;
    supabase.from("page_views").insert({
      consultant_id: consultantId,
      page_type: pageType,
    }).then(() => {});
  }, [consultantId, pageType]);
}

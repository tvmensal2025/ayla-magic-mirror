import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FacebookConnection {
  id: string;
  fb_user_id: string;
  fb_user_name: string | null;
  business_id: string | null;
  business_name: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  ad_account_currency: string | null;
  page_id: string | null;
  page_name: string | null;
  ig_account_id: string | null;
  ig_account_username: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  whatsapp_destination_number: string | null;
  status: string;
  token_expires_at: string | null;
  last_validated_at: string | null;
}

export function useFacebookConnection(consultantId: string | null) {
  const [connection, setConnection] = useState<FacebookConnection | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!consultantId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("facebook_connections")
      .select("id,fb_user_id,fb_user_name,business_id,business_name,ad_account_id,ad_account_name,ad_account_currency,page_id,page_name,ig_account_id,ig_account_username,pixel_id,pixel_name,whatsapp_destination_number,status,token_expires_at,last_validated_at")
      .eq("consultant_id", consultantId)
      .maybeSingle();
    setConnection((data as FacebookConnection | null) ?? null);
    setLoading(false);
  }, [consultantId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { connection, loading, refresh };
}

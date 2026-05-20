import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CaptureSuggestion {
  id: string;
  customer_id: string;
  field_name: string;
  suggested_value: string;
  confidence: number;
  status: "pending" | "accepted" | "edited" | "dismissed";
  created_at: string;
}

export function useCaptureSuggestions(customerId: string | null) {
  const [suggestions, setSuggestions] = useState<CaptureSuggestion[]>([]);

  const load = useCallback(async () => {
    if (!customerId) { setSuggestions([]); return; }
    const { data } = await supabase
      .from("capture_field_suggestions")
      .select("id, customer_id, field_name, suggested_value, confidence, status, created_at")
      .eq("customer_id", customerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setSuggestions((data as any) || []);
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!customerId) return;
    const ch = supabase
      .channel(`cfs-${customerId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "capture_field_suggestions", filter: `customer_id=eq.${customerId}` },
        () => { void load(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [customerId, load]);

  const resolve = useCallback(async (id: string, status: "accepted" | "edited" | "dismissed") => {
    await supabase.from("capture_field_suggestions")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", id);
    setSuggestions((s) => s.filter((x) => x.id !== id));
  }, []);

  return { suggestions, resolve, reload: load };
}

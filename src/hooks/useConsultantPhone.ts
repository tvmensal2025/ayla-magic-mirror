import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve o telefone WhatsApp do consultor usando a MESMA cascata do backend
 * (loadConsultantAdSettings em supabase/functions/_shared/fb-graph.ts):
 *   1. consultant_ad_settings.whatsapp_destination_number
 *   2. whatsapp_instances.connected_phone
 *   3. consultants.phone
 *   4. facebook_connections.whatsapp_destination_number  (último recurso)
 *
 * Sempre retorna apenas dígitos. Nunca usa número hardcoded.
 */
export function useConsultantPhone(consultantId: string | undefined | null) {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!consultantId);

  useEffect(() => {
    if (!consultantId) {
      setPhone(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const onlyDigits = (v: unknown) => {
        const s = String(v ?? "").replace(/\D/g, "");
        return s.length >= 10 ? s : null;
      };

      // 1) consultant_ad_settings
      const { data: cas } = await supabase
        .from("consultant_ad_settings")
        .select("whatsapp_destination_number")
        .eq("consultant_id", consultantId)
        .maybeSingle();
      let resolved = onlyDigits(cas?.whatsapp_destination_number);

      // 2) whatsapp_instances
      if (!resolved) {
        const { data: inst } = await supabase
          .from("whatsapp_instances")
          .select("connected_phone")
          .eq("consultant_id", consultantId)
          .not("connected_phone", "is", null)
          .limit(1)
          .maybeSingle();
        resolved = onlyDigits((inst as any)?.connected_phone);
      }

      // 3) consultants.phone
      if (!resolved) {
        const { data: c } = await supabase
          .from("consultants")
          .select("phone")
          .eq("id", consultantId)
          .maybeSingle();
        resolved = onlyDigits(c?.phone);
      }

      // 4) facebook_connections
      if (!resolved) {
        const { data: fb } = await supabase
          .from("facebook_connections")
          .select("whatsapp_destination_number, whatsapp_display_number")
          .eq("consultant_id", consultantId)
          .maybeSingle();
        resolved = onlyDigits(fb?.whatsapp_destination_number)
          || onlyDigits(fb?.whatsapp_display_number);
      }

      if (!cancelled) {
        setPhone(resolved);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [consultantId]);

  return { phone, loading };
}

export function formatBrPhone(digits: string | null): string {
  if (!digits) return "(não configurado)";
  const d = digits.replace(/\D/g, "");
  if (d.length < 12) return `+${d}`;
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, d.length - 4)}-${d.slice(-4)}`;
}

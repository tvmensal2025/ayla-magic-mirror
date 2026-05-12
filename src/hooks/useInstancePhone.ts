import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Busca o telefone conectado na instância WhatsApp do consultor.
 * Retorna o connected_phone ou null se não houver instância/telefone.
 */
export function useInstancePhone(consultantId: string | undefined) {
  return useQuery({
    queryKey: ["instance-phone", consultantId],
    queryFn: async () => {
      if (!consultantId) return null;
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("connected_phone")
        .eq("consultant_id", consultantId)
        .not("connected_phone", "is", null)
        .limit(1)
        .maybeSingle();
      return (data as any)?.connected_phone as string | null;
    },
    enabled: !!consultantId,
  });
}

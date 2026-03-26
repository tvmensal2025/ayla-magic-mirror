import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Consultant } from "@/types/consultant";

export function useConsultant(license: string) {
  return useQuery<Consultant | null>({
    queryKey: ["consultant", license],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultants")
        .select("*")
        .eq("license", license)
        .maybeSingle();

      if (error) throw error;
      return data as Consultant | null;
    },
    enabled: !!license,
  });
}

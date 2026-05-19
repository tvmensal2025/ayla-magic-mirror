import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ManagedConsultant {
  id: string;
  name: string;
  isSelf: boolean;
}

export function useManagedConsultants(userId: string | undefined | null) {
  return useQuery({
    queryKey: ["managed-consultants", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ManagedConsultant[]> => {
      const result: ManagedConsultant[] = [];

      // Self
      const { data: self } = await supabase
        .from("consultants")
        .select("id, name")
        .eq("id", userId!)
        .maybeSingle();
      if (self) result.push({ id: self.id, name: `${self.name} (você)`, isSelf: true });

      // Managed
      const { data: links } = await supabase
        .from("ad_account_managers")
        .select("consultant_id")
        .eq("manager_user_id", userId!);

      const managedIds = (links ?? []).map((l: any) => l.consultant_id).filter((id: string) => id !== userId);
      if (managedIds.length) {
        const { data: managed } = await supabase
          .from("consultants")
          .select("id, name")
          .in("id", managedIds);
        for (const c of managed ?? []) result.push({ id: c.id, name: c.name, isSelf: false });
      }
      return result;
    },
    staleTime: 5 * 60_000,
  });
}

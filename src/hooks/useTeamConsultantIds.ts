import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the leader's id + ALL descendants via consultants.referred_by (recursive).
 * If the consultant has no team, returns [leaderId] only.
 */
export function useTeamConsultantIds(leaderId: string | null | undefined) {
  return useQuery({
    queryKey: ["team-consultant-ids", leaderId],
    enabled: !!leaderId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("get_team_consultant_ids" as any, {
        _leader: leaderId!,
      });
      if (error) throw error;
      const ids = ((data as unknown) as string[] | null) ?? [];
      return ids.length > 0 ? ids : [leaderId!];
    },
  });
}

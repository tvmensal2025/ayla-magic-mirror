import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminAuditEntry {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useAdminAudit(limit = 100) {
  return useQuery({
    queryKey: ["admin_audit_log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as AdminAuditEntry[];
    },
    staleTime: 30_000,
  });
}

/** Registra uma ação administrativa de forma assíncrona (fire-and-forget). */
export async function logAdminAction(
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.rpc("log_admin_action" as any, {
      _action: action,
      _target_type: targetType ?? null,
      _target_id: targetId ?? null,
      _metadata: (metadata as any) ?? null,
    });
  } catch (e) {
    // Falha silenciosa — não bloqueia ação principal
    console.warn("[audit] falhou registrar ação:", action, e);
  }
}

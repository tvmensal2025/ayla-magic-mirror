import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUserRole(userId: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setCheckedUserId(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const checkRole = async () => {
      try {
        const [adminRes, superRes] = await Promise.all([
          supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
          supabase.rpc("is_super_admin", { _user_id: userId }),
        ]);
        if (adminRes.error) throw adminRes.error;
        if (!cancelled) {
          setIsAdmin(Boolean(adminRes.data) || Boolean(superRes.data));
          setIsSuperAdmin(Boolean(superRes.data));
          setCheckedUserId(userId);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
          setIsSuperAdmin(false);
          setCheckedUserId(userId);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkRole();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isCheckingCurrentUser = Boolean(userId) && (loading || checkedUserId !== userId);

  return { isAdmin, isSuperAdmin, loading: isCheckingCurrentUser };
}

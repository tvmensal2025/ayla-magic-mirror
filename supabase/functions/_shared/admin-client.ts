// Wrapper único para criar Supabase client com service_role.
// Centraliza a criação para facilitar auditoria (quem usou bypass de RLS)
// e padronizar headers/options.
//
// USO (recomendado em novas edge functions):
//   import { getAdminClient } from "../_shared/admin-client.ts";
//   const supabase = getAdminClient("nome-da-funcao");
//
// Edge functions legadas continuam usando `createClient(...)` direto — migração
// é opt-in para evitar regressão em código sensível. Veja .lovable/plan.md Fase 4.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Retorna um Supabase client com `service_role` (bypass de RLS).
 *
 * @param callerName Identificador da edge function que está pedindo o client.
 *                   Aparece nos headers para tornar fácil rastrear via logs do
 *                   Postgres / Supabase qual função fez determinada query.
 */
export function getAdminClient(callerName: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      `[admin-client] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (caller=${callerName})`,
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        "x-edge-caller": callerName,
        "x-client-info": `lovable-edge/${callerName}`,
      },
    },
  });
}

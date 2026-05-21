// Kill switch global — Fase 0 da auditoria de lançamento.
// Lido por webhooks e crons antes de qualquer ação automática.
// Cache 5s para evitar query em cada inbound.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

let _cache: { enabled: boolean; t: number } | null = null;
const TTL_MS = 5_000;

export async function isBotGloballyEnabled(supabase: SupabaseClient): Promise<boolean> {
  if (_cache && Date.now() - _cache.t < TTL_MS) return _cache.enabled;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("bot_global_enabled")
      .eq("id", "global")
      .maybeSingle();
    // Fail-open: se a linha não existir ou der erro, assume habilitado.
    const enabled = data ? !!(data as any).bot_global_enabled : true;
    _cache = { enabled, t: Date.now() };
    return enabled;
  } catch {
    return true;
  }
}

export function clearBotGlobalFlagCache() {
  _cache = null;
}

// F2 — resolver strict mode flag (default false). Quando true, o bot-flow
// resolver NÃO reseta para aguardando_conta quando custom step não bate.
let _strictCache: { enabled: boolean; t: number } | null = null;

export async function isResolverStrictMode(supabase: SupabaseClient): Promise<boolean> {
  if (_strictCache && Date.now() - _strictCache.t < TTL_MS) return _strictCache.enabled;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("resolver_strict_mode")
      .eq("id", "global")
      .maybeSingle();
    const enabled = data ? !!(data as any).resolver_strict_mode : false;
    _strictCache = { enabled, t: Date.now() };
    return enabled;
  } catch {
    return false;
  }
}


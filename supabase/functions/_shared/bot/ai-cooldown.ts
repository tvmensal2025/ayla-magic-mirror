// Sprint 2.6 — extracted from {whapi,evolution}-webhook/handlers/conversational/index.ts
// Cooldown para chamadas de IA (fallback Gemini). Quando a IA degrada (429/erro),
// pulamos chamadas por 60s por consultor para não saturar o gateway.
//
// Implementação em duas camadas:
//   1. In-memory (Map): rápido, zero latência, mas não compartilhado entre containers.
//   2. Persistente (ai_cooldown_state no banco): compartilhado entre todos os containers.
//      Usado quando o supabase client está disponível (chamadas de webhook).
//
// A camada in-memory serve como cache local para evitar um SELECT a cada mensagem.
// A camada persistente é a fonte de verdade em ambientes multi-container.

const aiCooldownMap = new Map<string, number>();
const COOLDOWN_MS = 60_000;

/** Verifica cooldown apenas em memória (sem I/O). Usado como cache rápido. */
export function aiInCooldown(key: string): boolean {
  const until = aiCooldownMap.get(key);
  return !!until && Date.now() < until;
}

/** Seta cooldown em memória. */
export function setAiCooldown(key: string): void {
  aiCooldownMap.set(key, Date.now() + COOLDOWN_MS);
}

export function clearAiCooldown(key: string): void {
  aiCooldownMap.delete(key);
}

/**
 * Verifica cooldown no banco (compartilhado entre containers).
 * Retorna true se em cooldown, false se livre.
 * Atualiza o cache in-memory para evitar consultas repetidas.
 * Fail-open: se o banco falhar, usa apenas o cache local.
 */
export async function aiInCooldownPersistent(
  supabase: any,
  key: string,
): Promise<boolean> {
  // Cache local ainda válido → não consulta o banco
  if (aiInCooldown(key)) return true;
  try {
    const { data } = await supabase
      .from("ai_cooldown_state")
      .select("until_at")
      .eq("cooldown_key", key)
      .maybeSingle();
    if (data?.until_at && new Date(data.until_at) > new Date()) {
      // Sincroniza cache local com o valor do banco
      aiCooldownMap.set(key, new Date(data.until_at).getTime());
      return true;
    }
  } catch (_e) {
    // Fail-open: banco indisponível → usa apenas cache local
  }
  return false;
}

/**
 * Seta cooldown no banco E no cache local.
 * Fail-safe: se o banco falhar, o cache local ainda protege este container.
 */
export async function setAiCooldownPersistent(
  supabase: any,
  key: string,
  reason = "ai_error",
): Promise<void> {
  setAiCooldown(key); // sempre atualiza local primeiro
  try {
    await supabase.rpc("ai_cooldown_check_and_set", {
      p_key: key,
      p_ttl_ms: COOLDOWN_MS,
      p_reason: reason,
    });
  } catch (_e) {
    // Fail-safe: banco indisponível → cache local ainda funciona
  }
}

// Modo "instantâneo" dos passos do fluxo.
//
// Quando ligado (default true), zera as pausas de humanização entre mídias e
// antes do texto. O "digitando…" do Whapi continua sendo enviado, mas com
// typing_time mínimo (1s) — o WhatsApp não aceita 0. Isso elimina os 5–15s
// que cada passo gastava antes em sleeps acumulados (text_delay_ms padrão de
// 1500ms, gaps fixos entre mídias, humanPace de 2–12s no engine v3).
//
// Para reverter ao ritmo humano antigo, basta setar a env var
// `FLOW_INSTANT_MODE=false` nas Edge Functions (sem mudar código).

let cached: boolean | null = null;

export function isFlowInstantMode(): boolean {
  if (cached !== null) return cached;
  try {
    const raw = (Deno.env.get("FLOW_INSTANT_MODE") ?? "true").toLowerCase();
    cached = raw !== "false" && raw !== "0" && raw !== "off";
  } catch (_) {
    cached = true;
  }
  return cached;
}

/** Apenas para testes — força recálculo da env. */
export function __resetFlowInstantModeCache(): void {
  cached = null;
}

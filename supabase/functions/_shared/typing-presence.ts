// Task 25 (whatsapp-flow-reliability-fix): wrapper que mantém presença
// "digitando…" / "gravando áudio" ativa por toda a duração de uma
// operação outbound, renovando a cada 2.8s.
//
// Antes desse helper, o consultor enviava `sendPresence("composing")` UMA
// vez antes de uma sequência de mídias e o WhatsApp parava de mostrar
// o indicador depois de ~3-4 segundos. Em fluxos com vídeo + áudio + texto,
// o lead via "digitando…" sumir e voltar várias vezes — cheirava bot.
//
// Uso:
//
//   await withTypingPresence({
//     sendPresence: (p) => sender.sendPresence(remoteJid, p),
//     presence: "composing",
//     run: async () => {
//       await sender.sendText(remoteJid, "olá");
//       await sleep(3000);
//       await sender.sendMedia(remoteJid, "https://...");
//     },
//   });
//
// Garantias:
//   - Renova `sendPresence(presence)` a cada `RENEW_INTERVAL_MS` (2800ms).
//   - Sempre envia `sendPresence("paused")` após `run` retornar (sucesso ou
//     erro), pra não deixar o ícone preso.
//   - Falhas de presença NUNCA quebram a operação principal — só logam.
//   - Quando `sendPresence` falhar consistentemente, NÃO tenta forever:
//     pula renovação após 3 falhas seguidas pra não floodar a Evolution.

export type PresenceKind = "composing" | "recording" | "paused" | "available";

export interface WithTypingPresenceInput<T> {
  /** Função que envia presença. Deve retornar true em sucesso, false em falha. */
  sendPresence: (p: PresenceKind) => Promise<boolean>;
  /** Que presença manter (default 'composing'). */
  presence?: PresenceKind;
  /** Operação que roda enquanto a presença é renovada. */
  run: () => Promise<T>;
}

/** Intervalo entre renovações. WhatsApp Web mantém o estado por ~3s. */
export const TYPING_PRESENCE_RENEW_MS = 2800;
const MAX_PRESENCE_FAILURES_BEFORE_GIVEUP = 3;

export async function withTypingPresence<T>(
  input: WithTypingPresenceInput<T>,
): Promise<T> {
  const presence = input.presence ?? "composing";
  let failures = 0;
  let stopped = false;

  // Primeiro envio síncrono para o lead ver "digitando…" antes de qualquer texto.
  // Falha aqui não bloqueia: presença é cosmética.
  try {
    const ok = await input.sendPresence(presence);
    if (!ok) failures++;
  } catch (_) {
    failures++;
  }

  const interval = setInterval(() => {
    if (stopped) return;
    if (failures >= MAX_PRESENCE_FAILURES_BEFORE_GIVEUP) return;
    // Não await — renovação é fire-and-forget para não bloquear.
    Promise.resolve()
      .then(() => input.sendPresence(presence))
      .then((ok) => { if (!ok) failures++; })
      .catch(() => { failures++; });
  }, TYPING_PRESENCE_RENEW_MS);

  try {
    return await input.run();
  } finally {
    stopped = true;
    clearInterval(interval);
    // Encerra presença explicitamente. Evita "digitando…" preso quando
    // o lado servidor termina mas o cliente WhatsApp ainda exibe.
    try { await input.sendPresence("paused"); } catch (_) { /* swallow */ }
  }
}

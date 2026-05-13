// Delay humano antes de enviar mensagem outbound, SEM exibir indicador "digitando".
// Calcula tempo de "leitura + digitação" baseado no tamanho da mensagem.
// Uso: await humanPace(text); await sendText(jid, text);

export async function humanPace(text: string, opts?: { minMs?: number; maxMs?: number }): Promise<void> {
  const len = (text || "").length;
  // Base: ~2.5s + 50ms/char (≈ 1200 chars/min digitação humana relaxada)
  const base = 2500 + len * 50;
  const jitter = (Math.random() * 0.4 - 0.2) * base; // ±20%
  const min = opts?.minMs ?? 3000;
  const max = opts?.maxMs ?? 12000;
  const ms = Math.min(max, Math.max(min, Math.round(base + jitter)));
  await new Promise((r) => setTimeout(r, ms));
}

// Delay extra entre mensagens consecutivas (ex.: bot manda 2 textos em sequência).
export async function pauseBetweenMessages(): Promise<void> {
  const ms = 1200 + Math.random() * 1500;
  await new Promise((r) => setTimeout(r, ms));
}

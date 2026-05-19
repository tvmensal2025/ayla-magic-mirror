// Delay humano antes de enviar mensagem outbound, SEM exibir indicador "digitando".
// Calcula tempo de "leitura + digitação" baseado no tamanho da mensagem.
// Uso: await humanPace(text); await sendText(jid, text);

export async function humanPace(text: string, opts?: { minMs?: number; maxMs?: number }): Promise<void> {
  const len = (text || "").length;
  // Base: ~2.2s + 55ms/char (≈ humano lendo + digitando)
  const base = 2200 + len * 55;
  const jitter = (Math.random() * 0.5 - 0.25) * base; // ±25%
  const min = opts?.minMs ?? 2200;
  const max = opts?.maxMs ?? 11000;
  const ms = Math.min(max, Math.max(min, Math.round(base + jitter)));
  await new Promise((r) => setTimeout(r, ms));
}

// Delay extra entre mensagens consecutivas (ex.: bot manda 2 textos em sequência).
export async function pauseBetweenMessages(): Promise<void> {
  const ms = 1800 + Math.random() * 2000;
  await new Promise((r) => setTimeout(r, ms));
}

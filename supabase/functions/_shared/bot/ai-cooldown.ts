// Sprint 2.6 — extracted from {whapi,evolution}-webhook/handlers/conversational/index.ts
// Process-local cooldown for AI fallbacks. Quando a IA degrada (429/erro),
// pulamos chamadas por 60s por (consultor) para não saturar gateway.
//
// Atenção: isso é estado por instância de edge function (cold start zera).
// Não há persistência intencional — degradação curta deve resolver sozinha.

const aiCooldown = new Map<string, number>();
const COOLDOWN_MS = 60_000;

export function aiInCooldown(key: string): boolean {
  const until = aiCooldown.get(key);
  return !!until && Date.now() < until;
}

export function setAiCooldown(key: string): void {
  aiCooldown.set(key, Date.now() + COOLDOWN_MS);
}

export function clearAiCooldown(key: string): void {
  aiCooldown.delete(key);
}

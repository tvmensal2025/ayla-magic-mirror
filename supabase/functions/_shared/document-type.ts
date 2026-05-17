// ─────────────────────────────────────────────────────────────────────
// Convenção ÚNICA de tipo de documento usada em TODO o sistema.
// Sempre que o webhook ou worker receberem `document_type` em qualquer
// formato textual ("CNH", "cnh", "RG (Novo)", "rg novo", etc.) eles
// devem normalizar via `normalizeDocumentType()` antes de tomar decisões.
//
// Valores canônicos:
//   - "cnh"       → Carteira Nacional de Habilitação (sem verso)
//   - "rg_novo"   → RG novo (frente + verso)
//   - "rg_antigo" → RG antigo (frente + verso, padrão legado)
// ─────────────────────────────────────────────────────────────────────

export type DocumentTypeCanonical = "cnh" | "rg_novo" | "rg_antigo";

/**
 * Normaliza qualquer string em um dos 3 valores canônicos.
 * Default = "rg_antigo" (mais comum/seguro: força frente+verso).
 */
export function normalizeDocumentType(input: unknown): DocumentTypeCanonical {
  const raw = String(input || "").trim().toLowerCase().replace(/[._-]/g, " ");
  if (!raw) return "rg_antigo";

  // Sprint D-B12: whitelist com word boundaries — evita "argo" virar rg, "cnhx" virar cnh, etc.
  // Ordem importa: CNH primeiro (mais específico), depois RG novo, depois RG antigo.

  // CNH: aceita "cnh", "habilitação", "carteira nacional [de habilitação]", "carteira de motorista"
  if (/\bcnh\b/.test(raw)) return "cnh";
  if (/\bhabilita\w*\b/.test(raw)) return "cnh";
  if (/\bcarteira\s+nacional\b/.test(raw)) return "cnh";
  if (/\bcarteira\s+de\s+motorista\b/.test(raw)) return "cnh";
  if (/\bmotorista\b/.test(raw) && /\bcarteira\b/.test(raw)) return "cnh";

  // RG novo: precisa de "novo" explícito junto de rg/identidade
  if (/\brg\s+novo\b/.test(raw)) return "rg_novo";
  if (/\bidentidade\s+nova\b/.test(raw)) return "rg_novo";
  if (/\bnovo\s+(rg|modelo)\b/.test(raw)) return "rg_novo";
  if (/\bcin\b/.test(raw)) return "rg_novo"; // Carteira de Identidade Nacional (CIN = RG novo unificado)

  // RG antigo: padrão para qualquer menção a rg/identidade/registro geral
  if (/\brg\b/.test(raw)) return "rg_antigo";
  if (/\bidentidade\b/.test(raw)) return "rg_antigo";
  if (/\bregistro\s+geral\b/.test(raw)) return "rg_antigo";
  if (/\bantigo\b/.test(raw)) return "rg_antigo";

  return "rg_antigo";
}

/** True quando o tipo de documento é CNH (não tem verso). */
export function isCNH(input: unknown): boolean {
  return normalizeDocumentType(input) === "cnh";
}

/** True quando o tipo exige verso (todos os RGs). */
export function requiresVerso(input: unknown): boolean {
  return normalizeDocumentType(input) !== "cnh";
}

/**
 * Texto exato da opção no MUI Select do portal igreen.
 * Validado live em 2026-04-17: existem 3 opções:
 *   "RG (Antigo)", "RG (Novo)", "CNH".
 */
export function portalSelectLabel(input: unknown): "RG (Antigo)" | "RG (Novo)" | "CNH" {
  switch (normalizeDocumentType(input)) {
    case "cnh":
      return "CNH";
    case "rg_novo":
      return "RG (Novo)";
    default:
      return "RG (Antigo)";
  }
}

/** Rótulo amigável para mensagens ao cliente no WhatsApp. */
export function friendlyLabel(input: unknown): string {
  switch (normalizeDocumentType(input)) {
    case "cnh":
      return "CNH";
    case "rg_novo":
      return "RG (Novo)";
    default:
      return "RG (Antigo)";
  }
}

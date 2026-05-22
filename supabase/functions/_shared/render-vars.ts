/**
 * Helper único para substituir variáveis de template em mensagens enviadas ao cliente.
 *
 * Tolerante a:
 *  - Caixa: {nome}, {Nome}, {NOME}, {{Nome}}…
 *  - Chaves: {nome} ou {{nome}}
 *  - Espaços: {{  nome  }}
 *
 * Substitui também sinônimos comuns: {primeiro_nome}, {first_name}, {name}.
 *
 * IMPORTANTE: NUNCA deixar uma chave `{...}` ou `{{...}}` reconhecida ir para o cliente.
 */

export type RenderVars = {
  name?: string | null;
  phone?: string | null;
  representante?: string | null;
  valor_conta?: number | string | null;
  extra?: Record<string, string | number | null | undefined>;
};

const NAME_KEYS = new Set([
  "nome",
  "nome_completo",
  "name",
  "first_name",
  "primeiro_nome",
  "cliente",
]);

const PHONE_KEYS = new Set(["telefone", "phone", "celular", "whatsapp"]);
const REP_KEYS = new Set([
  "representante",
  "consultor",
  "consultora",
  "atendente",
  "vendedor",
  "vendedora",
]);
const BILL_KEYS = new Set([
  "valor",
  "valor_conta",
  "conta",
  "fatura",
]);

function fmtBRL(v: number) {
  try {
    return v.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return String(v.toFixed(2));
  }
}

function firstNameOf(full: string | null | undefined): string {
  const s = String(full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] || "";
}

/**
 * Renderiza variáveis num texto. Aceita {chave} e {{chave}} em qualquer caixa,
 * com espaços ao redor. Chaves desconhecidas são REMOVIDAS (sem deixar `{...}`
 * vazar pro cliente).
 */
export function renderTemplateVars(text: string | null | undefined, vars: RenderVars): string {
  if (!text) return "";
  const name = String(vars.name || "").trim();
  const firstName = firstNameOf(name);
  const phone = String(vars.phone || "").replace(/\D/g, "");
  const rep = String(vars.representante || "").trim();
  const billNum = typeof vars.valor_conta === "number"
    ? vars.valor_conta
    : Number(vars.valor_conta);
  const hasBill = Number.isFinite(billNum) && billNum > 0;
  const billStr = hasBill ? fmtBRL(billNum) : "";

  const lookup = (rawKey: string): string | null => {
    const key = rawKey.trim().toLowerCase();
    if (NAME_KEYS.has(key)) {
      // {nome_completo} retorna o nome inteiro; resto, primeiro nome.
      if (key === "nome_completo" || key === "name") return name;
      return firstName;
    }
    if (PHONE_KEYS.has(key)) return phone;
    if (REP_KEYS.has(key)) return rep;
    if (BILL_KEYS.has(key)) return billStr;
    if (key === "economia_mensal" && hasBill) return fmtBRL(billNum * 0.20);
    if (key === "economia_anual" && hasBill) return fmtBRL(billNum * 0.20 * 12);
    // extras dinâmicos
    if (vars.extra && Object.prototype.hasOwnProperty.call(vars.extra, key)) {
      const v = vars.extra[key];
      return v == null ? "" : String(v);
    }
    return null;
  };

  // Substitui {{ chave }} e { chave } (1-2 chaves, espaços tolerados, qualquer caixa).
  // Só substitui chaves conhecidas — chaves desconhecidas ficam intactas para debug.
  return text.replace(/\{\{?\s*([a-zA-ZÀ-ÿ_][\w\sÀ-ÿ-]{0,40})\s*\}?\}/g, (match, rawKey: string) => {
    const v = lookup(rawKey);
    if (v == null) return match; // chave desconhecida → mantém literal
    return v;
  });
}

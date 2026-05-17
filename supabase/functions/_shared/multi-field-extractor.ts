// Multi-field extractor — corre todos os extractors em paralelo numa mensagem livre
// e devolve só os campos que casaram. Usado pra capturar dados extras quando o lead
// despeja várias infos numa única mensagem (ex: "sou João, CEP 01310-100, conta 450").
//
// Política: NÃO sobrescreve campos já preenchidos com source forte (manual / OCR).
// Só preenche slots vazios — `source=freeform_multi`.

import { extractCPF, extractNome, extractTelefone, extractValor } from "./captureExtractors.ts";

export interface MultiFieldResult {
  nome?: string;
  cep?: string;
  valor_conta?: number;
  cpf?: string;
  email?: string;
  telefone?: string;
}

const CEP_RX = /\b(\d{5})-?(\d{3})\b/;
const EMAIL_RX = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/;

export function extractCEP(text: string): string | null {
  if (!text) return null;
  const m = text.match(CEP_RX);
  if (!m) return null;
  const digits = `${m[1]}${m[2]}`;
  // descarta sequências triviais (00000000, 12345678 puro)
  if (/^(\d)\1+$/.test(digits)) return null;
  return `${m[1]}-${m[2]}`;
}

export function extractEmail(text: string): string | null {
  if (!text) return null;
  const m = text.match(EMAIL_RX);
  return m ? m[0].toLowerCase() : null;
}

export function extractMultiField(text: string): MultiFieldResult {
  const out: MultiFieldResult = {};
  if (!text || typeof text !== "string") return out;

  try { const v = extractNome(text); if (v) out.nome = v; } catch {}
  try { const v = extractCEP(text); if (v) out.cep = v; } catch {}
  try { const v = extractValor(text); if (v != null) out.valor_conta = v; } catch {}
  try { const v = extractCPF(text); if (v) out.cpf = v; } catch {}
  try { const v = extractEmail(text); if (v) out.email = v; } catch {}
  try { const v = extractTelefone(text); if (v) out.telefone = v; } catch {}

  return out;
}

/**
 * Aplica resultado do multi-extractor ao customer, respeitando hierarquia.
 * Retorna o patch a ser persistido (vazio = nada a fazer).
 *
 * Regras:
 * - `name`: só preenche se vazio OU se source atual for `whatsapp_profile`/`freeform`
 *   (NÃO sobrescreve `manual`, `ocr_cnh`, `ocr_rg`, `ocr_doc`, `self_introduced`).
 * - Outros campos: só preenche se estiverem vazios/null.
 */
export function buildMultiFieldPatch(
  customer: Record<string, any>,
  multi: MultiFieldResult,
): Record<string, any> {
  const patch: Record<string, any> = {};
  const strongNameSources = new Set([
    "manual", "ocr_cnh", "ocr_rg", "ocr_doc", "self_introduced",
  ]);

  const strongNameSources = new Set([
    "manual", "ocr_cnh", "ocr_rg", "ocr_doc", "self_introduced", "freeform_multi",
  ]);
  // whatsapp_profile é fraco — qualquer self-intro do lead sobrescreve.
  if (multi.nome && (!customer.name || !strongNameSources.has(String(customer.name_source || "")))) {
    const cur = String(customer.name || "").trim().toLowerCase();
    if (cur !== multi.nome.toLowerCase()) {
      patch.name = multi.nome;
      patch.name_source = "freeform_multi";
    }
  }
  if (multi.cep && !customer.cep) patch.cep = multi.cep;
  if (multi.valor_conta != null && customer.electricity_bill_value == null) {
    patch.electricity_bill_value = multi.valor_conta;
  }
  if (multi.cpf && !customer.cpf) patch.cpf = multi.cpf;
  if (multi.email && !customer.email) patch.email = multi.email;
  if (multi.telefone && !customer.phone_landline && customer.phone_whatsapp) {
    const wDigits = String(customer.phone_whatsapp).replace(/\D/g, "");
    if (!wDigits.endsWith(multi.telefone)) patch.phone_landline = multi.telefone;
  }

  return patch;
}

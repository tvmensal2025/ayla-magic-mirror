// Main bot state machine — extracted verbatim from the giant switch in index.ts.
// All conversation steps live here. Receives a BotContext and returns
// { reply, updates }. The caller persists updates and sends reply.
//
// Behavior is identical to the previous inline version. Only structural change:
// the closure variables are now properties of `ctx`.

import {
  validateCustomerForPortal,
  isPlaceholderEmail,
  isValidEmailFormat,
  isSameContact,
} from "../../_shared/validators.ts";
import {
  fetchWithTimeout,
  fetchInsecure,
  withRetry,
  buscarCepPorEndereco,
  normalizePhone,
  TIMEOUT_VIA_CEP,
  logStructured,
} from "../../_shared/utils.ts";
import { getStepMediaOrder, makeKindComparator } from "../../_shared/step-media-order.ts";
import { canSendMediaOnce } from "../../_shared/media-dedupe.ts";
import {
  getReplyForStep,
  getNextMissingStep,
  validarCPFDigitos,
  RE_INTENT_CADASTRAR,
  RE_INTENT_HUMANO,
  RE_INTENT_RESET,
  TRUSTED_NAME_SOURCES,
  resetLeadIdentity,
} from "../../_shared/conversation-helpers.ts";
import { ocrContaEnergia, ocrDocumentoFrenteVerso } from "../../_shared/ocr.ts";
import { normalizeDocumentType, isCNH, friendlyLabel } from "../../_shared/document-type.ts";
import { detectDocumentType } from "../../_shared/detect-doc-type.ts";
import { uploadMediaToMinio, OCR_CONFIDENCE_THRESHOLD } from "../_helpers.ts";
import { jsonLog } from "../../_shared/audit.ts";
import { isTestMode } from "../../_shared/test-mode.ts";
import type { BotContext, BotResult } from "./types.ts";

// Trigrama similarity para anti-loop (0..1)
function trigramSim(a: string, b: string): number {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-zà-ú0-9 ]/gi, "").replace(/\s+/g, " ").trim();
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const trig = (s: string) => {
    const set = new Set<string>();
    const p = `  ${s}  `;
    for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
    return set;
  };
  const ta = trig(A), tb = trig(B);
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  return inter / Math.max(ta.size, tb.size);
}

// ── Sleep based on media duration (lets audio finish before sending video) ──
async function sleepForMedia(kind: string, durationSec?: number | null): Promise<void> {
  if (isTestMode()) return; // 🧪 modo teste: zero espera entre mídias
  if (kind === "audio") {
    const ms = Math.min(((durationSec && durationSec > 0) ? durationSec : 90) * 1000, 120_000);
    await new Promise((r) => setTimeout(r, ms));
    return;
  }
  if (kind === "video") {
    const ms = Math.min(((durationSec && durationSec > 0) ? durationSec : 30) * 1000, 90_000);
    await new Promise((r) => setTimeout(r, ms));
    return;
  }
  await new Promise((r) => setTimeout(r, 1500));
}

// ── Fetch URL → base64 (for OCR when proxy didn't deliver bytes) ──
async function fetchUrlToBase64(url: string, timeoutMs = 15_000): Promise<{ base64: string; mime: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const mime = r.headers.get("content-type") || "application/octet-stream";
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { base64: btoa(bin), mime };
  } catch (e) {
    console.warn("[fetchUrlToBase64] falhou:", (e as any)?.message);
    return null;
  }
}

// ── Auto-resolve CEP from address data (avoid asking user) ──
async function autoResolveCepIfNeeded(merged: any, updates: any): Promise<string> {
  let step = getNextMissingStep(merged);
  if (step === "ask_cep" && merged.address_city && merged.address_state && merged.address_street) {
    console.log("🔍 Auto-resolvendo CEP via ViaCEP antes de perguntar ao usuário...");
    try {
      const cepAuto = await buscarCepPorEndereco(merged.address_state, merged.address_city, merged.address_street);
      if (cepAuto && cepAuto.length === 8 && !/000$/.test(cepAuto)) {
        console.log(`✅ CEP auto-resolvido: ${cepAuto}`);
        merged.cep = cepAuto;
        updates.cep = cepAuto;
        step = getNextMissingStep(merged);
      } else {
        console.log("⚠️ ViaCEP não retornou CEP específico, perguntando ao usuário.");
      }
    } catch (e: any) {
      console.warn(`⚠️ Erro auto-resolve CEP: ${e?.message}`);
    }
  }
  return step;
}

// ── Quick HEAD check to confirm a media URL is reachable before sending ──
async function urlExists(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return r.ok;
  } catch {
    return false;
  }
}

const NON_NAME_RESPONSES = /^(oi|ola|olá|hey|opa|bom dia|boa tarde|boa noite|sim|nao|não|ok|tudo bem|pode|quero|cadastrar|humano|atendente|menu|reset|recomecar|recomeçar|nao sou eu|não sou eu|como funciona|me explica|o que é|que é isso|quanto custa|é caro|preço|valor|tem taxa|minha distribuidora|qual distribuidora|atende aqui|cidade)$/i;
const RE_GREETING_ONLY = /^(oi|ol[aá]|opa|bom dia|boa tarde|boa noite|hey)$/i;
// Reapresentação: "me chamo X", "meu nome é X", "sou (a|o) X", "aqui (é|eh) (a|o) X", "(eu )?sou X" — captura o primeiro nome.
const RE_SELF_INTRO = /(?:me\s+chamo|meu\s+nome\s+(?:é|eh|e)|aqui\s+(?:é|eh|e)\s+(?:o|a)|(?:eu\s+)?sou\s+(?:o|a))\s+([A-Za-zÀ-ÖØ-öø-ÿ]{2,30})/i;
// Lead recusa mandar foto da conta — aceita seguir sem.
const RE_REFUSE_BILL = /\b(n[aã]o\s+(?:tenho|quero|posso|vou)\s+(?:mandar|enviar|tirar|mostrar)|sem\s+(?:foto|conta|comprovante)|n[aã]o\s+(?:tenho|achei)\s+a\s+conta|conta\s+(?:n[aã]o|nao)\s+est[aá]\s+aqui|s[oó]\s+(?:o\s+)?valor)\b/i;

function isPositiveCheckinIntent(text: string): boolean {
  return /^(sim|s|ss+|joia|ok|okay|blz|beleza|perfeito|quero|pode|vamos|bora|seguir|claro|certo|tranquilo|entendi|deu|show|fechou)\b/i.test(text) || /[👍✅]/.test(text);
}

function isClubProgressIntent(text: string): boolean {
  return isPositiveCheckinIntent(text) || /^(pode seguir|sem duvida|nenhuma|nao tenho|não tenho|nao|não|tudo certo|partiu|segue)\b/i.test(text) || /(quero|vamos|bora).*(cadastr|seguir|finaliz)/i.test(text);
}

function normalizeLeadName(rawText: string | null | undefined): string | null {
  const raw = String(rawText || "").trim().replace(/[.!?,;:"']/g, "").replace(/\s+/g, " ");
  const looksLikeName =
    raw.length >= 2 &&
    raw.length <= 60 &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ' ]+$/.test(raw) &&
    raw.split(/\s+/).length <= 4 &&
    !NON_NAME_RESPONSES.test(raw);
  if (!looksLikeName) return null;
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function isBogusCapturedName(name: string | null | undefined): boolean {
  if (!name) return false;
  return NON_NAME_RESPONSES.test(String(name).trim());
}

function buildNotReadyReply(nomeRepresentante: string): string {
  return `Sem problema, vou respeitar seu tempo 😊\n\nSe quiser continuar depois, é só mandar *cadastrar* ou chamar ${nomeRepresentante}.`;
}

// ───────────────────────────────────────────────────────────────
// Anti-alucinação: nome OCR só sobrescreve nome confirmado se for muito similar
// ───────────────────────────────────────────────────────────────
const RG_HEADER_TERMS = /REP[ÚU]BLICA|FEDERATIVA|CARTEIRA|IDENTIDADE|MINIST[ÉE]RIO|NACIONAL|SECRETARIA|SEGURAN[ÇC]A|INSTITUTO|DETRAN|VALIDA EM TODO|REGISTRO GERAL/i;

function _normName(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}
function _levSim(a: string, b: string): number {
  a = _normName(a); b = _normName(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  const dp: number[] = Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}

/**
 * Fontes de nome consideradas "confiáveis" — uma vez setado, só pode ser
 * sobrescrito por confirmação explícita do usuário (editing_* / user_confirmed).
 */
const TRUSTED_NAME_SOURCES_LOCK = new Set(["user_confirmed", "ocr_conta", "ocr_doc"]);

/**
 * Verifica se dois nomes (conta de luz × RG) representam a mesma pessoa.
 * Match se similaridade ≥ 0.85 ou se primeiro+último nome coincidem.
 */
export function checkHolderMatch(billName: string | null | undefined, docName: string | null | undefined): { match: boolean; similarity: number; reason: string } {
  const a = _normName(String(billName || ""));
  const b = _normName(String(docName || ""));
  if (!a || !b) return { match: true, similarity: 1, reason: "missing_one_side" };
  const sim = _levSim(a, b);
  const partsA = a.split(/\s+/);
  const partsB = b.split(/\s+/);
  const firstLastMatch = partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1];
  const match = sim >= 0.85 || firstLastMatch;
  return { match, similarity: sim, reason: `sim=${sim.toFixed(2)} firstLast=${firstLastMatch}` };
}

/**
 * Decide o nome a usar dado OCR de doc.
 * Retorna null se OCR é alucinação OU se o nome atual veio de fonte confiável.
 * Fontes confiáveis (ocr_conta, ocr_doc, user_confirmed) só podem ser sobrescritas
 * via fluxo de edição explícito (editing_conta_nome / editing_doc_nome).
 */
function safeAssignName(currentName: string | null | undefined, currentSource: string | null | undefined, ocrName: string | null | undefined): string | null {
  if (!ocrName) return null;
  const cleaned = String(ocrName).trim().replace(/\s+/g, " ");
  if (cleaned.length < 5) return null;
  if (/\d/.test(cleaned)) return null;
  if (cleaned.split(/\s+/).length < 2) return null;
  if (RG_HEADER_TERMS.test(cleaned)) return null;
  // Fonte confiável já gravada → nunca sobrescreve sem confirmação do usuário
  if (currentName && String(currentName).trim().length >= 3 && TRUSTED_NAME_SOURCES_LOCK.has(String(currentSource || ""))) {
    return null;
  }
  // Nome atual existe e é muito diferente: mantém (não confiamos no OCR)
  if (currentName && String(currentName).trim().length >= 5) {
    if (_levSim(currentName, cleaned) < 0.7) return null;
  }
  return cleaned;
}

// Heurística: a mensagem tem o formato esperado pelo step?
function isExpectedShape(step: string, text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  const digits = t.replace(/\D/g, "");
  switch (step) {
    case "ask_cpf":
    case "editing_doc_cpf":
      return digits.length >= 11;
    case "ask_cep":
    case "editing_conta_cep":
      return digits.length >= 8;
    case "ask_birth_date":
    case "editing_doc_nascimento":
      return /\d{2}\/\d{2}\/\d{4}/.test(t);
    case "ask_phone":
    case "ask_phone_confirm":
      return digits.length >= 10;
    case "ask_bill_value":
    case "editing_conta_valor":
      return /^[r\$\s]*\d{2,6}([\.,]\d{1,2})?\s*$/i.test(t);
    case "ask_installation_number":
    case "editing_conta_instalacao":
      return digits.length >= 7;
    case "ask_name":
    case "editing_conta_nome":
    case "editing_doc_nome":
      return t.length >= 3 && t.split(/\s+/).length >= 1 && !/\?/.test(t);
    case "ask_rg":
    case "editing_doc_rg":
      return digits.length >= 4;
    case "editing_conta_endereco":
    case "editing_conta_distribuidora":
      return t.length >= 3 && !/\?/.test(t);
    case "ask_email":
      return /@/.test(t);
    case "ask_number":
      return digits.length >= 1 && t.length <= 10;
    case "ask_complement":
      return true; // qualquer coisa serve
    case "editing_conta_menu":
      return /^[0-6]$/.test(t) || /\b(nome|valor|rua|endere[çc]o|cep|distribuidora|instala[çc][ãa]o|cancelar|voltar)\b/i.test(t);
    case "editing_doc_menu":
      return /^[0-4]$/.test(t) || /\b(nome|cpf|rg|nascimento|data|cancelar|voltar)\b/i.test(t);
    case "confirmando_dados_conta":
    case "confirmando_dados_doc":
    case "confirmar_titularidade":
    case "ask_tipo_documento":
      return /^(sim|s|nao|n[aã]o|n|ok|editar|3|2|1|✅|❌|✏️|mesma|outro|corrigir|titular_)/i.test(t);
    default:
      return false;
  }
}

function getReentryPromptForStep(step: string, customer: any): string {
  const first = ((customer?.name || "") as string).split(/\s+/)[0];
  const v = first ? `${first}, ` : "";
  const prefix = "📋 *Voltando ao seu cadastro:* ";
  const map: Record<string, string> = {
    "ask_name": `${v}qual é o seu *nome completo*?`,
    "ask_cpf": `${v}qual é o seu *CPF*? (apenas números)`,
    "ask_rg": `${v}qual é o seu *RG*?`,
    "ask_birth_date": `${v}qual sua *data de nascimento*? (DD/MM/AAAA)`,
    "ask_phone": `${v}me confirma seu *telefone* (com DDD)?`,
    "ask_phone_confirm": `${v}me confirma seu *telefone* (com DDD)?`,
    "ask_email": `${v}qual é o seu *e-mail*?`,
    "ask_cep": `${v}qual o *CEP* da sua casa? (8 dígitos)`,
    "ask_number": `${v}qual o *número* da sua casa?`,
    "ask_complement": `${v}tem *complemento*? (apto, bloco) — ou diga "não".`,
    "ask_installation_number": `${v}qual o *número da instalação* da conta?`,
    "ask_bill_value": `${v}qual a *média* da sua conta de luz? (ex: 350,50)`,
    "ask_tipo_documento": `Me manda só uma foto da *frente do seu documento* (RG ou CNH — eu identifico sozinho).`,
    "aguardando_conta": `${v}me envia uma *foto ou PDF da conta de luz* pra eu seguir 📸`,
    "aguardando_doc_frente": `${v}me envia a *frente* do seu documento 🪪`,
    "aguardando_doc_verso": `${v}me envia o *verso* do seu documento 🪪`,
    "aguardando_doc_auto": `${v}me envia o seu *documento* (RG ou CNH) 🪪`,
    "editing_conta_menu": "Qual campo deseja editar?\n\n1️⃣ Nome\n2️⃣ Endereço\n3️⃣ CEP\n4️⃣ Distribuidora\n5️⃣ Nº Instalação\n6️⃣ Valor da conta\n0️⃣ Cancelar",
    "editing_doc_menu": "Qual campo deseja editar?\n\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ RG\n4️⃣ Data de Nascimento\n0️⃣ Cancelar",
    "editing_conta_nome": "Digite o *nome completo* correto:",
    "editing_conta_endereco": "Digite o *endereço completo* correto:",
    "editing_conta_cep": "Digite o *CEP* correto (8 dígitos):",
    "editing_conta_distribuidora": "Digite o nome da *distribuidora*:",
    "editing_conta_instalacao": "Digite o *número da instalação*:",
    "editing_conta_valor": "Digite o *valor da conta* (ex: 350,50):",
    "editing_doc_nome": "Digite o *nome completo* correto:",
    "editing_doc_cpf": "Digite o *CPF* correto (apenas números):",
    "editing_doc_rg": "Digite o *RG* correto:",
    "editing_doc_nascimento": "Digite a *data de nascimento* (DD/MM/AAAA):",
    "confirmando_dados_conta": "Os dados da conta estão corretos? Responda *SIM*, *NÃO* ou *EDITAR*.",
    "confirmando_dados_doc": "Os dados estão corretos? Responda *SIM*, *NÃO* ou *EDITAR*.",
    "confirmar_titularidade": "Antes de finalizar: é a *mesma pessoa* da conta de luz, *outro titular* (cônjuge/pai/mãe) ou quer *corrigir*?",
  };
  const txt = map[step];
  return txt ? prefix + txt : "";
}

// Steps onde QA semântico NUNCA deve disparar (cadastro/edição determinísticos)
const NO_QA_STEPS = new Set([
  "aguardando_conta", "processando_ocr_conta", "confirmando_dados_conta",
  "aguardando_doc_auto", "aguardando_doc_frente", "aguardando_doc_verso",
  "confirmando_dados_doc", "confirmar_titularidade", "ask_tipo_documento",
  "ask_name", "ask_cpf", "ask_rg", "ask_birth_date", "ask_phone", "ask_phone_confirm",
  "ask_email", "ask_cep", "ask_number", "ask_complement",
  "ask_installation_number", "ask_bill_value",
  "ask_doc_frente_manual", "ask_doc_verso_manual", "ask_finalizar",
  "finalizando", "portal_submitting", "aguardando_otp", "validando_otp",
  "aguardando_assinatura", "complete", "aguardando_humano",
  "editing_conta_menu", "editing_conta_nome", "editing_conta_endereco",
  "editing_conta_cep", "editing_conta_distribuidora", "editing_conta_instalacao", "editing_conta_valor",
  "editing_doc_menu", "editing_doc_nome", "editing_doc_cpf", "editing_doc_rg",
  "editing_doc_nascimento",
]);

// Helpers de tela de confirmação completa (usados após editar campo)
function _formatBRL(n: number): string {
  return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function buildConfirmacaoConta(merged: any): string {
  const v = Number(merged.electricity_bill_value || 0);
  const m = v * 0.20, a = m * 12;
  return "📋 *Dados da conta:*\n\n" +
    `👤 *Nome:* ${merged.name || "❌"}\n` +
    `📍 *Endereço:* ${merged.address_street || "❌"} ${merged.address_number || ""}\n` +
    `🏘️ *Bairro:* ${merged.address_neighborhood || "❌"}\n` +
    `🏙️ *Cidade:* ${merged.address_city || "❌"} - ${merged.address_state || ""}\n` +
    `📮 *CEP:* ${merged.cep || "❌"}\n` +
    `⚡ *Distribuidora:* ${merged.distribuidora || "❌"}\n` +
    `🔢 *Nº Instalação:* ${merged.numero_instalacao || "❌"}\n` +
    `💰 *Valor:* R$ ${_formatBRL(v)}\n` +
    `💚 *Economia estimada:* até R$ ${_formatBRL(m)}/mês • até R$ ${_formatBRL(a)}/ano (até 20%)\n\n` +
    "Está tudo correto?";
}
function buildConfirmacaoDoc(merged: any): string {
  return `📋 *Confirme seus dados pessoais:*\n\n` +
    `👤 Nome: *${merged.name || "—"}*\n` +
    `🆔 CPF: *${merged.cpf || "—"}*\n` +
    `🪪 RG: *${merged.rg || "—"}*\n` +
    `🎂 Nascimento: *${merged.data_nascimento || "—"}*\n\n` +
    "Está tudo correto?";
}

export async function runBotFlow(ctx: BotContext): Promise<BotResult> {
  const {
    supabase,
    sender: { sendText, sendButtons, sendMedia },
    customer,
    consultorId,
    nomeRepresentante,
    remoteJid,
    phone,
    messageText,
    buttonId,
    isFile,
    isButton,
    hasImage,
    hasDocument,
    imageMessage,
    documentMessage,
    message,
    messageId,
    fileUrl,
    fileBase64,
    geminiApiKey,
  } = ctx;

  // ═══════════════════════════════════════════════════════════════════
  // 🔁 AUTO-RESUME: se o bot foi pausado por "lead_nao_pronto" / "lead_quer_pensar"
  // e o lead voltou a falar, despausa automaticamente. Vendedor humano não fica mudo.
  // ═══════════════════════════════════════════════════════════════════
  if (
    (customer as any).bot_paused &&
    ["lead_nao_pronto", "lead_quer_pensar"].includes(String((customer as any).bot_paused_reason || ""))
  ) {
    console.log(`[auto-resume] Despausando bot — lead voltou a falar (motivo: ${(customer as any).bot_paused_reason})`);
    try {
      await supabase
        .from("customers")
        .update({ bot_paused: false, bot_paused_reason: null, bot_paused_at: null })
        .eq("id", customer.id);
    } catch (e) {
      console.warn("[auto-resume] update falhou:", (e as any)?.message);
    }
    (customer as any).bot_paused = false;
    (customer as any).bot_paused_reason = null;
    (customer as any).bot_paused_at = null;
    if ((customer as any).conversation_step === "aguardando_humano") {
      (customer as any).conversation_step = "qualificacao";
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🪪 NOME — sobrescreve se o lead se reapresentou ("me chamo X", "sou a X", etc.)
  // Resolve o bug do "Olá, Pedro" quando o lead na verdade é Larissa.
  // ═══════════════════════════════════════════════════════════════════
  if (messageText && !isFile && !isButton) {
    const intro = String(messageText).match(RE_SELF_INTRO);
    if (intro && intro[1]) {
      const candidate = normalizeLeadName(intro[1]);
      if (candidate) {
        const currentFirst = String((customer as any).name || "").trim().split(/\s+/)[0]?.toLowerCase();
        if (currentFirst !== candidate.toLowerCase()) {
          console.log(`[name-overwrite] "${(customer as any).name || "—"}" → "${candidate}" (auto-introdução)`);
          try {
            await supabase
              .from("customers")
              .update({ name: candidate, name_source: "self_introduced" })
              .eq("id", customer.id);
          } catch (e) {
            console.warn("[name-overwrite] update falhou:", (e as any)?.message);
          }
          (customer as any).name = candidate;
          (customer as any).name_source = "self_introduced";
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════════
  // HELPER: Envia opções como TEXTO (botões não funcionam na Evolution API atual)
  // Formato: mensagem + opções numeradas
  // ═══════════════════════════════════════════════════════════════════
  async function sendOptions(jid: string, msg: string, options: { id: string; title: string }[]): Promise<boolean> {
    // Tenta enviar como botões reais (funciona no Whapi, fallback texto no Evolution)
    return sendButtons(jid, msg, options);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🎯 Dispatcher genérico: envia o que está configurado em /admin/fluxos
  // para um step específico (Flow Builder).
  //   1) bot_flow_steps (flow_id, step_key) → message_text, slot_key, media_order
  //   2) ai_media_library (consultant_id, slot_key) → mídias reais (kind/url)
  //   3) Monta lista [texto + mídias] e ordena pela ordem configurada
  //      (media_order do step → flow_step_media_order do consultor →
  //      fallback global text → audio → video → image → document).
  //   4) Envia respeitando dedup por cliente e pausa proporcional entre mídias.
  // Texto suporta variáveis: {nome}, {nome_completo}, {representante},
  // {valor}, {economia_mensal}, {economia_anual}. Se não houver nada
  // configurado, NÃO inventa texto — apenas retorna false.
  // ═══════════════════════════════════════════════════════════════════
  async function dispatchStepFromFlow(stepKey: string, extraVars: Record<string, string> = {}): Promise<boolean> {
    if (!customer?.consultant_id) return false;
    try {
      const { data: flow } = await supabase
        .from("bot_flows")
        .select("id")
        .eq("consultant_id", customer.consultant_id)
        .eq("is_active", true)
        .maybeSingle();
      if (!flow?.id) return false;

      const { data: stepRow } = await supabase
        .from("bot_flow_steps")
        .select("step_key, slot_key, message_text, media_order")
        .eq("flow_id", (flow as any).id)
        .eq("step_key", stepKey)
        .maybeSingle();
      if (!stepRow) {
        console.log(`[dispatch:${stepKey}] step não configurado no Flow Builder — nada para enviar`);
        return false;
      }

      const slotKey = (stepRow as any).slot_key || stepKey;
      const { data: mediaRows } = await supabase
        .from("ai_media_library")
        .select("id, kind, url, slot_key, send_order, duration_sec, delay_before_ms")
        .eq("consultant_id", customer.consultant_id)
        .eq("slot_key", slotKey)
        .eq("active", true)
        .eq("is_draft", false)
        .order("send_order", { ascending: true });
      const medias = ((mediaRows as any[]) || []).filter((m) => !!m?.url);

      const firstName = String((customer as any).name || "").trim().split(/\s+/)[0] || "";
      const vars: Record<string, string> = {
        "{nome}": firstName,
        "{{nome}}": firstName,
        "{nome_completo}": String((customer as any).name || ""),
        "{{nome_completo}}": String((customer as any).name || ""),
        "{representante}": nomeRepresentante || "",
        "{{representante}}": nomeRepresentante || "",
        ...extraVars,
      };
      const applyVars = (s: string) =>
        Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);

      type Item = { kind: string; text?: string; media?: any };
      const items: Item[] = medias.map((m) => ({
        kind: String(m.kind || "document").toLowerCase(),
        media: m,
      }));
      const baseText = (stepRow as any).message_text
        ? applyVars(String((stepRow as any).message_text))
        : "";
      if (baseText.trim()) items.push({ kind: "text", text: baseText });

      // Precedência: UI (consultants.flow_step_media_order[slotKey]) → bot_flow_steps.media_order → default.
      // A UI do /admin/fluxos grava em consultants.flow_step_media_order, então ela vence
      // o default semeado em bot_flow_steps.media_order.
      const uiOrder = await getStepMediaOrder(supabase, customer.consultant_id, slotKey);
      const stepOrder = Array.isArray((stepRow as any).media_order) && (stepRow as any).media_order.length > 0
        ? (stepRow as any).media_order.map((k: any) => String(k).toLowerCase())
        : null;
      const configuredOrder = uiOrder || stepOrder || ["audio", "image", "video", "text", "document"];
      items.sort(makeKindComparator((it: Item) => it.kind, configuredOrder));

      let sent = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const isLast = i === items.length - 1;

        if (it.kind === "text" && it.text) {
          try {
            await sendText(remoteJid, it.text);
            await supabase.from("conversations").insert({
              customer_id: customer.id,
              message_direction: "outbound",
              message_text: it.text,
              message_type: "text",
              conversation_step: stepKey,
            });
            sent = true;
            if (!isLast) await new Promise((r) => setTimeout(r, 800));
          } catch (e) {
            console.warn(`[dispatch:${stepKey}] envio de texto falhou:`, (e as any)?.message);
          }
          continue;
        }

        const m = it.media;
        if (!m?.url) continue;
        const kind = ["audio", "video", "image"].includes(it.kind) ? it.kind : "document";

        const canSend = await canSendMediaOnce(supabase, {
          consultantId: customer.consultant_id,
          customerId: customer.id,
          mediaId: m.id,
          slotKey: m.slot_key || slotKey,
          kind,
        });
        if (!canSend) {
          console.log(`[dispatch:${stepKey}] ⏭️ ${kind} já enviado anteriormente — pulando`);
          continue;
        }

        const delayMs = Number(m.delay_before_ms || 0);
        if (delayMs > 0) await new Promise((r) => setTimeout(r, Math.min(delayMs, 10_000)));

        try {
          const ok = await sendMedia(remoteJid, m.url, "", kind);
          if (ok !== false) {
            sent = true;
            await supabase.from("conversations").insert({
              customer_id: customer.id,
              message_direction: "outbound",
              message_text: `[${kind}:${m.slot_key || slotKey}]`,
              message_type: kind,
              conversation_step: stepKey,
            });
            if (!isLast) await sleepForMedia(kind, Number(m.duration_sec || 0) || null);
          }
        } catch (e) {
          console.warn(`[dispatch:${stepKey}] envio de ${kind} falhou:`, (e as any)?.message);
        }
      }
      return sent;
    } catch (e) {
      console.warn(`[dispatch:${stepKey}] erro geral:`, (e as any)?.message);
      return false;
    }
  }

  // CTA por etapa do funil — sempre puxa o lead pro próximo passo após responder.
  function buildStepNudge(currentStep: string, leadName: string | null): string {
    const first = (leadName || "").split(/\s+/)[0] || "";
    const v = first ? `${first}, ` : "";
    switch (currentStep) {
      case "welcome":
      case "menu_inicial":
      case "qualificacao":
        return `\n\n${v}me conta: quanto vem em média a sua conta de luz? Assim eu já te calculo a economia. 💡`;
      case "aguardando_conta":
        return `\n\n${v}pra eu confirmar tudo certinho, me manda agora a *foto* (ou PDF) da sua conta de luz. 📸`;
      case "coleta_doc":
      case "ask_email":
      case "ask_cep":
        return `\n\nBora finalizar seu cadastro? Continua respondendo aqui que eu te guio. ✅`;
      default:
        return "";
    }
  }

  async function trySendConfiguredQa(opts?: { force?: boolean; keepStep?: boolean }): Promise<BotResult | null> {
    if (!messageText || isFile || isButton || !customer.consultant_id) return null;
    // E: bypass em passos de cadastro/edição (a não ser que force=true via off-topic intercept)
    if (!opts?.force && NO_QA_STEPS.has(step)) return null;
    const normalizedText = messageText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (normalizedText.length < 2) return null;
    if (!opts?.force && step === "checkin_pos_video" && isPositiveCheckinIntent(normalizedText)) return null;
    if (!opts?.force && step === "duvidas_pos_club" && isClubProgressIntent(normalizedText)) return null;
    // 🚧 Em qualificacao, se a msg contém um valor numérico (conta de luz),
    // NÃO deixa QA semântica capturar — o handler determinístico (linha ~961)
    // precisa extrair o valor e avançar pra aguardando_conta.
    if (!opts?.force && step === "qualificacao" && /\d{2,5}/.test(normalizedText)) return null;

    const { data: activeFlow } = await supabase
      .from("bot_flows")
      .select("id")
      .eq("consultant_id", customer.consultant_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!activeFlow) return null;

    const { data: qaRows } = await supabase
      .from("bot_flow_qa")
      .select("id, text_response, is_closing")
      .eq("flow_id", (activeFlow as any).id)
      .eq("is_opening", false);
    const qaIds = ((qaRows as any[]) || []).map((q) => q.id);
    if (!qaIds.length) return null;

    const { data: triggers } = await supabase
      .from("bot_flow_qa_triggers")
      .select("qa_id, phrase")
      .in("qa_id", qaIds);
    const triggerList = ((triggers as any[]) || []);

    // 1) Match rápido por substring/normalização
    let matchedQaId: string | null = null;
    const directHit = triggerList.find((t) => {
      const phrase = String(t.phrase || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (!phrase) return false;
      if (normalizedText === phrase || normalizedText.includes(phrase)) return true;
      // similaridade trigrama alta (typos curtos)
      return trigramSim(normalizedText, phrase) >= 0.72;
    });
    if (directHit) matchedQaId = directHit.qa_id;

    // 2) Fallback semântico via IA (só se temos triggers cadastradas e nenhuma bateu)
    if (!matchedQaId && triggerList.length > 0 && geminiApiKey) {
      try {
        // Agrupa triggers por qa_id pra dar contexto melhor pro LLM
        const byQa = new Map<string, string[]>();
        for (const t of triggerList) {
          const arr = byQa.get(t.qa_id) || [];
          arr.push(String(t.phrase || ""));
          byQa.set(t.qa_id, arr);
        }
        const optionsList = Array.from(byQa.entries()).map(([id, phrases], i) =>
          `${i + 1}. id=${id} | exemplos: ${phrases.slice(0, 6).join(" / ")}`
        ).join("\n");

        const prompt =
          `Você é um classificador de intenção em PT-BR para um bot de vendas de energia (iGreen).\n` +
          `Dado a MENSAGEM do lead, escolha a OPÇÃO cuja intenção semanticamente melhor responde.\n` +
          `Se NENHUMA opção responder claramente a mensagem, devolva qa_id="" e confidence=0.\n\n` +
          `MENSAGEM: """${messageText.slice(0, 400)}"""\n\nOPÇÕES:\n${optionsList}\n\n` +
          `Responda APENAS JSON: {"qa_id":"<id ou vazio>","confidence":0..1}`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "object",
                  properties: {
                    qa_id: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: ["qa_id", "confidence"],
                },
                thinkingConfig: { thinkingBudget: 0 },
              },
            }),
          },
        );
        if (res.ok) {
          const data = await res.json();
          const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
          const parsed = JSON.parse(txt);
          const candidateId = String(parsed?.qa_id || "").trim();
          const conf = Number(parsed?.confidence || 0);
          if (candidateId && conf >= 0.6 && qaIds.includes(candidateId)) {
            matchedQaId = candidateId;
            console.log(`[qa-semantic] match qa=${candidateId} conf=${conf} msg="${messageText.slice(0, 60)}"`);
          }
        }
      } catch (e) {
        console.warn("[qa-semantic] falhou:", (e as any)?.message);
      }
    }

    if (!matchedQaId) return null;
    const qa = ((qaRows as any[]) || []).find((q) => q.id === matchedQaId);
    if (!qa) return null;

    const { data: mediaRows } = await supabase
      .from("bot_flow_qa_media")
      .select("media_kind, slot_key, media_id, position")
      .eq("qa_id", qa.id)
      .order("position");
    let sentSomething = false;

    // F: texto entra como item ordenável junto com mídias
    const baseText = qa.text_response
      ? String(qa.text_response).replaceAll("{nome}", customer.name || "").replaceAll("{representante}", nomeRepresentante || "")
      : "";
    const nudgeStep = qa.is_closing ? "aguardando_conta" : (step || "qualificacao");
    const nudge = qa.is_closing ? "" : buildStepNudge(nudgeStep, customer.name || null);
    const responseText = (baseText + nudge).trim();

    type QaItem = { kind: string; mediaRef?: any; text?: string };
    const items: QaItem[] = ((mediaRows as any[]) || []).map((m) => ({
      kind: String(m.media_kind || "document").toLowerCase(),
      mediaRef: m,
    }));
    if (responseText) items.push({ kind: "text", text: responseText });

    const _qaOrder = (await getStepMediaOrder(supabase, customer.consultant_id, step)) || ["text", "audio", "image", "video", "document"];
    items.sort(makeKindComparator((it: QaItem) => it.kind, _qaOrder));

    for (let mi = 0; mi < items.length; mi++) {
      const it = items[mi];
      const isLast = mi === items.length - 1;

      if (it.kind === "text" && it.text) {
        await sendText(remoteJid, it.text);
        await supabase.from("conversations").insert({
          customer_id: customer.id, message_direction: "outbound",
          message_text: it.text, message_type: "text", conversation_step: step,
        });
        sentSomething = true;
        continue;
      }

      const m = it.mediaRef;
      if (!m) continue;
      let url: string | null = null;
      let resolvedMediaId: string | null = m.media_id || null;
      let kind = it.kind === "audio" ? "audio" : it.kind === "video" ? "video" : it.kind === "image" ? "image" : "document";
      let durationSec: number | null = null;
      if (m.media_id) {
        const { data: mediaRow } = await supabase.from("ai_media_library").select("url, kind, duration_sec").eq("id", m.media_id).maybeSingle();
        if (mediaRow?.url) {
          url = mediaRow.url;
          if (mediaRow.kind) kind = mediaRow.kind;
          if ((mediaRow as any).duration_sec) durationSec = Number((mediaRow as any).duration_sec);
        }
      }
      if (!url && m.slot_key) {
        const { data: personal } = await supabase
          .from("ai_media_library")
          .select("id, url, duration_sec")
          .eq("consultant_id", customer.consultant_id)
          .eq("slot_key", m.slot_key)
          .eq("active", true).eq("is_draft", false)
          .order("send_order", { ascending: true })
          .limit(1).maybeSingle();
        if (personal?.url) { url = personal.url; resolvedMediaId = (personal as any).id || resolvedMediaId; durationSec = Number((personal as any).duration_sec || 0) || null; }
        else {
          const { data: pub } = await supabase
            .from("ai_media_library")
            .select("id, url, duration_sec")
            .eq("is_public", true)
            .eq("slot_key", m.slot_key)
            .eq("active", true)
            .order("send_order", { ascending: true })
            .limit(1).maybeSingle();
          if (pub?.url) { url = pub.url; resolvedMediaId = (pub as any).id || resolvedMediaId; durationSec = Number((pub as any).duration_sec || 0) || null; }
        }
      }
      if (!url) continue;
      // 🚫 Regra: nunca repetir áudio/vídeo para o mesmo cliente
      const canSend = await canSendMediaOnce(supabase, {
        consultantId: customer.consultant_id, customerId: customer.id,
        mediaId: resolvedMediaId, slotKey: m.slot_key, kind,
      });
      if (!canSend) continue;
      await sendMedia(remoteJid, url, "", kind);
      sentSomething = true;
      await supabase.from("conversations").insert({
        customer_id: customer.id, message_direction: "outbound",
        message_text: `[flow-qa:${qa.id}:${kind}]`, message_type: kind, conversation_step: step,
      });
      if (!isLast) await sleepForMedia(kind, durationSec);
    }

    // Se mídia foi enviada sem texto, manda um nudge curto (mantém comportamento)
    if (sentSomething && !responseText && !qa.is_closing) {
      const nudgeOnly = buildStepNudge(step || "qualificacao", customer.name || null).trim();
      if (nudgeOnly) {
        await sendText(remoteJid, nudgeOnly);
        await supabase.from("conversations").insert({
          customer_id: customer.id, message_direction: "outbound",
          message_text: nudgeOnly, message_type: "text", conversation_step: step,
        });
      }
    }

    if (!sentSomething) return null;
    // G: keepStep=true (off-topic intercept) → não muda conversation_step
    if (opts?.keepStep) {
      return { reply: "", updates: { __inline_sent: true } as any };
    }
    return { reply: "", updates: { conversation_step: qa.is_closing ? "aguardando_conta" : (step || "qualificacao"), __inline_sent: true } as any };
  }



  let step = customer.conversation_step || "welcome";
  let reply = "";
  const updates: Record<string, any> = {};

  // ═══════════════════════════════════════════════════════════════════
  // 🎙️  OPENING DO BOT_FLOW — envia o áudio de abertura (slot) configurado
  // pelo consultor no Flow Builder ANTES de qualquer texto/IA.
  // Dispara apenas no PRIMEIRO contato (zero outbound prévio para este lead).
  // ═══════════════════════════════════════════════════════════════════
  try {
    const currentStep = customer.conversation_step;
    const stepIsInitial = !currentStep || currentStep === "welcome";
    if (!isFile && !isButton && customer.consultant_id && !customer.bot_paused && stepIsInitial) {
      // 🛑 Se o consultor tem Fluxo da Camila ativo, NÃO usar abertura legada
      // (bot_flow_qa.is_opening). O motor dinâmico (runConversationalFlow) é
      // a única fonte de verdade. Esse caminho só serve para consultores que
      // ainda não migraram para o Flow Builder.
      const { data: hasDynamicFlow } = await supabase
        .from("bot_flows")
        .select("id")
        .eq("consultant_id", customer.consultant_id)
        .eq("is_active", true)
        .maybeSingle();
      if (hasDynamicFlow?.id) {
        console.log(`[opening-flow] pulado — consultor tem Fluxo da Camila ativo (${(hasDynamicFlow as any).id})`);
        // segue o switch normal
      } else {
      const { count: outboundCount } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customer.id)
        .eq("message_direction", "outbound");
      const isFirstContact = (outboundCount || 0) === 0;

      if (isFirstContact) {
        const { data: activeFlow } = await supabase
          .from("bot_flows")
          .select("id")
          .eq("consultant_id", customer.consultant_id)
          .eq("is_active", true)
          .maybeSingle();

        if (activeFlow) {
          const { data: openingQa } = await supabase
            .from("bot_flow_qa")
            .select("id, text_response")
            .eq("flow_id", (activeFlow as any).id)
            .eq("is_opening", true)
            .maybeSingle();

          if (openingQa) {
            const { data: medias } = await supabase
              .from("bot_flow_qa_media")
              .select("media_kind, slot_key, media_id, position")
              .eq("qa_id", (openingQa as any).id)
              .order("position");

            const orderedMedia = (medias as any[]) || [];
            const _openOrder = await getStepMediaOrder(supabase, customer.consultant_id, step);
            if (_openOrder) orderedMedia.sort(makeKindComparator((m: any) => m.media_kind, _openOrder));
            let sentSomething = false;

            for (let oi = 0; oi < orderedMedia.length; oi++) {
              const m = orderedMedia[oi];
              let url: string | null = null;
              let resolvedMediaId: string | null = m.media_id || null;
              let kind = m.media_kind === "audio" ? "audio" : m.media_kind === "video" ? "video" : m.media_kind === "image" ? "image" : "document";
              let durationSec: number | null = null;

              // 1) Resolve por media_id direto
              if (m.media_id) {
                const { data: mediaRow } = await supabase
                  .from("ai_media_library")
                  .select("url, kind, duration_sec")
                  .eq("id", m.media_id)
                  .maybeSingle();
                if (mediaRow?.url) {
                  url = mediaRow.url;
                  if (mediaRow.kind) kind = mediaRow.kind;
                  if ((mediaRow as any).duration_sec) durationSec = Number((mediaRow as any).duration_sec);
                }
              }

              // 2) Resolve por slot_key (personal ativo → público)
              if (!url && m.slot_key) {
                const { data: personal } = await supabase
                  .from("ai_media_library")
                  .select("id, url, duration_sec")
                  .eq("consultant_id", customer.consultant_id)
                  .eq("slot_key", m.slot_key)
                  .eq("active", true)
                  .eq("is_draft", false)
                  .order("send_order", { ascending: true })
                  .limit(1)
                  .maybeSingle();
                if (personal?.url) {
                  url = personal.url;
                  resolvedMediaId = (personal as any).id || resolvedMediaId;
                  durationSec = Number((personal as any).duration_sec || 0) || null;
                } else {
                  const { data: pub } = await supabase
                    .from("ai_media_library")
                    .select("id, url, duration_sec")
                    .eq("is_public", true)
                    .eq("slot_key", m.slot_key)
                    .eq("active", true)
                    .order("send_order", { ascending: true })
                    .limit(1)
                    .maybeSingle();
                  if (pub?.url) {
                    url = pub.url;
                    resolvedMediaId = (pub as any).id || resolvedMediaId;
                    durationSec = Number((pub as any).duration_sec || 0) || null;
                  }
                }
              }

              if (!url) continue;

              // 🚫 Regra: nunca repetir áudio/vídeo para o mesmo cliente
              const canSend = await canSendMediaOnce(supabase, {
                consultantId: customer.consultant_id, customerId: customer.id,
                mediaId: resolvedMediaId, slotKey: m.slot_key, kind,
              });
              if (!canSend) continue;

              try {
                const ok = await sendMedia(remoteJid, url, "", kind);
                if (ok !== false) {
                  sentSomething = true;
                  await supabase.from("conversations").insert({
                    customer_id: customer.id,
                    message_direction: "outbound",
                    message_text: `[${kind}:${m.slot_key || "media"}]`,
                    message_type: kind,
                    conversation_step: step,
                  });
                  // Espera proporcional à duração da mídia (áudio de 2min → não joga vídeo em cima)
                  const isLast = oi === orderedMedia.length - 1;
                  if (!isLast) await sleepForMedia(kind, durationSec);
                }
              } catch (e) {
                console.warn("[bot-flow] opening media send failed:", (e as any)?.message);
              }
            }

            // Texto de abertura opcional, se configurado
            const openingText = (openingQa as any).text_response;
            if (openingText) {
              try {
                await sendText(remoteJid, String(openingText)
                  .replaceAll("{nome}", customer.name || "")
                  .replaceAll("{representante}", nomeRepresentante || ""));
                await supabase.from("conversations").insert({
                  customer_id: customer.id,
                  message_direction: "outbound",
                  message_text: openingText,
                  message_type: "text",
                  conversation_step: step,
                });
                sentSomething = true;
              } catch (e) {
                console.warn("[bot-flow] opening text send failed:", (e as any)?.message);
              }
            }

            if (sentSomething) {
              console.log(`🎙️ [opening-flow] Abertura (Passo 1) enviada para customer ${customer.id} — aguardando resposta conforme Fluxo da Camila`);
              // Removido o "Deu pra entender?" hardcoded: o Passo 1 já contém áudio + texto
              // configurados pelo usuário. Apenas avançamos o step e aguardamos a resposta do lead;
              // o state-machine de checkin_pos_video cuida das transições seguintes.
              return {
                reply: "",
                updates: { conversation_step: "checkin_pos_video", __inline_sent: true } as any,
              };
            }
          }
        }
      }
      } // fecha else hasDynamicFlow
    }
  } catch (e) {
    console.warn("[bot-flow] opening-flow check failed:", (e as any)?.message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🤖 SALES AI — delegação opcional para LLM com tool-calling.
  // Ativa quando: ai_agent_config.handoff_rules.use_sales_ai = true
  // E o step está em fase conversacional (antes da coleta de docs).
  // Steps de coleta (aguardando_conta em diante) seguem determinísticos.
  // ═══════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // 🛡️  INTENT OVERRIDE DETERMINÍSTICO — roda ANTES da IA.
  // Garante que palavras-chave críticas funcionem mesmo se o LLM falhar.
  // ═══════════════════════════════════════════════════════════════════
  if (messageText && !isFile && !isButton) {
    const txt = messageText.trim();

    // 1) "não sou eu" / "recomeçar" → limpa contexto poluído e reinicia.
    if (RE_INTENT_RESET.test(txt)) {
      console.log(`[intent-override] RESET detectado: "${txt.slice(0, 60)}"`);
      await resetLeadIdentity(supabase, customer.id);
      const msg =
        "Sem problema, vamos recomeçar do zero.\n\n" +
        `Oi! 👋 Aqui é o assistente digital de *${nomeRepresentante}*.\n\n` +
        "Já pensou em pagar menos na sua conta de luz todo mês? 💚\n" +
        "Posso te explicar rapidinho como funciona?";
      await sendOptions(remoteJid, msg, [
        { id: "entender_desconto", title: "💡 Quero saber mais" },
        { id: "cadastrar_agora", title: "📋 Já quero participar" },
        { id: "falar_humano", title: "🧑 Falar com humano" },
      ]);
      return { reply: "", updates: { conversation_step: "menu_inicial", __inline_sent: true } as any };
    }

    // 2) "cadastrar / quero participar / vamos lá" → pula direto pro pedido da conta,
    //    mas SOMENTE se ainda não temos a foto da conta.
    if (RE_INTENT_CADASTRAR.test(txt) && !customer.electricity_bill_photo_url) {
      console.log(`[intent-override] CADASTRAR detectado: "${txt.slice(0, 60)}"`);
      return {
        reply:
          "📋 Ótimo! Vamos iniciar seu cadastro.\n\n" +
          "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\n" +
          "Formatos aceitos: JPG, PNG ou PDF",
        updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento" },
      };
    }

    // 2.5) Recusa/adiamento explícito → IA cuida do tom acolhedor (sem pausar bot).
    //      Se quiser pausar, ela vai chamar pause_bot via tool. Por padrão deixamos o
    //      diálogo seguir natural — vendedor humano não desliga só porque o lead disse "depois".

    // 3) "humano / atendente" → handoff explícito.
    if (RE_INTENT_HUMANO.test(txt)) {
      console.log(`[intent-override] HUMANO detectado: "${txt.slice(0, 60)}"`);
      return {
        reply:
          `🧑 Sem problema! Um consultor da equipe *${nomeRepresentante}* vai te chamar em breve.\n\n` +
          "Se mudar de ideia e quiser começar agora, é só digitar *cadastrar*.",
        updates: {
          conversation_step: "aguardando_humano",
          bot_paused: true,
          bot_paused_reason: "lead_pediu_humano",
          bot_paused_at: new Date().toISOString(),
        },
      };
    }

    if (step !== "checkin_pos_video" && step !== "duvidas_pos_club") {
      const configuredQaResult = await trySendConfiguredQa();
      if (configuredQaResult) return configuredQaResult;
    }
  }

  if (
    step === "aguardando_conta" &&
    messageText &&
    !isFile &&
    !isButton &&
    !customer.electricity_bill_photo_url &&
    isBogusCapturedName((customer as any).name)
  ) {
    const recoveredName = normalizeLeadName(messageText);
    if (recoveredName) {
      return {
        reply: `${recoveredName.split(/\s+/)[0]}, qual a média da sua conta de luz?`,
        updates: { name: recoveredName, name_source: "self_introduced", conversation_step: "qualificacao" },
      };
    }
    return {
      reply: "Qual é o seu nome?",
      updates: { name: null, name_source: "unknown", conversation_step: "qualificacao" },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🪪 CAPTURA DETERMINÍSTICA DE NOME
  // O primeiro áudio de boas-vindas já pede o nome do lead. Se ainda
  // não temos `customer.name` e a resposta atual parece um nome (1-4
  // palavras alfabéticas), salvamos imediatamente para não perder.
  // ═══════════════════════════════════════════════════════════════════
  if (
    messageText &&
    !isFile &&
    !isButton &&
    !customer.name &&
    !customer.electricity_bill_photo_url &&
    // 🚧 Não capturar "nome" quando o lead está só confirmando que entendeu
    // ("joia quero economizar", "pode seguir", etc).
    step !== "checkin_pos_video" &&
    step !== "duvidas_pos_club" &&
    !isPositiveCheckinIntent(messageText.trim())
  ) {
    const formatted = normalizeLeadName(messageText);
    if (formatted) {
      updates.name = formatted;
      updates.name_source = "self_introduced";
      (customer as any).name = formatted;
      (customer as any).name_source = "self_introduced";
      console.log(`🪪 [name-capture] Nome capturado: "${formatted}"`);
    }
  }

  // A etapa de qualificação é determinística: primeiro captura nome/valor.
  // A IA só entra aqui para perguntas reais depois que já temos um nome confiável.
  if (
    step === "qualificacao" &&
    messageText &&
    !isFile &&
    !isButton
  ) {
    const txt = messageText.trim();
    const currentNameTrusted = !!(customer as any).name && !isBogusCapturedName((customer as any).name);
    const typedName = normalizeLeadName(txt);
    const valueMatch = String(txt || "").match(/(?:r\$\s*)?(\d{2,5}(?:[\.,]\d{1,2})?)/i);
    const typedBillValue = valueMatch ? Number(valueMatch[1].replace(".", "").replace(",", ".")) : 0;

    if (RE_GREETING_ONLY.test(txt)) {
      return {
        reply: currentNameTrusted ? "Oi! Qual a média da sua conta de luz?" : "Oi! Qual é o seu nome?",
        updates: { conversation_step: "qualificacao" },
      };
    }

    if (typedName) {
      return {
        reply: `${typedName.split(/\s+/)[0]}, qual a média da sua conta de luz?`,
        updates: { name: typedName, name_source: "self_introduced", conversation_step: "qualificacao" },
      };
    }

    if (Number.isFinite(typedBillValue) && typedBillValue > 0 && typedBillValue < 100) {
      return {
        reply: `Obrigada por me falar. Com conta em torno de R$ ${typedBillValue.toFixed(0)}, normalmente a economia fica pequena e pode não compensar agora. Vou deixar registrado e, se seu consumo subir, a gente retoma 💚`,
        updates: { electricity_bill_value: typedBillValue, status: "rejected", bot_paused: true, bot_paused_reason: "low_bill_value", conversation_step: "valor_baixo" },
      };
    }

    if (Number.isFinite(typedBillValue) && typedBillValue >= 100) {
      return {
        reply: "Com essa média, já dá para calcular sua economia. Me envie uma FOTO ou PDF da sua conta de energia para eu confirmar os dados.",
        updates: { electricity_bill_value: typedBillValue, sales_phase: "fechamento", conversation_step: "aguardando_conta" },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🤖 SALES AI — delegação opcional para LLM com tool-calling.
  // Ativa quando: ai_agent_config.handoff_rules.use_sales_ai = true
  // E o step está em fase conversacional (antes da coleta de docs).
  // Steps de coleta (aguardando_conta em diante) seguem determinísticos.
  // ═══════════════════════════════════════════════════════════════════
  const conversationalSteps = new Set(["welcome", "menu_inicial", "pos_video", "checkin_pos_video", "aguardando_humano", "qualificacao", "duvidas_pos_club"]);

  // 💰 Pré-captura do valor da conta em qualquer step conversacional.
  // Antes o "1600" do lead só era gravado dentro do case qualificacao —
  // se o step ainda fosse "welcome", a IA respondia com cálculo R$ 0.
  if (
    messageText &&
    !isFile &&
    !isButton &&
    !customer.electricity_bill_value &&
    !customer.electricity_bill_photo_url
  ) {
    const raw = messageText.trim();
    // Só captura se a msg parece um valor (curta e majoritariamente numérica)
    if (raw.length <= 20 && /^[r\$\s]*\d{2,5}([\.,]\d{1,2})?[\s,reais]*$/i.test(raw)) {
      const m = raw.match(/(\d{2,5}(?:[\.,]\d{1,2})?)/);
      const v = m ? Number(m[1].replace(".", "").replace(",", ".")) : 0;
      if (Number.isFinite(v) && v >= 30 && v <= 50000) {
        updates.electricity_bill_value = v;
        (customer as any).electricity_bill_value = v;
        console.log(`💰 [bill-precapture] valor=${v} capturado em step=${step}`);
      }
    }
  }

  // Steps de coleta também aceitam pergunta off-script (FAQ), mas só se a mensagem PARECE pergunta.
  const collectionSteps = new Set(["aguardando_conta", "coleta_doc", "ask_email", "ask_cep"]);
  const looksLikeQuestion = !!messageText && (
    /\?/.test(messageText) ||
    /^(como|quanto|quando|onde|quem|qual|posso|preciso|funciona|é|tem|vou|vai|porqu[eê]|por que|sera|será|sera que|me explica|me conta|d[uú]vida)/i.test(messageText.trim())
  );
  // Bypass: se já temos a conta com OCR + nome confiável, NÃO chamar a IA —
  // o switch determinístico vai cuidar de confirmar/avançar sem virar handoff loop.
  const billTrusted =
    !!customer.electricity_bill_photo_url &&
    !!customer.ocr_done &&
    TRUSTED_NAME_SOURCES.has(String(customer.name_source || ""));

  // 🎯 Atalho determinístico: intenção forte de cadastro em step conversacional
  // → pula a IA e empurra para coletar a conta de luz (próximo passo físico).
  // Resolve o caso "Jeferson disse 'Cadastro' e a IA mandou 2 vídeos sem texto".
  const STRONG_PURCHASE_INTENT = /^(cadastr|quero\s+(?:cadastr|fazer|come[çc]ar|entrar|me\s*cadastr)|bora|vamos|partiu|simbora|aceito|topo|t[oô]\s+dentro|pode\s+(?:fazer|cadastr)|fa[çc]a\s+(?:o\s*)?cadastr|come[çc]ar|fechado|fechou)\b/i;
  const conversationalForShortcut = new Set(["welcome", "menu_inicial", "pos_video", "checkin_pos_video", "qualificacao"]);
  if (
    !isFile && !customer.bot_paused && !billTrusted &&
    conversationalForShortcut.has(step) &&
    messageText && STRONG_PURCHASE_INTENT.test(messageText.trim())
  ) {
    console.log(`🎯 [intent-shortcut] cadastro detectado em step=${step} → forçando aguardando_conta`);
    step = "aguardando_conta";
    (customer as any).conversation_step = "aguardando_conta";
    updates.conversation_step = "aguardando_conta";
    const firstNm = ((customer as any).name || "").split(/\s+/)[0];
    const v = firstNm ? `${firstNm}, ` : "";
    const reply = `Show, ${v.trim().replace(/,$/, "")}! 📸 Pra eu já calcular sua economia exata e iniciar o cadastro, me envia uma *foto ou PDF da sua conta de luz* (qualquer página serve).`;
    return { reply, updates };
  }

  // ✅ Caminho determinístico para validação/conversão: respostas positivas no check-in
  // não podem cair na IA e repetir áudio/vídeo. Se vier valor junto, já avança direto.
  if (!isFile && !isButton && step === "checkin_pos_video" && messageText) {
    const txt = messageText.trim();
    const firstNm = ((customer as any).name || "").split(/\s+/)[0];
    const v = firstNm ? `${firstNm}, ` : "";
    const valueMatch = txt.match(/(?:r\$\s*)?(\d{2,5}(?:[\.,]\d{1,2})?)/i);
    const billValue = valueMatch ? Number(valueMatch[1].replace(".", "").replace(",", ".")) : 0;
    const positive = isPositiveCheckinIntent(txt);
    if (Number.isFinite(billValue) && billValue >= 100) {
      return {
        reply: `Boa! Com R$ ${billValue.toFixed(0)} já dá pra calcular sua economia. Me envia uma *foto* ou PDF da conta de luz pra eu confirmar os dados 📸`,
        updates: { electricity_bill_value: billValue, sales_phase: "fechamento", conversation_step: "aguardando_conta" },
      };
    }
    if (Number.isFinite(billValue) && billValue > 0 && billValue < 100) {
      return {
        reply: `Obrigada por me falar. Com conta em torno de R$ ${billValue.toFixed(0)}, normalmente a economia fica pequena e pode não compensar agora. Vou deixar registrado e, se seu consumo subir, a gente retoma 💚`,
        updates: { electricity_bill_value: billValue, status: "rejected", bot_paused: true, bot_paused_reason: "low_bill_value", conversation_step: "valor_baixo" },
      };
    }
    if (positive) {
      return {
        reply: `Boa! ${v}me conta uma coisa: quanto vem em média na sua conta de luz? Assim eu já te calculo quanto dá pra economizar 💡`,
        updates: { conversation_step: "qualificacao" },
      };
    }
    if (/\?|seguro|taxa|pagar|custa|funciona|entendi|d[uú]vida/i.test(txt)) {
      return {
        reply: `Sem problema! Funciona assim: você continua recebendo energia normalmente, sem obra e sem trocar instalação. O desconto vem na conta porque a iGreen aplica créditos de energia limpa.\n\n${v}pra eu calcular se vale a pena no seu caso, quanto vem em média na sua conta de luz?`,
        updates: { conversation_step: "qualificacao" },
      };
    }
  }

  // ✅ No pós-pitch, “pode seguir/joia/sem dúvida” precisa abrir documento imediatamente,
  // sem passar pela IA e sem loop de mídia.
  if (!isFile && !customer.bot_paused && step === "duvidas_pos_club" && messageText) {
    const txt = messageText.trim().toLowerCase();
    const segueAgora = isClubProgressIntent(txt);
    if (segueAgora) {
      const ctaMsg = `Show! Pra finalizar seu cadastro, me manda só uma foto da *frente do seu documento* 📄\n\nPode ser RG ou CNH — o que for mais fácil pra você. Eu reconheço automaticamente.`;
      await sendText(remoteJid, ctaMsg);
      await supabase.from("conversations").insert({
        customer_id: customer.id, message_direction: "outbound",
        message_text: ctaMsg, message_type: "text",
        conversation_step: "aguardando_doc_auto",
      });
      return { reply: "", updates: { conversation_step: "aguardando_doc_auto", __inline_sent: true } as any };
    }
    if (/\?|cancel|cancela|taxa|fidelidade|seguro|pagar|custa|club|clube|funciona/i.test(txt)) {
      return {
        reply: "Pode ficar tranquilo: não tem obra, não muda instalação e você pode pedir suporte se tiver qualquer dúvida. O Conexão Club é um benefício extra de descontos/cashback em parceiros; o principal aqui é reduzir sua conta de luz.\n\nSe estiver tudo certo, me responde *pode seguir* que eu peço seu RG ou CNH pra finalizar.",
        updates: { conversation_step: "duvidas_pos_club" },
      };
    }
  }

  if (
    !isFile &&
    !customer.bot_paused &&
    !billTrusted &&
    (conversationalSteps.has(step) || (collectionSteps.has(step) && looksLikeQuestion)) &&
    messageText &&
    messageText.trim().length > 0
  ) {
    try {
      const { data: cfgPrivate } = customer.consultant_id
        ? await supabase
          .from("ai_agent_config")
          .select("handoff_rules, enabled")
          .eq("consultant_id", customer.consultant_id)
          .maybeSingle()
        : { data: null };
      const { data: cfgGlobal } = !cfgPrivate
        ? await supabase
          .from("ai_agent_config")
          .select("handoff_rules, enabled")
          .is("consultant_id", null)
          .maybeSingle()
        : { data: null };
      const cfg = cfgPrivate || cfgGlobal;

      const useSalesAi = cfg?.enabled !== false && cfg?.handoff_rules?.use_sales_ai === true;
      if (useSalesAi) {
        // 🔄 Persiste updates pendentes ANTES de chamar a IA, senão o
        // ai-sales-agent re-busca o customer do banco e lê valores stale
        // (ex: electricity_bill_value=null mesmo após preCapture do "1600").
        if (Object.keys(updates).length > 0) {
          try {
            await supabase.from("customers").update(updates).eq("id", customer.id);
            console.log(`💾 [pre-ai-flush] persistiu ${Object.keys(updates).length} campos antes da IA:`, Object.keys(updates));
          } catch (e) {
            console.error("[pre-ai-flush] falha ao persistir updates antes da IA:", e);
          }
        }
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const aiResp = await fetch(`${supabaseUrl}/functions/v1/ai-sales-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({ customer_id: customer.id, user_input: messageText }),
        });

        if (aiResp.ok) {
          const aiBody = await aiResp.json();
          const decision = aiBody?.decision;
          const media = aiBody?.media;
          const medias: Array<{ id: string; url: string; kind: string; label: string }> = Array.isArray(aiBody?.medias) && aiBody.medias.length > 0 ? aiBody.medias : (media ? [media] : []);
          const tool = decision?.tool;
          const args = decision?.args || {};

          if (tool === "send_text" || tool === "advance_to_closing") {
            reply = args.message || "";
            if (tool === "advance_to_closing") {
              updates.conversation_step = "aguardando_conta";
              if (!reply) {
                reply = "Perfeito! 📸 Para iniciar seu cadastro, me envie uma *foto ou PDF da sua conta de luz*.";
              }
            }
            // Anti-loop: se o reply for ≥80% similar à última msg outbound, troca por lembrete do step atual.
            try {
              const { data: lastOut } = await supabase
                .from("conversations")
                .select("message_text")
                .eq("customer_id", customer.id)
                .eq("message_direction", "outbound")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (lastOut?.message_text && reply && trigramSim(reply, lastOut.message_text) >= 0.8) {
                console.warn("[anti-loop] reply parecido com última outbound — trocando por lembrete do step");
                if (collectionSteps.has(step)) {
                  reply = step === "aguardando_conta"
                    ? "Para seguir, me envie uma foto ou PDF da sua conta de luz, por favor."
                    : "Vamos continuar de onde paramos.";
                } else {
                  reply = "";
                }
              }
            } catch (_) { /* best-effort */ }
            // Lembrete do step de coleta após responder dúvida off-script
            if (reply && collectionSteps.has(step) && !updates.conversation_step) {
              if (step === "aguardando_conta") reply += "\n\nVoltando: me manda a foto ou PDF da sua conta de luz pra eu seguir 📸";
              else if (step === "coleta_doc") reply += "\n\nVoltando: me manda a frente do seu documento (CNH ou RG) pra eu seguir 🪪";
            }
            return { reply, updates };
          }
          if (tool === "request_handoff") {
            updates.conversation_step = "aguardando_humano";
            reply = `🧑 Vou chamar o ${nomeRepresentante} aqui pra te atender pessoalmente, ok?`;
            return { reply, updates };
          }
          if (tool === "schedule_followup") {
            // Mensagem leve agora; cron de follow-up faz o resto
            reply = "Beleza! Quando quiser continuar é só me chamar 👍";
            return { reply, updates };
          }
          if (tool === "send_media") {
            const ordered = [...medias].sort((a, b) => (a.kind === "audio" ? -1 : b.kind === "audio" ? 1 : 0));
            // Detecta vídeo do Conexão Club entre as mídias para forçar follow-up determinístico
            const isClubMedia = (m: any) =>
              m && m.kind === "video" && /club|conex[aã]o[_\s-]*club/i.test(`${m.label || ""} ${m.slot_key || ""} ${m.url || ""}`);
            const clubMedia = ordered.find(isClubMedia);
            for (let i = 0; i < ordered.length; i++) {
              const m = ordered[i];
              const k = ["audio", "video", "image"].includes(m.kind) ? m.kind : "document";
              const cap = i === 0 ? (args.caption || "") : "";
              // 🚫 Regra: nunca repetir áudio/vídeo para o mesmo cliente
              const canSend = await canSendMediaOnce(supabase, {
                consultantId: customer.consultant_id, customerId: customer.id,
                mediaId: (m as any).id || null, slotKey: (m as any).slot_key || null, kind: k,
              });
              if (!canSend) continue;
              try {
                await sendMedia(remoteJid, m.url, cap, k);
                if (i < ordered.length - 1 && !isTestMode()) await new Promise((r) => setTimeout(r, 1500));
              } catch (e) {
                console.warn("[bot-flow] sendMedia (AI) falhou:", (e as any)?.message);
              }
            }
            // 🎬 Após vídeo do Conexão Club: pergunta determinística "ficou alguma dúvida?"
            // e avança step pra duvidas_pos_club (regra de negócio do usuário).
            if (clubMedia) {
              try {
                await sleepForMedia("video", Number((clubMedia as any).duration_sec || 0) || null);
              } catch (_) { /* best-effort */ }
              const firstNm = ((customer as any).name || "").split(/\s+/)[0];
              const duvidaMsg = firstNm
                ? `${firstNm}, ficou alguma dúvida sobre o Conexão Club ou sobre como funciona? Pode mandar aqui que eu te explico 😊\n\nSe estiver tudo certo, é só me dizer *"pode seguir"* que a gente já avança pro cadastro.`
                : `Ficou alguma dúvida sobre o Conexão Club ou sobre como funciona? Pode mandar aqui que eu te explico 😊\n\nSe estiver tudo certo, é só me dizer *"pode seguir"* que a gente já avança pro cadastro.`;
              try {
                await sendText(remoteJid, duvidaMsg);
                await supabase.from("conversations").insert({
                  customer_id: customer.id, message_direction: "outbound",
                  message_text: duvidaMsg, message_type: "text",
                  conversation_step: "duvidas_pos_club",
                });
              } catch (e) { console.warn("[club-followup] envio falhou:", (e as any)?.message); }
              updates.conversation_step = "duvidas_pos_club";
              console.log("🎬 [club-followup] vídeo do Conexão Club enviado → step=duvidas_pos_club");
            }
            reply = "";
            (updates as any).__inline_sent = true;
            return { reply, updates };
          }
          if (tool === "mark_lost") {
            reply = "Tranquilo! Se mudar de ideia é só me chamar 💚";
            return { reply, updates };
          }
          if (tool === "update_lead_field") {
            reply = args.followup_message || "";
            return { reply, updates };
          }
          if (tool === "confirm_and_handoff") {
            reply = args.message || `Vou conectar você com ${nomeRepresentante} para finalizar.`;
            updates.conversation_step = "aguardando_humano";
            return { reply, updates };
          }
          if (tool === "ask_for_name") {
            reply = args.message || "Como posso te chamar?";
            return { reply, updates };
          }
        } else {
          console.warn("[bot-flow] ai-sales-agent falhou, caindo no fluxo determinístico", aiResp.status);
        }
      }
    } catch (e: any) {
      console.warn("[bot-flow] erro ao chamar ai-sales-agent:", e?.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CAPTURA INTELIGENTE: Se o cliente digitar um email válido em
  // QUALQUER step (ex: welcome, menu_inicial), salvar no banco
  // para não perder. Caso da Judite/Erica que digitaram email
  // antes do bot pedir.
  // ═══════════════════════════════════════════════════════════════════
  if (
    messageText &&
    !isFile &&
    !isButton &&
    step !== "ask_email" && // No ask_email o handler já cuida
    isValidEmailFormat(messageText.trim()) &&
    !isPlaceholderEmail(messageText.trim()) &&
    !customer.email // Só salvar se ainda não tem email
  ) {
    updates.email = messageText.trim().toLowerCase();
    console.log(`📧 [CAPTURA] Email "${updates.email}" salvo automaticamente (digitado no step "${step}")`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // G: INTERCEPÇÃO OFF-TOPIC durante coleta/edição.
  // Se o lead está em ask_*/editing_*/confirmando_*/aguardando_(conta|doc)
  // e digita uma pergunta que NÃO tem o formato esperado pelo step,
  // responde via QA configurada (force=true bypassa NO_QA_STEPS) SEM mudar o step,
  // e reenvia o prompt do passo atual ("Voltando ao seu cadastro: ...").
  // ═══════════════════════════════════════════════════════════════════
  if (messageText && !isFile && !isButton) {
    const ASK_OR_EDIT_RX = /^(ask_|editing_|confirmando_|aguardando_(?:conta|doc))/;
    if (ASK_OR_EDIT_RX.test(step)) {
      const t = messageText.trim();
      const expected = isExpectedShape(step, t);
      const looksLikeQuestion =
        /\?/.test(t) ||
        /^(como|quanto|quando|onde|quem|qual|posso|preciso|funciona|porqu[eê]|por que|me explica|me conta|d[uú]vida|e\s+(se|quando|caso))/i.test(t);
      // Mensagem longa sem formato esperado também é provavelmente off-topic
      const probablyOffTopic = !expected && (looksLikeQuestion || t.length > 30);
      if (probablyOffTopic) {
        console.log(`[off-topic] step=${step} msg="${t.slice(0, 60)}" → respondendo dúvida e reenviando prompt`);
        const qaResult = await trySendConfiguredQa({ force: true, keepStep: true });
        if (qaResult) {
          const reentry = getReentryPromptForStep(step, customer);
          if (reentry) {
            try {
              await sendText(remoteJid, reentry);
              await supabase.from("conversations").insert({
                customer_id: customer.id, message_direction: "outbound",
                message_text: reentry, message_type: "text", conversation_step: step,
              });
            } catch (e) { console.warn("[off-topic] reentry falhou:", (e as any)?.message); }
          }
          return { reply: "", updates: { ...updates, __inline_sent: true } as any };
        }
        // Sem QA configurada: ainda assim manda o reentry (não responde com "❌ inválido")
        const reentry = getReentryPromptForStep(step, customer);
        if (reentry) {
          await sendText(remoteJid, reentry);
          await supabase.from("conversations").insert({
            customer_id: customer.id, message_direction: "outbound",
            message_text: reentry, message_type: "text", conversation_step: step,
          });
          return { reply: "", updates: { ...updates, __inline_sent: true } as any };
        }
      }
    }
  }

  switch (step) {
    // ─── 1. BOAS-VINDAS ────────────────────
    case "welcome": {
      // Vendedor humano: saudação curta sem botões. O áudio de abertura (slot)
      // já tocou. A partir daqui a IA assume a conversa em "qualificacao".
      const first = ((customer as any).name || "").split(/\s+/)[0];
      const saud = first ? `Oi, ${first}! ` : "Oi! ";
      reply = `${saud}Tudo bem? Aqui é da equipe da *${nomeRepresentante}* 💚\n\nMe conta rapidinho: você paga em torno de quanto na sua conta de luz hoje?`;
      updates.conversation_step = "qualificacao";
      break;
    }

    case "qualificacao": {
      const capturedName = normalizeLeadName(messageText);
      if (capturedName) {
        updates.name = capturedName;
        updates.name_source = "self_introduced";
        (customer as any).name = capturedName;
        (customer as any).name_source = "self_introduced";
        reply = `${capturedName.split(/\s+/)[0]}, qual a média da sua conta de luz?`;
        updates.conversation_step = "qualificacao";
        break;
      }

      if (isBogusCapturedName((customer as any).name)) {
        updates.name = null;
        updates.name_source = "unknown";
        (customer as any).name = null;
        (customer as any).name_source = "unknown";
      }

      const valueMatch = String(messageText || "").match(/(?:r\$\s*)?(\d{2,5}(?:[\.,]\d{1,2})?)/i);
      if (valueMatch) {
        const billValue = Number(valueMatch[1].replace(".", "").replace(",", "."));
        if (Number.isFinite(billValue) && billValue > 0 && billValue < 100) {
          updates.electricity_bill_value = billValue;
          updates.status = "rejected";
          updates.bot_paused = true;
          updates.bot_paused_reason = "low_bill_value";
          reply = `Obrigada por me falar. Com conta em torno de R$ ${billValue.toFixed(0)}, normalmente a economia fica pequena e pode não compensar agora. Vou deixar registrado e, se seu consumo subir, a gente retoma 💚`;
          updates.conversation_step = "valor_baixo";
          break;
        }
        if (Number.isFinite(billValue) && billValue >= 100) {
          updates.electricity_bill_value = billValue;
          updates.sales_phase = "fechamento";
          reply = `Com essa média, já dá para calcular sua economia. Me envie uma FOTO ou PDF da sua conta de energia para eu confirmar os dados.`;
          updates.conversation_step = "aguardando_conta";
          break;
        }
      }

      reply = (customer as any).name && !isBogusCapturedName((customer as any).name)
        ? `Certo, ${(customer as any).name.split(/\s+/)[0]}. Qual a média da sua conta de luz?`
        : "Qual é o seu nome?";
      updates.conversation_step = "qualificacao";
      break;
    }

    // ─── 1b. CHECK-IN PÓS ÁUDIO/VÍDEO ────────────
    // Pergunta "deu pra entender?" depois do opening. Se afirmativo, vai pra qualificacao.
    // Se for dúvida/negativa, deixa a IA responder (mesma rota do qualificacao).
    case "checkin_pos_video": {
      const txt = String(messageText || "").trim().toLowerCase();
      const first = ((customer as any).name || "").split(/\s+/)[0];
      const v = first ? `${first}, ` : "";
      const RE_AFFIRM = /^(sim|ss+|s|deu|entendi|entendido|claro|ok|okay|beleza|blz|certo|positivo|isso|🆗|👌|👍|✅|com\s*certeza|perfeito|bacana|massa|legal|joia|tranquilo)\b/i;
      const RE_NEG = /^(n[aã]o|nn|n|nada|n[aã]o\s*entendi|n[aã]o\s*muito|mais\s*ou\s*menos|m[ãa]is\s*menos|confuso)\b/i;
      if (RE_AFFIRM.test(txt)) {
        reply = `Boa! ${v}me conta uma coisa: quanto vem em média na sua conta de luz? Assim eu já te calculo quanto dá pra economizar 💡`;
        updates.conversation_step = "qualificacao";
        break;
      }
      if (RE_NEG.test(txt) || /\?/.test(txt)) {
        // Tenta Q&A configurado primeiro
        const qaResult = await trySendConfiguredQa();
        if (qaResult) return qaResult;
        // Caso contrário, resposta padrão e empurra pra qualificação
        reply = `Sem problema! Em resumo: a iGreen reduz o valor da sua conta de luz aplicando descontos da energia limpa, sem trocar nada na sua casa 💚\n\nMe diz: quanto vem em média na sua conta hoje?`;
        updates.conversation_step = "qualificacao";
        break;
      }
      // Não deu pra classificar → trata como começo de qualificação
      const valueMatch = txt.match(/(?:r\$\s*)?(\d{2,5}(?:[\.,]\d{1,2})?)/i);
      if (valueMatch) {
        const billValue = Number(valueMatch[1].replace(".", "").replace(",", "."));
        if (Number.isFinite(billValue) && billValue >= 30) {
          updates.electricity_bill_value = billValue;
          updates.sales_phase = "fechamento";
          reply = `Show! Com R$ ${billValue.toFixed(0)} dá pra calcular sua economia. Me envia uma *foto* (ou PDF) da sua conta de luz pra eu confirmar os dados 📸`;
          updates.conversation_step = "aguardando_conta";
          break;
        }
      }
      reply = `${v}deu pra ouvir o áudio? Se quiser, me conta já o valor médio da sua conta de luz que eu adianto a economia pra você 💡`;
      updates.conversation_step = "qualificacao";
      break;
    }

    case "menu_inicial":
    case "pos_video": {
      // Legado: leads existentes presos no menu de botões. Migra direto pra IA conversacional.
      const resp = isButton ? buttonId : (messageText || "").toLowerCase().trim();
      if (resp === "cadastrar_agora" || resp?.includes("cadastr") || resp?.includes("participar")) {
        const first = ((customer as any).name || "").split(/\s+/)[0];
        const v = first ? `${first}, ` : "";
        reply = `Boa! ${v}pra eu travar a sua economia exata, me manda uma *foto* (ou PDF) da sua última conta de luz aqui no chat 📸`;
        updates.conversation_step = "aguardando_conta";
        updates.sales_phase = "fechamento";
      } else if (resp === "falar_humano" || resp?.includes("humano") || resp?.includes("atendente")) {
        reply = `Tranquilo! Já te encaminhei pra *${nomeRepresentante}*, ela te chama aqui mesmo, ok?`;
        updates.conversation_step = "aguardando_humano";
      } else {
        // Qualquer outra coisa → vira conversa livre, IA assume.
        const first = ((customer as any).name || "").split(/\s+/)[0];
        const v = first ? `${first}, ` : "";
        reply = `${v}me conta: quanto vem em média na sua conta de luz? Assim eu já te calculo quanto dá pra economizar 💡`;
        updates.conversation_step = "qualificacao";
      }
      break;
    }

    case "aguardando_humano": {
      const resp = messageText.toLowerCase().trim();
      if (resp?.includes("cadastr") || resp === "2") {
        reply = "📋 Vamos iniciar seu cadastro!\n\n📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\nFormatos aceitos: JPG, PNG ou PDF";
        updates.conversation_step = "aguardando_conta";
      } else {
        reply = `⏳ Sua solicitação já foi registrada! Um consultor da equipe *${nomeRepresentante}* entrará em contato em breve.\n\nSe quiser iniciar o cadastro agora, digite *cadastrar*.`;
      }
      break;
    }

    // ─── 2. AGUARDANDO CONTA ──────────────
    case "aguardando_conta": {
      if (!isFile) {
        const txt = String(messageText || "").trim();
        const first = ((customer as any).name || "").split(/\s+/)[0];
        const v = first ? `${first}, ` : "";

        // Lead recusa mandar a foto → aceita seguir só com o valor.
        if (txt && RE_REFUSE_BILL.test(txt)) {
          const billVal = Number((customer as any).electricity_bill_value || 0);
          if (billVal >= 30) {
            reply = `Tranquilo, ${first || "vamos"}! Já tenho o valor que você passou (R$ ${billVal.toFixed(0)}), seguimos sem a foto então 👍\n\nPra fechar o cadastro me manda só uma foto da *frente do seu documento* (RG ou CNH, tanto faz — eu reconheço sozinho).`;
            updates.conversation_step = "aguardando_doc_auto";
            break;
          }
          // Sem valor ainda → pede só o valor, sem cobrar foto.
          reply = `Sem problema! Então me passa só o valor médio que vem na sua conta de luz (uns R$?). Com isso eu já consigo te dar a economia 💡`;
          updates.conversation_step = "qualificacao";
          break;
        }

        // Captura valor digitado no meio do aguardando_conta (lead já mandando dado útil)
        const valueMatch = txt.match(/(?:r\$\s*)?(\d{2,5}(?:[\.,]\d{1,2})?)/i);
        if (valueMatch && !((customer as any).electricity_bill_value)) {
          const billValue = Number(valueMatch[1].replace(".", "").replace(",", "."));
          if (Number.isFinite(billValue) && billValue >= 30) {
            updates.electricity_bill_value = billValue;
            reply = `Boa, ${first || "anotado"}! Anotei R$ ${billValue.toFixed(0)} 💚\n\nSe puder mandar a *foto* (ou PDF) da sua conta também, eu trava o cálculo exato. Mas se preferir, dá pra seguir só com a média mesmo.`;
            break;
          }
        }

        reply = `${v}me manda uma *foto* (ou PDF) da sua conta de luz, por favor 📸\n\nSe estiver sem a conta agora, é só me dizer o valor médio que você paga que eu já te calculo a economia.`;
        break;
      }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        updates.electricity_bill_photo_url = `data:${mime};base64,${fileBase64}`;
        updates.bill_base64 = fileBase64;
        updates.bill_message_id = messageId || null;
        updates.media_storage = "inline";
        const custId = customer.id;
        uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "conta",
        }).then(async (minioUrl) => {
          if (minioUrl) {
            await supabase.from("customers").update({ electricity_bill_photo_url: minioUrl, media_storage: "minio" }).eq("id", custId);
            console.log(`📦✅ [BG] Conta uploaded MinIO: ${minioUrl.substring(0, 80)}`);
          }
        }).catch((e) => console.warn(`📦⚠️ [BG] MinIO conta falhou: ${e?.message}`));
      } else {
        updates.electricity_bill_photo_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
        updates.bill_message_id = messageId || null;
      }
      updates.conversation_step = "processando_ocr_conta";
      await sendText(remoteJid, "✅ Conta recebida! ⏳ Analisando seus dados...\n\nAguarde alguns instantes...");

      console.log("📥 Arquivo recebido:");
      console.log("  - isFile:", isFile);
      console.log("  - hasImage:", hasImage);
      console.log("  - hasDocument:", hasDocument);
      console.log("  - imageMessage:", !!imageMessage);
      console.log("  - documentMessage:", !!documentMessage);
      console.log("  - fileUrl:", fileUrl?.substring(0, 100));
      console.log("  - fileBase64 length:", fileBase64?.length || 0);
      console.log("  - mimetype:", imageMessage?.mimetype || documentMessage?.mimetype);

      if (fileBase64) {
        if (fileBase64.length < 100) {
          console.error("❌ Base64 muito pequeno:", fileBase64.length);
          updates.conversation_step = "aguardando_conta";
          reply = "⚠️ Erro ao processar imagem. Tente enviar uma foto mais nítida.";
          break;
        }
        try { atob(fileBase64.substring(0, 100)); } catch {
          console.error("❌ Base64 inválido");
          updates.conversation_step = "aguardando_conta";
          reply = "⚠️ Erro ao processar imagem. Tente enviar novamente.";
          break;
        }
      }

      const mediaMsg = documentMessage || imageMessage || {
        mimetype: imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg",
      };

      try {
        console.log("📡 Chamando OCR Gemini para conta:", fileUrl?.substring(0, 100));
        // Garante bytes: se não temos base64 mas temos URL HTTP, baixa on-demand
        let ocrBase64 = fileBase64 || undefined;
        if (!ocrBase64 && fileUrl && /^https?:\/\//i.test(fileUrl)) {
          const fetched = await fetchUrlToBase64(fileUrl);
          if (fetched?.base64) {
            ocrBase64 = fetched.base64;
            if (!mediaMsg.mimetype) (mediaMsg as any).mimetype = fetched.mime;
            console.log(`📥 OCR base64 baixado on-demand: ${ocrBase64.length} bytes`);
          }
        }
        // Timeout de 25s para o OCR (evita travar "Analisando...")
        const ocrData: any = await Promise.race([
          ocrContaEnergia(fileUrl, geminiApiKey, ocrBase64, mediaMsg),
          new Promise((_, rej) => setTimeout(() => rej(new Error("OCR_TIMEOUT_25s")), 25_000)),
        ]);
        console.log("📊 OCR Conta resultado:", JSON.stringify(ocrData).substring(0, 400));
        if (ocrData.sucesso && ocrData.dados) {
          const d = ocrData.dados;
          const confianca = typeof d.confianca === "number" ? d.confianca : 100;
          if (confianca < OCR_CONFIDENCE_THRESHOLD) {
            jsonLog("warn", "OCR conta abaixo do threshold", { customer_id: customer.id, confianca, threshold: OCR_CONFIDENCE_THRESHOLD });
            updates.conversation_step = "aguardando_conta";
            reply = `⚠️ Não consegui ler a conta com clareza suficiente (qualidade: ${confianca}%).\n\n📸 Por favor, envie uma *foto mais nítida e bem iluminada* da conta de energia.\n\nDicas:\n• Use boa iluminação\n• Evite reflexos\n• Foco nos dados principais\n• Tire em ambiente claro`;
            break;
          }
          // BLINDAGEM: OCR pode retornar sucesso=true com dados vazios.
          // Exigir ao menos 3 campos críticos preenchidos.
          const criticos = [d.nome, d.endereco, d.cep, d.cidade, d.distribuidora, d.numeroInstalacao, d.valorConta]
            .filter((v) => v && String(v).trim().length > 0);
          if (criticos.length < 3) {
            jsonLog("warn", "OCR conta com poucos campos válidos", { customer_id: customer.id, validos: criticos.length });
            const tries = (customer.ocr_conta_attempts || 0) + 1;
            updates.ocr_conta_attempts = tries;
            if (tries < 2) {
              updates.conversation_step = "aguardando_conta";
              reply = "⚠️ Recebi a conta mas não consegui extrair os dados principais.\n\n📸 Envie uma *foto mais nítida* mostrando claramente:\n• Seu nome\n• Endereço\n• Distribuidora\n• Valor da conta";
            } else {
              updates.conversation_step = "ask_name";
              reply = "⚠️ Tive dificuldade em ler sua conta. Vou perguntar os dados manualmente.\n\nQual é o seu *nome completo*?";
            }
            break;
          }
          // C: validação anti-alucinação no nome OCR da conta
          {
            const ocrName = (d.nome || "").trim();
            // Sempre grava o nome bruto da conta para auditoria/conferência
            if (ocrName) updates.bill_holder_name = ocrName;
            const safe = safeAssignName(customer.name, (customer as any).name_source, ocrName);
            if (safe) {
              updates.name = safe;
              updates.name_source = "ocr_conta";
            } else if (!customer.name && ocrName) {
              // Sem nome prévio: aceita o nome do OCR mas marca como não confirmado
              updates.name = ocrName;
              updates.name_source = "ocr_conta";
            }
          }
          updates.address_street = d.endereco || "";
          updates.address_number = d.numero || "";
          updates.address_neighborhood = d.bairro || "";
          updates.cep = d.cep || "";
          updates.address_city = d.cidade || "";
          updates.address_state = d.estado || "";
          updates.distribuidora = d.distribuidora || "";
          // Validação número instalação ≥7 dígitos
          {
            const inst = String(d.numeroInstalacao || "").replace(/\D/g, "");
            updates.numero_instalacao = inst.length >= 7 ? inst : "";
          }
          updates.ocr_confianca = confianca;
          const valorParsed = d.valorConta ? parseFloat(d.valorConta) : 0;
          updates.electricity_bill_value = (valorParsed >= 30) ? valorParsed : 0;
          // CEP: só aceita se tiver 8 dígitos
          if (updates.cep) {
            const cepClean = String(updates.cep).replace(/\D/g, "");
            updates.cep = cepClean.length === 8 ? cepClean : "";
          }
          if (!updates.cep && updates.address_city && updates.address_state && updates.address_street) {
            console.log("🔍 CEP não encontrado. Buscando via ViaCEP...");
            const cepBuscado = await buscarCepPorEndereco(updates.address_state, updates.address_city, updates.address_street);
            if (cepBuscado) {
              updates.cep = cepBuscado;
              console.log(`✅ CEP auto-preenchido: ${cepBuscado}`);
            }
          }

          // BLINDAGEM: nome e valor são obrigatórios. Se faltar, perguntar antes da confirmação.
          const finalName = updates.name || customer.name;
          if (!finalName || String(finalName).trim().length < 3) {
            updates.conversation_step = "editing_conta_nome";
            reply = "📋 Consegui ler quase tudo da sua conta! Só preciso confirmar uma coisa:\n\n👤 Qual é o seu *nome completo* (como aparece na conta)?";
            break;
          }
          if (!updates.electricity_bill_value || updates.electricity_bill_value < 30) {
            updates.conversation_step = "editing_conta_valor";
            reply = `📋 Já peguei seus dados, ${String(finalName).split(" ")[0]}! Só me confirma uma coisa:\n\n💰 Qual o *valor médio* da sua conta de luz? (ex: 350,00)`;
            break;
          }

          updates.conversation_step = "confirmando_dados_conta";
          const _merged = { ...customer, ...updates };
          reply = buildConfirmacaoConta(_merged);
          await sendOptions(remoteJid, reply, [
            { id: "sim_conta", title: "✅ SIM" },
            { id: "nao_conta", title: "❌ NÃO" },
            { id: "editar_conta", title: "✏️ EDITAR" },
          ]);
          reply = "";

        } else {
          console.error("❌ OCR conta falhou:", ocrData.erro);
          const tries = (customer.ocr_conta_attempts || 0) + 1;
          updates.ocr_conta_attempts = tries;
          if (tries < 2) {
            updates.conversation_step = "aguardando_conta";
            reply = "⚠️ Não consegui ler a conta. Por favor, envie uma *foto mais nítida e bem iluminada* (sem reflexos).";
          } else {
            console.warn(`⏭️ OCR conta falhou ${tries}x — pulando para coleta manual`);
            updates.conversation_step = "ask_name";
            reply = "⚠️ Não consegui ler sua conta de luz, mas tudo bem! Vou te perguntar os dados manualmente.\n\nQual é o seu *nome completo*?";
          }
        }
      } catch (e) {
        console.error("❌ Erro OCR conta:", e);
        const tries = (customer.ocr_conta_attempts || 0) + 1;
        updates.ocr_conta_attempts = tries;
        if (tries < 2) {
          updates.conversation_step = "aguardando_conta";
          reply = "⚠️ Erro ao processar a conta. Tente enviar novamente.";
        } else {
          updates.conversation_step = "ask_name";
          reply = "⚠️ Tive um problema ao ler sua conta. Vou continuar perguntando os dados.\n\nQual é o seu *nome completo*?";
        }
      }
      break;
    }

    // ─── 3. CONFIRMANDO DADOS DA CONTA ──────────
    case "confirmando_dados_conta": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      if (resp === "sim_conta" || resp === "sim" || resp === "s" || resp === "1" || resp === "ok" || resp === "correto" || resp === "✅") {
        // Usuário confirmou os dados (incluindo nome) — blindar contra OCR de doc futuro
        if (customer.name) updates.name_source = "user_confirmed";
        // Vai para o pitch do Conexão Club ANTES de pedir RG/CNH
        updates.conversation_step = "pitch_conexao_club";

        // 🎯 Envia EXATAMENTE o que o consultor configurou em /admin/fluxos
        // no step "pitch_conexao_club" (texto + mídias na ordem definida —
        // padrão text → audio → video → image). Nada é hardcoded aqui.
        const _valor = Number((customer as any).electricity_bill_value || 0);
        const _fmtBRL = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const _vars = {
          "{valor}": _fmtBRL(_valor),
          "{{valor}}": _fmtBRL(_valor),
          "{economia_mensal}": _fmtBRL(_valor * 0.20),
          "{{economia_mensal}}": _fmtBRL(_valor * 0.20),
          "{economia_anual}": _fmtBRL(_valor * 0.20 * 12),
          "{{economia_anual}}": _fmtBRL(_valor * 0.20 * 12),
        };
        await dispatchStepFromFlow("pitch_conexao_club", _vars);

        // Em seguida, dispara o step "duvidas_pos_club" também via fluxo configurado.
        await dispatchStepFromFlow("duvidas_pos_club", _vars);

        updates.conversation_step = "duvidas_pos_club";
        (updates as any).__inline_sent = true;
        reply = "";
      } else if (resp === "nao_conta" || resp === "nao" || resp === "não" || resp === "n" || resp === "2" || resp === "errado" || resp === "❌") {
        updates.conversation_step = "aguardando_conta";
        reply = "📸 Ok! Envie novamente a *FOTO da conta de energia* com melhor qualidade.";
      } else if (resp === "editar_conta" || resp === "editar" || resp === "3") {
        updates.conversation_step = "editing_conta_menu";
        reply = "✏️ Qual campo deseja editar?\n\n1️⃣ Nome\n2️⃣ Endereço\n3️⃣ CEP\n4️⃣ Distribuidora\n5️⃣ Nº Instalação\n6️⃣ Valor da conta\n0️⃣ Cancelar\n\nDigite o número (ou a palavra-chave: nome, valor, cep…):";
      } else {
        const sent = await sendOptions(remoteJid, "Os dados da conta estão corretos?", [
          { id: "sim_conta", title: "✅ SIM" },
          { id: "nao_conta", title: "❌ NÃO" },
          { id: "editar_conta", title: "✏️ EDITAR" },
        ]);
        if (!sent) reply = "Digite *SIM*, *NÃO* ou *EDITAR*:";
      }
      break;
    }

    // ─── 3a. PITCH CONEXÃO CLUB (fallback caso lead reentre nesse step) ─────────
    case "pitch_conexao_club": {
      // Pede o documento sem botões — o bot identifica RG/CNH sozinho.
      reply = `Pra finalizar, me manda só uma foto da *frente do seu documento* 📄\n\nPode ser RG ou CNH — o que for mais fácil pra você.`;
      updates.conversation_step = "aguardando_doc_auto";
      break;
    }

    // ─── 3a-bis. DÚVIDAS PÓS-CLUB ─────────
    // O lead recebeu o vídeo + pitch e foi convidado a tirar dúvidas.
    // - Afirmativo / "pode seguir" / "sem dúvida" → dispara botões do doc.
    // - Negativo OU pergunta livre → não fecha aqui; deixa a IA responder
    //   (esse case nem chega a executar nesse caminho, pois conversationalSteps
    //   inclui "duvidas_pos_club" e o ramo da IA roda antes do switch).
    case "duvidas_pos_club": {
      const txt = (messageText || "").trim().toLowerCase();
      const segueAgora =
        isButton ||
        /^(sim|s|ok|pode|pode seguir|bora|vamos|partiu|segue|seguir|tudo certo|sem d[uú]vida|nenhuma|nao tenho|n[ãa]o tenho|n[ãa]o|t[ãa]|fechou|beleza|blz)\b/.test(txt) ||
        /(quero|vamos|bora).*(cadastr|seguir|finaliz)/i.test(messageText || "");
      if (segueAgora) {
        const ctaMsg = `Show! Pra finalizar seu cadastro, me manda só uma foto da *frente do seu documento* 📄\n\nPode ser RG ou CNH — eu reconheço automaticamente qual é.`;
        await sendText(remoteJid, ctaMsg);
        await supabase.from("conversations").insert({
          customer_id: customer.id, message_direction: "outbound",
          message_text: ctaMsg, message_type: "text",
          conversation_step: "aguardando_doc_auto",
        });
        updates.conversation_step = "aguardando_doc_auto";
        (updates as any).__inline_sent = true;
        reply = "";
      } else {
        // Resposta de fallback se a IA não tiver pegado a dúvida acima.
        reply = "Pode mandar sua dúvida que eu te explico 😊 ou diga *pode seguir* pra avançar pro cadastro.";
      }
      break;
    }

    // ─── 3a-AUTO. CAPTURA DE DOC COM DETECÇÃO AUTOMÁTICA DE TIPO ─────
    // Usado pelos passos do FluxoCamila com step_type=capture_documento
    // (auto_detect_doc_type=true). A IA olha a foto e classifica RG/CNH
    // sem perguntar. Se não vier foto ainda, pede a foto.
    case "aguardando_doc_auto": {
      if (!isFile) {
        reply = "📸 Me envie a foto da *frente* do seu *RG ou CNH*.\n\nA IA reconhece automaticamente qual documento é. Formatos: JPG, PNG ou PDF.";
        break;
      }
      const mime = imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg";
      let detectedType: "cnh" | "rg_novo" | "rg_antigo" = "rg_antigo";
      try {
        detectedType = await detectDocumentType({
          base64: fileBase64 || undefined,
          mimeType: mime,
          imageUrl: fileUrl?.startsWith("http") ? fileUrl : undefined,
          geminiApiKey,
        });
        console.log(`🤖 [doc-auto] tipo detectado pela IA: ${detectedType}`);
      } catch (e) {
        console.warn(`⚠️ [doc-auto] falha detectando tipo:`, (e as Error).message);
      }
      updates.document_type = detectedType;
      // Reaproveita o handler clássico: marca o passo como aguardando_doc_frente
      // e encaminha o processamento para o case já existente abaixo.
      // Aqui só salvamos o tipo + step e devolvemos confirmação curta;
      // a próxima mensagem (ou a mesma se for re-entrada) cai em aguardando_doc_frente.
      // PORÉM: o lead JÁ enviou a foto agora — então processamos imediatamente
      // chamando a mesma lógica do aguardando_doc_frente inline.
      updates.conversation_step = "aguardando_doc_frente";
      // Falha controlada: deixa o switch re-executar via fall-through manual
      // setando step e reescrevendo a lógica seria ruim. Em vez disso, devolvemos
      // uma mensagem curta e aguardamos o próximo evento. Para não perder a foto
      // que já chegou, salvamos a frente aqui mesmo:
      if (fileBase64) {
        updates.document_front_url = `data:${mime};base64,${fileBase64}`;
        updates.document_front_base64 = fileBase64;
        updates.media_message_id = messageId || null;
        updates.media_storage = "inline";
      } else if (fileUrl) {
        updates.document_front_url = fileUrl.startsWith("http") ? fileUrl : "evolution-media:pending";
      }
      // Se for CNH, marca verso "não aplicável" para o pipeline pular o passo.
      // IMPORTANTE: nunca dizemos ao cliente "RG Novo" ou "RG Antigo" — essa
      // distinção é só interna pra decidir se precisa pedir o verso.
      if (detectedType === "cnh") {
        updates.document_back_url = "nao_aplicavel";
        await sendText(remoteJid, "✅ Documento recebido! ⏳ Analisando os dados...");
      } else {
        await sendText(remoteJid, `✅ Documento recebido! ⏳ Analisando a frente...\n\nDepois vou te pedir o *verso*.`);
      }
      // Roda OCR da frente já agora (mesma lógica do aguardando_doc_frente)
      try {
        const docFrenteUrl = fileUrl || updates.document_front_url || "evolution-media:pending";
        const ocrData = await ocrDocumentoFrenteVerso(
          docFrenteUrl,
          detectedType === "cnh" ? "nao_aplicavel" : (customer.document_back_url || ""),
          detectedType === "cnh" ? "CNH" : (detectedType === "rg_novo" ? "RG_NOVO" : "RG_ANTIGO"),
          geminiApiKey,
          fileBase64 || undefined,
          documentMessage || imageMessage,
          undefined,
        );
        if (ocrData.sucesso && ocrData.dados) {
          const d = ocrData.dados;
          { if (d.nome) updates.doc_holder_name = String(d.nome).trim(); const _safe = safeAssignName(customer.name, (customer as any).name_source, d.nome); if (_safe) { updates.name = _safe; updates.name_source = "ocr_doc"; } const _bill = customer.bill_holder_name || updates.bill_holder_name; if (_bill && d.nome) { const _chk = checkHolderMatch(_bill, d.nome); if (!_chk.match) { updates.name_mismatch_flag = true; updates.name_mismatch_reason = `bill="${_bill}" doc="${d.nome}" ${_chk.reason}`; } else { updates.name_mismatch_flag = false; updates.name_mismatch_reason = null; } } }
          if (d.cpf) updates.cpf = d.cpf.replace(/\D/g, "");
          if (d.rg) updates.rg = d.rg;
          const dataConf = String(d.dataNascimentoConfianca || "").toLowerCase();
          if (d.dataNascimento && (detectedType !== "cnh" || dataConf === "alta")) {
            updates.data_nascimento = d.dataNascimento;
          }
          if (d.nomePai) updates.nome_pai = d.nomePai;
          if (d.nomeMae) updates.nome_mae = d.nomeMae;
        }
      } catch (e) {
        console.warn(`[doc-auto] OCR falhou:`, (e as Error).message);
      }
      // CNH → vai direto pra confirmação. RG → pede verso.
      if (detectedType === "cnh") {
        updates.conversation_step = "confirmando_dados_doc";
        const nome = updates.name || customer.name || "—";
        const cpf = updates.cpf || customer.cpf || "—";
        const rg = updates.rg || customer.rg || "—";
        const nasc = updates.data_nascimento || customer.data_nascimento || "_(será preenchido pelo portal via CPF)_";
        await sendOptions(remoteJid, `📋 *Dados extraídos da CNH:*\n\n👤 Nome: *${nome}*\n🆔 CPF: *${cpf}*\n🪪 RG: *${rg}*\n🎂 Nascimento: *${nasc}*\n\nEstá tudo correto?`, [
          { id: "sim_doc", title: "✅ SIM" },
          { id: "nao_doc", title: "❌ NÃO" },
          { id: "editar_doc", title: "✏️ EDITAR" },
        ]);
        reply = "";
      } else {
        updates.conversation_step = "aguardando_doc_verso";
        reply = "✅ Frente recebida!\n\n📸 Agora envie o *VERSO do RG*.\n\nFormatos: JPG, PNG ou PDF";
      }
      break;
    }

    // ─── 3b. TIPO DE DOCUMENTO (legado) ─────────
    // Mantido só para retrocompat. Hoje o fluxo redireciona para `aguardando_doc_auto`,
    // onde o bot detecta RG/CNH automaticamente sem perguntar nada ao cliente.
    case "ask_tipo_documento": {
      // Se o cliente já mandou a foto, deixa o aguardando_doc_auto processar.
      if (isFile) {
        updates.conversation_step = "aguardando_doc_auto";
        reply = "";
        // Não dá break — re-emite o evento? Não dá. Mas como acabamos de salvar o step,
        // o próximo evento (a foto chegou junto) cai em aguardando_doc_auto.
        // Como atalho: já avisa que recebeu.
        await sendText(remoteJid, "📄 Recebi a foto, analisando agora...");
        break;
      }
      reply = `Me manda só uma foto da *frente do seu documento* 📄\n\nPode ser RG ou CNH — eu reconheço automaticamente.`;
      updates.conversation_step = "aguardando_doc_auto";
      break;
    }

    // ─── 4. FRENTE DO DOC ───────────
    case "aguardando_doc_frente": {
      if (!isFile) {
        const tipo = friendlyLabel(customer.document_type);
        const msgDoc = isCNH(customer.document_type) ? "FRENTE da sua CNH" : `FRENTE do seu ${tipo}`;
        reply = `📸 Envie a *${msgDoc}*.\n\nFormatos: JPG, PNG ou PDF`;
        break;
      }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        updates.document_front_url = `data:${mime};base64,${fileBase64}`;
        updates.document_front_base64 = fileBase64;
        updates.media_message_id = messageId || null;
        updates.media_storage = "inline";
        const custId = customer.id;
        uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_frente",
        }).then(async (minioUrl) => {
          if (minioUrl) {
            await supabase.from("customers").update({ document_front_url: minioUrl, media_storage: "minio" }).eq("id", custId);
            console.log(`📦✅ [BG] Doc frente uploaded MinIO: ${minioUrl.substring(0, 80)}`);
          }
        }).catch((e) => console.warn(`📦⚠️ [BG] MinIO doc_frente falhou: ${e?.message}`));
      } else {
        updates.document_front_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
        updates.media_message_id = messageId || null;
      }

      const tipoEscolhido = normalizeDocumentType(customer.document_type);
      if (tipoEscolhido === "cnh") {
        updates.document_back_url = "nao_aplicavel";
        updates.document_type = "cnh";
        await sendText(remoteJid, "✅ CNH recebida! ⏳ Analisando...\n\nAguarde...");
        try {
          const docFrenteUrl = fileUrl || updates.document_front_url || "evolution-media:pending";
          console.log("📡 Chamando OCR documento CNH (apenas frente)");
          const ocrData = await ocrDocumentoFrenteVerso(
            docFrenteUrl, "nao_aplicavel", "CNH", geminiApiKey,
            fileBase64 || undefined, documentMessage || imageMessage, undefined
          );
          console.log("📊 OCR CNH resultado:", JSON.stringify(ocrData).substring(0, 400));
          if (ocrData.sucesso && ocrData.dados) {
            const d = ocrData.dados;
            { if (d.nome) updates.doc_holder_name = String(d.nome).trim(); const _safe = safeAssignName(customer.name, (customer as any).name_source, d.nome); if (_safe) { updates.name = _safe; updates.name_source = "ocr_doc"; } const _bill = customer.bill_holder_name || updates.bill_holder_name; if (_bill && d.nome) { const _chk = checkHolderMatch(_bill, d.nome); if (!_chk.match) { updates.name_mismatch_flag = true; updates.name_mismatch_reason = `bill="${_bill}" doc="${d.nome}" ${_chk.reason}`; } else { updates.name_mismatch_flag = false; updates.name_mismatch_reason = null; } } }
            if (d.cpf) updates.cpf = d.cpf.replace(/\D/g, "");
            if (d.rg) updates.rg = d.rg;
            const dataConf = String(d.dataNascimentoConfianca || "").toLowerCase();
            if (d.dataNascimento && dataConf === "alta") {
              updates.data_nascimento = d.dataNascimento;
              console.log(`✅ CNH: data nasc ${d.dataNascimento} aceita (confiança alta)`);
            } else if (d.dataNascimento) {
              console.warn(`⚠️ CNH: data nasc ${d.dataNascimento} NÃO salva (confiança ${dataConf || "n/a"}). Portal preencherá via CPF.`);
            }
            if (d.nomePai) updates.nome_pai = d.nomePai;
            if (d.nomeMae) updates.nome_mae = d.nomeMae;
          }
        } catch (e) { console.error("❌ OCR CNH falhou:", e); }
        updates.conversation_step = "confirmando_dados_doc";
        const nome = updates.name || customer.name || "—";
        const cpf = updates.cpf || customer.cpf || "—";
        const rg = updates.rg || customer.rg || "—";
        const nasc = updates.data_nascimento || customer.data_nascimento || "_(será preenchido pelo portal via CPF)_";
        const chnConfirmMsg = `📋 *Dados extraídos da CNH:*\n\n👤 Nome: *${nome}*\n🆔 CPF: *${cpf}*\n🪪 RG: *${rg}*\n🎂 Nascimento: *${nasc}*\n\nEstá tudo correto?`;
        await sendOptions(remoteJid, chnConfirmMsg, [
          { id: "sim_doc", title: "✅ SIM" },
          { id: "nao_doc", title: "❌ NÃO" },
          { id: "editar_doc", title: "✏️ EDITAR" },
        ]);
        reply = "";
        break;
      }
      updates.conversation_step = "aguardando_doc_verso";
      reply = "✅ Frente recebida!\n\n📸 Agora envie o *VERSO do RG*.\n\nFormatos: JPG, PNG ou PDF";
      break;
    }

    // ─── 5. VERSO ────────
    case "aguardando_doc_verso": {
      if (!isFile) { reply = "📸 Envie o *VERSO do documento*.\n\nFormatos: JPG, PNG ou PDF"; break; }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        updates.document_back_url = `data:${mime};base64,${fileBase64}`;
        const custId = customer.id;
        uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_verso",
        }).then(async (minioUrl) => {
          if (minioUrl) {
            await supabase.from("customers").update({ document_back_url: minioUrl }).eq("id", custId);
            console.log(`📦✅ [BG] Doc verso uploaded MinIO: ${minioUrl.substring(0, 80)}`);
          }
        }).catch((e) => console.warn(`📦⚠️ [BG] MinIO doc_verso falhou: ${e?.message}`));
      } else {
        updates.document_back_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
      }
      await sendText(remoteJid, "✅ Documento recebido! ⏳ Analisando...\n\nAguarde...");
      console.log("📥 Documento verso recebido:");
      console.log("  - fileBase64 length:", fileBase64?.length || 0);
      console.log("  - mimetype:", imageMessage?.mimetype || documentMessage?.mimetype);
      if (fileBase64 && fileBase64.length < 100) {
        console.error("❌ Base64 muito pequeno:", fileBase64.length);
        updates.conversation_step = "aguardando_doc_verso";
        reply = "⚠️ Erro ao processar documento. Tente enviar uma foto mais nítida.";
        break;
      }
      const mediaMsg = documentMessage || imageMessage || {
        mimetype: imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg",
      };
      try {
        const docFrenteUrl = customer.document_front_url || updates.document_front_url;
        const docVersoUrl = updates.document_back_url || customer.document_back_url;
        const frenteBase64: string | undefined = undefined;
        console.log("📡 Chamando OCR documento (verso; frente já analisada se disponível)");
        console.log(`📡 Frente base64 banco: NÃO (descontinuado), Verso base64: ${fileBase64 ? 'SIM' : 'NÃO'}`);
        const ocrData = await ocrDocumentoFrenteVerso(
          docFrenteUrl, docVersoUrl, customer.document_type || "rg_antigo",
          geminiApiKey, frenteBase64, undefined, fileBase64 || undefined
        );
        console.log("📊 OCR Doc resultado:", JSON.stringify(ocrData).substring(0, 400));
        if (ocrData.sucesso && ocrData.dados) {
          const d = ocrData.dados;
          { if (d.nome) updates.doc_holder_name = String(d.nome).trim(); const _safe = safeAssignName(customer.name, (customer as any).name_source, d.nome); if (_safe) { updates.name = _safe; updates.name_source = "ocr_doc"; } const _bill = customer.bill_holder_name || updates.bill_holder_name; if (_bill && d.nome) { const _chk = checkHolderMatch(_bill, d.nome); if (!_chk.match) { updates.name_mismatch_flag = true; updates.name_mismatch_reason = `bill="${_bill}" doc="${d.nome}" ${_chk.reason}`; } else { updates.name_mismatch_flag = false; updates.name_mismatch_reason = null; } } }
          if (d.cpf) updates.cpf = d.cpf.replace(/\D/g, "");
          if (d.rg) updates.rg = d.rg;
          if (d.dataNascimento) updates.data_nascimento = d.dataNascimento;
          if (d.nomePai) updates.nome_pai = d.nomePai;
          if (d.nomeMae) updates.nome_mae = d.nomeMae;
          updates.conversation_step = "confirmando_dados_doc";
          const mismatchWarn = updates.name_mismatch_flag
            ? `\n\n⚠️ *Notei uma diferença:* o nome no documento (*${d.nome}*) parece diferente do nome na conta de luz (*${customer.bill_holder_name || updates.bill_holder_name}*).\nSem problema — pode ser titularidade de cônjuge/pai/mãe. Antes de finalizar vou te perguntar.`
            : "";
          reply = "📋 *Confirme seus dados pessoais:*\n\n" +
            `👤 *Nome:* ${d.nome || "❌ não encontrado"}\n` +
            `🆔 *CPF:* ${d.cpf || "❌ não encontrado"}\n` +
            `📄 *RG:* ${d.rg || "❌ não encontrado"}\n` +
            `🎂 *Data Nasc:* ${d.dataNascimento || "❌ não encontrado"}` +
            mismatchWarn +
            "\n\nEstá tudo correto?";
          await sendOptions(remoteJid, reply, [
            { id: "sim_doc", title: "✅ SIM" },
            { id: "nao_doc", title: "❌ NÃO" },
            { id: "editar_doc", title: "✏️ EDITAR" },
          ]);
          reply = "";
        } else {
          console.error("❌ OCR doc falhou:", ocrData.erro);
          const tries = (customer.ocr_doc_attempts || 0) + 1;
          updates.ocr_doc_attempts = tries;
          if (tries < 2) {
            updates.conversation_step = "aguardando_doc_verso";
            reply = "⚠️ Não consegui ler o documento. Envie uma foto mais nítida do *VERSO*.";
          } else {
            console.warn(`⏭️ OCR doc falhou ${tries}x — pulando para coleta manual de RG/CPF/data nasc`);
            updates.conversation_step = "ask_cpf";
            reply = "⚠️ Não consegui extrair os dados do documento, mas vamos continuar.\n\nQual o seu *CPF*? (apenas números)";
          }
        }
      } catch (e) {
        console.error("❌ Erro OCR doc:", e);
        const tries = (customer.ocr_doc_attempts || 0) + 1;
        updates.ocr_doc_attempts = tries;
        if (tries < 2) {
          updates.conversation_step = "aguardando_doc_verso";
          reply = "⚠️ Erro ao processar o documento. Tente enviar novamente.";
        } else {
          updates.conversation_step = "ask_cpf";
          reply = "⚠️ Tive problemas para ler seu documento. Vamos seguir manualmente.\n\nQual o seu *CPF*? (apenas números)";
        }
      }
      break;
    }

    // ─── 6. CONFIRMANDO DADOS DOC ─────────
    case "confirmando_dados_doc": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      if (resp === "sim_doc" || resp === "sim" || resp === "s" || resp === "1" || resp === "ok" || resp === "correto" || resp === "✅") {
        if (customer.name || updates.name) updates.name_source = "user_confirmed";
        const _mismatch = (updates.name_mismatch_flag ?? (customer as any).name_mismatch_flag) === true;
        const _acked = (updates.name_mismatch_acknowledged_at ?? (customer as any).name_mismatch_acknowledged_at);
        if (_mismatch && !_acked) {
          updates.conversation_step = "confirmar_titularidade";
          const _bill = (customer as any).bill_holder_name || updates.bill_holder_name || "—";
          const _doc = (customer as any).doc_holder_name || updates.doc_holder_name || "—";
          await sendOptions(remoteJid, `Antes de finalizar preciso confirmar:\n\n👤 Conta de luz: *${_bill}*\n🪪 Documento: *${_doc}*\n\nÉ a mesma pessoa?`, [
            { id: "titular_mesmo", title: "Mesma pessoa" },
            { id: "titular_outro", title: "Outro titular" },
            { id: "titular_corrigir", title: "Corrigir" },
          ]);
          reply = "";
        } else {
          const merged = { ...customer, ...updates };
          const next = await autoResolveCepIfNeeded(merged, updates);
          updates.conversation_step = next;
          reply = getReplyForStep(next, merged);
        }
      } else if (resp === "nao_doc" || resp === "nao" || resp === "não" || resp === "n" || resp === "2" || resp === "errado" || resp === "❌") {
        // ── ANTI-LOOP: após 2 rejeições, força avanço para coleta manual em vez de re-pedir foto ──
        const rejectCount = (customer.ocr_doc_attempts || 0) + 1;
        updates.ocr_doc_attempts = rejectCount;
        if (rejectCount >= 2) {
          console.warn(`⚠️ [ANTI-LOOP DOC] ${customer.id} rejeitou doc ${rejectCount}x — indo para coleta manual.`);
          updates.conversation_step = "ask_cpf";
          reply = "Sem problema! Vamos coletar os dados manualmente.\n\nQual o seu *CPF*? (apenas números)";
        } else {
          updates.conversation_step = "aguardando_doc_frente";
          reply = "📸 Ok! Envie novamente a *FRENTE do documento* com melhor qualidade.";
        }
      } else if (resp === "editar_doc" || resp === "editar" || resp === "3") {
        updates.conversation_step = "editing_doc_menu";
        reply = "✏️ Qual campo deseja editar?\n\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ RG\n4️⃣ Data de Nascimento\n0️⃣ Cancelar\n\nDigite o número (ou a palavra-chave: nome, cpf, rg, data):";
      } else {
        const sent = await sendOptions(remoteJid, "Os dados estão corretos?", [
          { id: "sim_doc", title: "✅ SIM" },
          { id: "nao_doc", title: "❌ NÃO" },
          { id: "editar_doc", title: "✏️ EDITAR" },
        ]);
        if (!sent) reply = "Digite *SIM*, *NÃO* ou *EDITAR*:";
      }
      break;
    }

    // ─── 6b. CONFIRMAR TITULARIDADE (mismatch conta × RG) ─────────
    case "confirmar_titularidade": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      if (resp === "titular_mesmo" || /mesma|sou eu|é eu|eh eu|igual/i.test(resp)) {
        updates.name_mismatch_acknowledged_at = new Date().toISOString();
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = "Perfeito, anotado! ✅\n\n" + getReplyForStep(next, merged);
      } else if (resp === "titular_outro" || /outro|c[ôo]njuge|esposa|esposo|marido|pai|m[ãa]e|filho|filha|parente/i.test(resp)) {
        updates.name_mismatch_acknowledged_at = new Date().toISOString();
        updates.bill_owner_relationship = messageText.trim().slice(0, 60) || "outro_titular";
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = "Entendido — a conta é em nome de outra pessoa. Vou registrar isso pro consultor revisar na hora do cadastro. ✅\n\n" + getReplyForStep(next, merged);
      } else if (resp === "titular_corrigir" || /corrigir|errado|edit/i.test(resp)) {
        updates.conversation_step = "editing_doc_menu";
        reply = "✏️ O que deseja corrigir?\n\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ RG\n4️⃣ Data de Nascimento\n0️⃣ Cancelar";
      } else {
        const sent = await sendOptions(remoteJid, "Me ajuda a confirmar: é a mesma pessoa, outro titular ou quer corrigir?", [
          { id: "titular_mesmo", title: "Mesma pessoa" },
          { id: "titular_outro", title: "Outro titular" },
          { id: "titular_corrigir", title: "Corrigir" },
        ]);
        if (!sent) reply = "Responda: *mesma pessoa*, *outro titular* ou *corrigir*.";
      }
      break;
    }

    // ─── 7. EDIÇÃO CONTA ─────────
    case "editing_conta_menu": {
      const op = messageText.trim().toLowerCase();
      const fieldMap: Record<string, [string, string]> = {
        "1": ["editing_conta_nome", "Digite o *nome completo* correto:"],
        "2": ["editing_conta_endereco", "Digite o *endereço completo* correto:"],
        "3": ["editing_conta_cep", "Digite o *CEP* correto (8 dígitos):"],
        "4": ["editing_conta_distribuidora", "Digite o nome da *distribuidora*:"],
        "5": ["editing_conta_instalacao", "Digite o *número da instalação*:"],
        "6": ["editing_conta_valor", "Digite o *valor da conta* (ex: 350,50):"],
      };
      // Palavras-chave (atalho amigável)
      let target: [string, string] | null = fieldMap[op] || null;
      if (!target) {
        if (/\bnome\b/.test(op)) target = fieldMap["1"];
        else if (/\b(endere[çc]o|rua)\b/.test(op)) target = fieldMap["2"];
        else if (/\bcep\b/.test(op)) target = fieldMap["3"];
        else if (/\bdistribuidora\b/.test(op)) target = fieldMap["4"];
        else if (/\binstala[çc][ãa]o\b/.test(op)) target = fieldMap["5"];
        else if (/\bvalor\b/.test(op)) target = fieldMap["6"];
      }
      if (op === "0" || /\b(cancelar|voltar)\b/.test(op)) {
        // Volta pra tela completa de confirmação
        updates.conversation_step = "confirmando_dados_conta";
        const merged = { ...customer, ...updates };
        await sendOptions(remoteJid, buildConfirmacaoConta(merged), [
          { id: "sim_conta", title: "✅ SIM" },
          { id: "nao_conta", title: "❌ NÃO" },
          { id: "editar_conta", title: "✏️ EDITAR" },
        ]);
        reply = "";
      } else if (target) {
        updates.conversation_step = target[0];
        reply = target[1];
      } else {
        reply = "❌ Opção inválida. Digite *1-6* ou *0* para cancelar:\n\n1️⃣ Nome\n2️⃣ Endereço\n3️⃣ CEP\n4️⃣ Distribuidora\n5️⃣ Nº Instalação\n6️⃣ Valor da conta\n0️⃣ Cancelar";
      }
      break;
    }

    // Helper local: salva campo da conta e reenvia tela completa de confirmação
    case "editing_conta_nome": {
      const v = messageText.trim();
      if (v.length < 3) { reply = "❌ Nome muito curto. Digite o *nome completo*:"; break; }
      updates.name = v;
      updates.name_source = "user_confirmed";
      updates.conversation_step = "confirmando_dados_conta";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ Nome atualizado: *${v}*\n\n` + buildConfirmacaoConta(merged), [
        { id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_conta_endereco": {
      const v = messageText.trim();
      if (v.length < 3) { reply = "❌ Endereço muito curto. Digite novamente:"; break; }
      updates.address_street = v;
      updates.conversation_step = "confirmando_dados_conta";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ Endereço atualizado.\n\n` + buildConfirmacaoConta(merged), [
        { id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_conta_cep": {
      const cepClean = messageText.replace(/\D/g, "");
      if (cepClean.length !== 8) { reply = "❌ CEP inválido. Digite os 8 números:"; break; }
      updates.cep = cepClean;
      updates.conversation_step = "confirmando_dados_conta";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ CEP: *${cepClean.replace(/(\d{5})(\d{3})/, "$1-$2")}*\n\n` + buildConfirmacaoConta(merged), [
        { id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_conta_distribuidora": {
      const v = messageText.trim();
      if (v.length < 2) { reply = "❌ Nome muito curto. Digite a *distribuidora*:"; break; }
      updates.distribuidora = v;
      updates.conversation_step = "confirmando_dados_conta";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ Distribuidora: *${v}*\n\n` + buildConfirmacaoConta(merged), [
        { id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_conta_instalacao": {
      const instClean = messageText.replace(/\D/g, "");
      if (instClean.length < 7) { reply = "❌ Número inválido. Digite pelo menos 7 dígitos:"; break; }
      updates.numero_instalacao = instClean;
      updates.conversation_step = "confirmando_dados_conta";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ Nº Instalação: *${instClean}*\n\n` + buildConfirmacaoConta(merged), [
        { id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_conta_valor": {
      const val = parseFloat(messageText.replace(/[^\d.,]/g, "").replace(",", "."));
      if (isNaN(val) || val < 30) { reply = "❌ Valor inválido. Digite um número (ex: 350,50):"; break; }
      updates.electricity_bill_value = val;
      updates.conversation_step = "confirmando_dados_conta";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ Valor: *R$ ${_formatBRL(val)}*\n\n` + buildConfirmacaoConta(merged), [
        { id: "sim_conta", title: "✅ SIM" }, { id: "nao_conta", title: "❌ NÃO" }, { id: "editar_conta", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    // ─── 8. EDIÇÃO DOCUMENTO ─────────
    case "editing_doc_menu": {
      const op = messageText.trim().toLowerCase();
      const fieldMap: Record<string, [string, string]> = {
        "1": ["editing_doc_nome", "Digite o *nome completo* correto:"],
        "2": ["editing_doc_cpf", "Digite o *CPF* correto (apenas números):"],
        "3": ["editing_doc_rg", "Digite o *RG* correto:"],
        "4": ["editing_doc_nascimento", "Digite a *data de nascimento* (DD/MM/AAAA):"],
      };
      let target: [string, string] | null = fieldMap[op] || null;
      if (!target) {
        if (/\bnome\b/.test(op)) target = fieldMap["1"];
        else if (/\bcpf\b/.test(op)) target = fieldMap["2"];
        else if (/\brg\b/.test(op)) target = fieldMap["3"];
        else if (/\b(nascimento|data)\b/.test(op)) target = fieldMap["4"];
      }
      if (op === "0" || /\b(cancelar|voltar)\b/.test(op)) {
        updates.conversation_step = "confirmando_dados_doc";
        const merged = { ...customer, ...updates };
        await sendOptions(remoteJid, buildConfirmacaoDoc(merged), [
          { id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" },
        ]);
        reply = "";
      } else if (target) {
        updates.conversation_step = target[0];
        reply = target[1];
      } else {
        reply = "❌ Opção inválida. Digite *1-4* ou *0* para cancelar:\n\n1️⃣ Nome\n2️⃣ CPF\n3️⃣ RG\n4️⃣ Data de Nascimento\n0️⃣ Cancelar";
      }
      break;
    }

    case "editing_doc_nome": {
      const v = messageText.trim();
      if (v.length < 3) { reply = "❌ Nome muito curto. Digite o *nome completo*:"; break; }
      updates.name = v;
      updates.name_source = "user_confirmed";
      updates.conversation_step = "confirmando_dados_doc";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ Nome: *${v}*\n\n` + buildConfirmacaoDoc(merged), [
        { id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_doc_cpf": {
      const cpfClean = messageText.replace(/\D/g, "");
      if (cpfClean.length !== 11) { reply = "❌ CPF inválido. Digite os 11 números:"; break; }
      updates.cpf = cpfClean;
      updates.conversation_step = "confirmando_dados_doc";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ CPF: *${cpfClean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}*\n\n` + buildConfirmacaoDoc(merged), [
        { id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_doc_rg": {
      const v = messageText.trim();
      if (v.replace(/\D/g, "").length < 4) { reply = "❌ RG inválido. Digite novamente:"; break; }
      updates.rg = v;
      updates.conversation_step = "confirmando_dados_doc";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ RG: *${v}*\n\n` + buildConfirmacaoDoc(merged), [
        { id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    case "editing_doc_nascimento": {
      const dateMatch = messageText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!dateMatch) { reply = "❌ Data inválida. Use DD/MM/AAAA (ex: 20/07/1993):"; break; }
      updates.data_nascimento = messageText.trim();
      updates.conversation_step = "confirmando_dados_doc";
      const merged = { ...customer, ...updates };
      await sendOptions(remoteJid, `✅ Data: *${messageText.trim()}*\n\n` + buildConfirmacaoDoc(merged), [
        { id: "sim_doc", title: "✅ SIM" }, { id: "nao_doc", title: "❌ NÃO" }, { id: "editar_doc", title: "✏️ EDITAR" },
      ]);
      reply = "";
      break;
    }

    // ─── 9. PERGUNTAS MANUAIS ─────────
    case "ask_name": {
      if (messageText.length < 3) { reply = "Por favor, digite seu *nome completo*."; break; }
      updates.name = messageText.trim();
      updates.name_source = "user_confirmed";
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_cpf": {
      const cpfClean = messageText.replace(/\D/g, "");
      if (cpfClean.length !== 11) { reply = "❌ CPF inválido. Digite os *11 números*:"; break; }
      if (!validarCPFDigitos(cpfClean)) { reply = "❌ CPF inválido. Verifique os números:"; break; }
      updates.cpf = cpfClean;
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_rg": {
      if (messageText.length < 4) { reply = "Por favor, informe um *RG válido*:"; break; }
      updates.rg = messageText.trim();
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_birth_date": {
      const dateMatch = messageText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!dateMatch) { reply = "❌ Data inválida. Use *DD/MM/AAAA* (ex: 20/07/1993):"; break; }
      updates.data_nascimento = messageText.trim();
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_phone_confirm": {
      const resp = isButton ? buttonId : messageText.toLowerCase().trim();
      const sim = resp === "sim_phone" || resp === "1" || resp === "sim" || resp === "s";
      const editar = resp === "editar_phone" || resp === "2" || resp === "editar" || resp === "outro" || resp === "outro número" || resp === "outro numero";

      // ── PROTEÇÃO: Se o phone_whatsapp é o número do consultor/instância,
      // NÃO permitir confirmar — forçar digitar outro número ──
      let phoneIsConsultant = false;
      if (sim) {
        try {
          const [{ data: cons }, { data: inst }] = await Promise.all([
            supabase.from("consultants").select("phone").eq("id", consultorId).maybeSingle(),
            supabase.from("whatsapp_instances").select("connected_phone").eq("consultant_id", consultorId).maybeSingle(),
          ]);
          const blockNumbers = [cons?.phone, inst?.connected_phone].filter(Boolean) as string[];
          const whatsNum = (customer.phone_whatsapp || phone || "").replace(/\D/g, "");
          if (blockNumbers.some((n) => isSameContact(whatsNum, n))) {
            phoneIsConsultant = true;
            console.log(`⚠️ [ask_phone_confirm] Telefone do WhatsApp é do consultor — forçando ask_phone`);
          }
        } catch (_) { /* segue */ }
      }

      if (sim && !phoneIsConsultant) {
        const p = (customer.phone_whatsapp || phone).replace(/\D/g, "");
        const num = p.length >= 11 ? p.slice(-11) : p;
        updates.phone_landline = num.length === 11
          ? num.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
          : num.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
        // NÃO atualizar phone_whatsapp — é a chave da conversa e tem unique constraint
        // ✅ Cliente CONFIRMOU explicitamente que o número de WhatsApp é o telefone de contato
        updates.phone_contact_confirmed = true;
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
      } else if (sim && phoneIsConsultant) {
        // Telefone do WhatsApp é do consultor — não pode usar como contato
        updates.conversation_step = "ask_phone";
        reply = "⚠️ Esse número é do consultor e não pode ser usado como seu contato.\n\nInforme *seu próprio telefone* com DDD (ex: 11999998888):";
      } else if (editar) {
        updates.conversation_step = "ask_phone";
        reply = "Informe o *telefone* com DDD (ex: 11999998888):";
      } else {
        const msgConfirm = getReplyForStep("ask_phone_confirm", { ...customer, phone_whatsapp: phone });
        const sent = await sendOptions(remoteJid, msgConfirm, [
          { id: "sim_phone", title: "✅ Sim" },
          { id: "editar_phone", title: "📱 Outro número" },
        ]);
        if (!sent) reply = "Digite *1* se esse telefone é seu, ou *2* para informar outro número:";
        else reply = "";
      }
      break;
    }

    case "ask_phone": {
      // ── DETECÇÃO INTELIGENTE: se o cliente mandou email ao invés de telefone, salvar e avançar ──
      if (messageText.includes("@") && isValidEmailFormat(messageText.trim())) {
        console.log(`📧 [ask_phone] Cliente enviou email "${messageText.trim()}" ao invés de telefone — salvando e avançando`);
        updates.email = messageText.trim().toLowerCase();
        // Usar telefone do WhatsApp como telefone de contato (NÃO alterar phone_whatsapp — é chave da conversa)
        const p = (customer.phone_whatsapp || phone).replace(/\D/g, "");
        const num = p.startsWith("55") && p.length >= 12 ? p.substring(2) : p;
        if (num.length >= 10) {
          updates.phone_landline = num.length === 11
            ? num.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
            : num.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
          // NÃO atualizar phone_whatsapp — causa duplicate key violation
          updates.phone_contact_confirmed = true;
        }
        const merged = { ...customer, ...updates };
        const next = await autoResolveCepIfNeeded(merged, updates);
        updates.conversation_step = next;
        reply = getReplyForStep(next, merged);
        break;
      }
      let phoneClean = messageText.replace(/\D/g, "");
      // Aceitar formatos: +55 11 94574-4147, 55 11945744147, (11) 94574-4147, 11945744147
      // Remover prefixo 55 se presente (código do país)
      if (phoneClean.startsWith("55") && phoneClean.length >= 12) {
        phoneClean = phoneClean.substring(2);
      }
      if (phoneClean.length < 10 || phoneClean.length > 11) { reply = "❌ Telefone inválido. Digite com DDD (ex: 11999998888):"; break; }
      // Validar DDD
      const ddd = parseInt(phoneClean.substring(0, 2));
      if (ddd < 11 || ddd > 99) { reply = "❌ DDD inválido. Informe um telefone com DDD válido (ex: 11999998888):"; break; }
      // Buscar telefone do consultor + número da instância conectada para evitar auto-cadastro acidental
      try {
        const [{ data: cons }, { data: inst }] = await Promise.all([
          supabase.from("consultants").select("phone").eq("id", consultorId).maybeSingle(),
          supabase.from("whatsapp_instances").select("connected_phone").eq("consultant_id", consultorId).maybeSingle(),
        ]);
        const blockNumbers = [cons?.phone, inst?.connected_phone].filter(Boolean) as string[];
        if (blockNumbers.some((n) => isSameContact(phoneClean, n))) {
          reply = "❌ Esse telefone é o número do consultor. Por favor, informe *seu próprio telefone* de contato:";
          break;
        }
      } catch (_) { /* segue */ }
      const num11 = phoneClean.length >= 11 ? phoneClean.slice(-11) : phoneClean;
      updates.phone_landline = num11.length === 11
        ? num11.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
        : num11.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
      // ⚠️ NÃO atualizar phone_whatsapp aqui — é a chave da conversa (número real do remetente)
      // e tem unique constraint. Só phone_landline (telefone de contato) muda.
      // updates.phone_whatsapp = normalizePhone(num11);  // REMOVIDO — causa duplicate key
      // ✅ Cliente DIGITOU o telefone — confirmado explicitamente
      updates.phone_contact_confirmed = true;
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_email": {
      const txt = (messageText || "").trim();
      const lower = txt.toLowerCase();
      // ⚠️ Email é OBRIGATÓRIO no portal iGreen. Não aceitar PULAR — repetir até cliente fornecer email real.
      // Se cliente disser que não tem, orientar a criar um Gmail rápido.
      if (["pular", "skip", "não tenho", "nao tenho", "sem email", "sem e-mail", "n", "não", "nao"].includes(lower)) {
        reply = "📧 Preciso de um *e-mail* para finalizar seu cadastro no portal iGreen.\n\nSe você não tem, pode criar um agora em *gmail.com* — leva 1 minuto.\n\nDepois é só enviar aqui (ex: nome.sobrenome@gmail.com):";
        break;
      }
      // ── Validação dura: formato + placeholder + email do consultor ──
      if (!isValidEmailFormat(txt)) {
        reply = "❌ Não consegui ler esse e-mail.\n\n✅ Exemplo correto: *joao.silva@gmail.com*\n\nInforme um *e-mail pessoal real*:";
        break;
      }
      if (isPlaceholderEmail(txt)) {
        reply = "❌ Esse e-mail não pode ser usado.\n\nInforme um *e-mail pessoal real* (ex: nome@gmail.com):";
        break;
      }
      // Bloquear email do consultor dono
      try {
        const { data: cons } = await supabase
          .from("consultants")
          .select("igreen_portal_email")
          .eq("id", consultorId)
          .maybeSingle();
        if (cons?.igreen_portal_email && isSameContact(txt, cons.igreen_portal_email)) {
          reply = "❌ Esse e-mail é do consultor. Por favor, informe *seu próprio e-mail pessoal* (ex: nome@gmail.com):";
          break;
        }
      } catch (_) { /* segue */ }
      updates.email = txt.toLowerCase();
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_cep": {
      const cepClean = messageText.replace(/\D/g, "");
      if (cepClean.length !== 8) { reply = "❌ CEP inválido. Informe os *8 números*:"; break; }
      try {
        const viaCepRes = await fetchWithTimeout(`https://viacep.com.br/ws/${cepClean}/json/`, { timeout: TIMEOUT_VIA_CEP });
        const viaCep = await viaCepRes.json();
        if (viaCep.erro) { reply = "❌ CEP não encontrado. Verifique e tente novamente:"; break; }
        updates.cep = cepClean;
        updates.address_street = viaCep.logradouro || customer.address_street || "";
        updates.address_neighborhood = viaCep.bairro || customer.address_neighborhood || "";
        updates.address_city = viaCep.localidade || customer.address_city || "";
        updates.address_state = viaCep.uf || customer.address_state || "";
      } catch { reply = "⚠️ Erro ao buscar CEP. Tente novamente:"; break; }
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_number": {
      updates.address_number = messageText.trim();
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_complement": {
      const lower = (messageText || "").toLowerCase().trim();
      const skipWords = ["não", "nao", "n", "pular", "skip", "sem complemento", "sem", "nenhum"];
      if (!skipWords.includes(lower)) {
        updates.address_complement = messageText.trim();
      } else {
        updates.address_complement = "";
      }
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_installation_number": {
      const instClean = messageText.replace(/\D/g, "");
      if (instClean.length < 7) { reply = "❌ Número inválido. Digite pelo menos 7 dígitos:"; break; }
      updates.numero_instalacao = instClean;
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_bill_value": {
      const val = parseFloat(messageText.replace(/[^\d.,]/g, "").replace(",", "."));
      if (isNaN(val) || val <= 0) { reply = "❌ Valor inválido. Digite um número (ex: 350):"; break; }
      updates.electricity_bill_value = val;
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    // ─── 10. DOCUMENTOS MANUAIS ────────
    case "ask_doc_frente_manual": {
      if (!isFile) { reply = "📸 Envie a *FRENTE do seu documento* (RG ou CNH)\n\nFormatos: JPG, PNG ou PDF"; break; }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        const minioUrl = await uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_frente",
        });
        updates.document_front_url = minioUrl || (fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending");
      } else {
        updates.document_front_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
      }
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    case "ask_doc_verso_manual": {
      if (!isFile) { reply = "📸 Envie o *VERSO do seu documento*\n\nFormatos: JPG, PNG ou PDF"; break; }
      if (fileBase64) {
        const mime = imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
        const minioUrl = await uploadMediaToMinio({
          fileBase64, mimeType: mime, consultantFolder: consultorId, consultantName: nomeRepresentante,
          customerName: customer.name || "cliente", customerBirth: customer.data_nascimento, kind: "doc_verso",
        });
        updates.document_back_url = minioUrl || (fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending");
      } else {
        updates.document_back_url = fileUrl?.startsWith("http") ? fileUrl : "evolution-media:pending";
      }
      const merged = { ...customer, ...updates };
      const next = await autoResolveCepIfNeeded(merged, updates);
      updates.conversation_step = next;
      reply = getReplyForStep(next, merged);
      break;
    }

    // ─── 11. CONFIRMAR FINALIZAR ────────
    case "ask_finalizar": {
      const resp = (isButton ? buttonId : messageText.toLowerCase().trim()) || "";
      // Aceita botão OU texto livre (cliente quase nunca clica no botão)
      const triggers = ["btn_finalizar", "1", "finalizar", "sim", "s", "ok", "concluir", "prosseguir", "vamos", "pode", "pode sim", "pronto"];
      const finalizar = triggers.includes(resp);
      if (finalizar) { updates.conversation_step = "finalizando"; reply = ""; }
      else {
        const sent = await sendOptions(remoteJid, "📋 Todos os dados foram preenchidos!\n\nDeseja finalizar o cadastro?\n\n_(Você também pode digitar *FINALIZAR* ou *OK*)_", [
          { id: "btn_finalizar", title: "✅ Finalizar" },
        ]);
        if (!sent) reply = "Digite *FINALIZAR* ou *1* para confirmar o cadastro:";
      }
      break;
    }

    case "portal_submitting": {
      reply = "⏳ Estamos processando seu cadastro no portal...\n\n📱 Em breve você receberá um *código de verificação no WhatsApp*. Quando receber, *digite aqui*!\n\nAguarde alguns instantes...";
      break;
    }

    case "aguardando_otp": {
      const otpCode = messageText.replace(/\D/g, "");
      if (otpCode.length >= 4 && otpCode.length <= 8) {
        updates.otp_code = otpCode;
        updates.otp_received_at = new Date().toISOString();
        reply = `✅ Código *${otpCode}* recebido! ⏳ Validando no portal...\n\nEm instantes vou te enviar o link da *validação facial* (última etapa).`;
      } else {
        reply = "📱 Por favor, digite o *código numérico* que você recebeu no WhatsApp.\n\n(Geralmente são 4 a 6 dígitos)";
      }
      break;
    }

    case "validando_otp": {
      reply = "⏳ Estamos validando seu código no portal. Aguarde um momento...\n\nSe já passou mais de 2 minutos, digite o código novamente.";
      break;
    }

    case "aguardando_facial":
    case "aguardando_assinatura": {
      const link = customer.link_facial || customer.link_assinatura;
      const txt = (messageText || "").toLowerCase().trim();
      const confirmou = /\b(pronto|prontinho|conclu[ií]do|conclui|conclu[ií]|finalizei|terminei|fiz|feito|ok|certo|sim)\b/.test(txt);
      if (confirmou && link) {
        updates.facial_confirmed_at = new Date().toISOString();
        updates.conversation_step = "complete";
        updates.status = "cadastro_concluido";
        reply = "🎉 *Cadastro concluído com sucesso!*\n\nRecebemos a confirmação da sua validação facial. ✅\n\nEm breve você receberá os próximos passos da iGreen Energy. Obrigado por confiar em nós! ☀️💚";
      } else if (link) {
        reply = "📸 *Última etapa: Validação Facial*\n\n👉 Abra este link no seu celular e siga as instruções:\n" + `${link}\n\n` + "Quando terminar a selfie, me responda *PRONTO* aqui que finalizamos seu cadastro! ✅";
      } else {
        reply = "⏳ Estamos preparando o link da validação facial. Você será notificado em instantes!";
      }
      break;
    }

    case "complete": {
      // Mensagem padrão se a admin não tiver configurado um passo "finalizar_cadastro"
      // no FluxoCamila. Se tiver, usa o message_text do passo dela.
      let parabens = "✅ Seus dados já foram registrados! Se precisar de algo, um consultor entrará em contato. ☀️";
      try {
        const { data: flow } = await supabase
          .from("bot_flows").select("id")
          .eq("consultant_id", customer.consultant_id || consultorId)
          .eq("is_active", true).order("created_at", { ascending: true })
          .limit(1).maybeSingle();
        if (flow?.id) {
          const { data: passo } = await supabase
            .from("bot_flow_steps")
            .select("message_text")
            .eq("flow_id", flow.id)
            .eq("step_type", "finalizar_cadastro")
            .eq("is_active", true)
            .order("position", { ascending: true })
            .limit(1).maybeSingle();
          const txt = (passo?.message_text || "").trim();
          if (txt) {
            parabens = txt
              .replaceAll("{{nome}}", (customer.name || "").split(/\s+/)[0] || "")
              .replaceAll("{{representante}}", nomeRepresentante || "");
          }
        }
      } catch (e) {
        console.warn("[complete] busca de passo finalizar_cadastro falhou:", (e as Error).message);
      }
      reply = parabens;
      break;
    }

    default: {
      console.warn(`⚠️ Step desconhecido: ${step} — resetando para aguardando_conta`);
      if (step?.startsWith("editing_")) {
        reply = "❌ Opção inválida. Digite novamente:";
      } else {
        updates.conversation_step = "aguardando_conta";
        reply = `👋 Olá! Eu sou o assistente de *${nomeRepresentante}* em parceria com a *iGreen Energy*!\n\n📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!\n\nFormatos aceitos: JPG, PNG ou PDF`;
      }
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-FINALIZAÇÃO (BLOCO ESPECIAL — extraído verbatim do index.ts antigo)
  // ═══════════════════════════════════════════════════════════════════
  if (updates.conversation_step === "finalizando") {
    // ── AUTO-CONFIRM: Se o cliente chegou até aqui pelo WhatsApp e tem telefone válido,
    // garantir que phone_contact_confirmed=true e phone_landline está preenchido.
    // Evita o bug do Valdeir onde o campo não existia na época do cadastro.
    if (!customer.phone_contact_confirmed && !updates.phone_contact_confirmed) {
      const p = (customer.phone_whatsapp || phone || "").replace(/\D/g, "");
      const num = p.startsWith("55") && p.length >= 12 ? p.substring(2) : p;
      if (num.length >= 10) {
        updates.phone_contact_confirmed = true;
        updates.phone_landline = num.length === 11
          ? num.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
          : num.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
        console.log(`📞 [AUTO-CONFIRM] Telefone auto-confirmado para finalização: ${updates.phone_landline}`);
      }
    }

    // Carregar dados do consultor dono para validação reforçada
    let consultantRow: any = null;
    try {
      const { data: c } = await supabase
        .from("consultants")
        .select("id, phone, igreen_portal_email, cadastro_url")
        .eq("id", customer.consultant_id || consultorId)
        .maybeSingle();
      consultantRow = c;
    } catch (_) { /* segue sem checar */ }

    const merged = {
      ...customer,
      ...updates,
      // Injeta dados do consultor para que validateCustomerForPortal possa comparar
      consultant_email: consultantRow?.igreen_portal_email || null,
      consultant_phone: consultantRow?.phone || null,
    };
    const validation = validateCustomerForPortal(merged);
    if (!validation.valid) {
      logStructured("warn", "validation_failed", {
        customer_id: customer.id, step: "finalizando", errors: validation.errors,
      });
      
      // ── ANTI-LOOP: Se já redirecionou 1+ vez, forçar finalização (evita ping-pong ask_email⇄ask_finalizar) ──
      // Usa rescue_attempts como contador (coluna já existente) para não depender de coluna nova
      const redirectCount = customer.rescue_attempts || 0;
      if (redirectCount >= 1) {
        console.warn(`⚠️ [ANTI-LOOP] ${customer.id} já foi redirecionado ${redirectCount}x. Forçando finalização.`);
        logStructured("warn", "force_finalize_after_redirects", {
          customer_id: customer.id, errors: validation.errors, redirects: redirectCount,
        });
        // Não redirecionar mais — seguir pro portal mesmo com erros
      } else {
        updates.rescue_attempts = redirectCount + 1;
        
        let redirected = false;
        for (const err of validation.errors) {
        // ── Email: placeholder, formato, consultor, ou ausente → volta a perguntar ──
        if (err.includes("Email")) {
          updates.conversation_step = "ask_email";
          reply = `⚠️ ${err}\n\nInforme um *e-mail pessoal real* (ex: nome@gmail.com):`;
          redirected = true; break;
        }
        // ── Telefone não confirmado / placeholder / DDD inválido / do consultor ──
        if (err.includes("Telefone") || err.includes("telefone")) {
          updates.conversation_step = "ask_phone_confirm";
          reply = `⚠️ ${err}\n\nPreciso confirmar seu telefone de contato. Aguarde a próxima mensagem...`;
          redirected = true; break;
        }
        if (err.includes("CPF")) { updates.conversation_step = "ask_cpf"; reply = `⚠️ ${err}\n\nQual o seu *CPF*? (apenas números)`; redirected = true; break; }
        if (err.includes("RG")) { updates.conversation_step = "ask_rg"; reply = `⚠️ ${err}\n\nQual o seu *RG*?`; redirected = true; break; }
        if (err.includes("CEP")) { updates.conversation_step = "ask_cep"; reply = `⚠️ ${err}\n\nQual o seu *CEP*? (8 dígitos)`; redirected = true; break; }
        if (err.includes("rua") || err.includes("Endereço")) { updates.conversation_step = "editing_conta_endereco"; reply = `⚠️ ${err}\n\nDigite o *endereço completo*:`; redirected = true; break; }
        if (err.includes("Número")) { updates.conversation_step = "ask_number"; reply = `⚠️ ${err}\n\nQual o *número* da residência?`; redirected = true; break; }
        if (err.includes("Bairro")) { updates.conversation_step = "editing_conta_endereco"; reply = `⚠️ ${err}\n\nDigite o *endereço completo* (rua, número, bairro):`; redirected = true; break; }
        if (err.includes("Cidade")) { updates.conversation_step = "ask_cep"; reply = `⚠️ ${err}\n\nInforme o *CEP* correto para completar a cidade:`; redirected = true; break; }
        if (err.includes("Estado")) { updates.conversation_step = "ask_cep"; reply = `⚠️ ${err}\n\nInforme o *CEP* correto:`; redirected = true; break; }
        if (err.includes("Valor")) { updates.conversation_step = "ask_bill_value"; reply = `⚠️ ${err}\n\nQual o *valor* da sua conta de luz?`; redirected = true; break; }
        if (err.includes("Foto da conta")) { updates.conversation_step = "aguardando_conta"; reply = `⚠️ ${err}\n\n📸 Envie a foto da conta de energia:`; redirected = true; break; }
        if (err.includes("Documento") && err.includes("frente")) { updates.conversation_step = "ask_doc_frente_manual"; reply = `⚠️ ${err}\n\n📸 Envie a frente do documento:`; redirected = true; break; }
        if (err.includes("Documento") && err.includes("verso")) { updates.conversation_step = "ask_doc_verso_manual"; reply = `⚠️ ${err}\n\n📸 Envie o verso do documento:`; redirected = true; break; }
        if (err.includes("Nome")) { updates.conversation_step = "ask_name"; reply = `⚠️ ${err}\n\nQual é o seu *nome completo*?`; redirected = true; break; }
      }
      if (!redirected) {
        const firstError = validation.errors[0] || "Dados incompletos";
        updates.conversation_step = "ask_name";
        reply = `⚠️ ${firstError}\n\nQual é o seu *nome completo*?`;
      }
      // Se o passo redirecionado for ask_phone_confirm, reenviar os botões aqui
      if (updates.conversation_step === "ask_phone_confirm") {
        const msgConfirm = getReplyForStep("ask_phone_confirm", { ...merged, phone_whatsapp: phone });
        await sendOptions(remoteJid, msgConfirm, [
          { id: "sim_phone", title: "✅ Sim, é meu" },
          { id: "editar_phone", title: "✏️ Usar outro número" },
        ]);
        reply = "";
      }
      } // fecha else do anti-loop
    } else {
      updates.possui_procurador = false;
      updates.conta_pdf_protegida = false;
      updates.debitos_aberto = false;
      updates.status = "portal_submitting";
      updates.conversation_step = "portal_submitting";

      if (isTestMode()) {
        reply = "✅ *Teste concluído:* todos os dados foram coletados e o lead chegou ao ponto de envio para o portal.";
        return { reply, updates };
      }

      // ✅ Regenerar igreen_link a partir do cadastro_url do consultor dono
      // (impede o bug em que o lead é submetido com o link de outro consultor)
      if (consultantRow?.cadastro_url) {
        updates.igreen_link = consultantRow.cadastro_url;
        console.log(`🔗 igreen_link regenerado para consultor dono: ${consultantRow.id}`);
      }

      console.log(`📝 Salvando updates ANTES do portal worker para ${customer.id}:`, JSON.stringify(updates).substring(0, 500));
      const { error: saveError } = await supabase.from("customers").update(updates).eq("id", customer.id).select();
      if (saveError) console.error(`❌ ERRO ao salvar updates antes do portal:`, saveError);

      await sendText(remoteJid,
        "✅ *Todos os dados coletados com sucesso!* 🎉\n\n" +
        "⏳ Estamos processando seu cadastro no portal...\n\n" +
        "📱 Em breve você receberá um *código de verificação no WhatsApp*. Quando receber, *digite aqui*!\n\n" +
        "Obrigado pela confiança! ☀️🌱"
      );

      console.log(`✅ Lead completo: ${merged.name} (${merged.id}) - disparando worker-portal`);

      const { data: settingsRows } = await supabase.from("settings").select("*");
      const settings: Record<string, string> = {};
      settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });

      const portalWorkerUrl = (settings.portal_worker_url || Deno.env.get("PORTAL_WORKER_URL") || "").replace(/\/$/, "");
      const workerSecret = settings.worker_secret || settings.portal_worker_secret || Deno.env.get("WORKER_SECRET") || "";

      if (portalWorkerUrl && workerSecret) {
        let workerOnline = false;
        try {
          const healthRes = await fetchInsecure(`${portalWorkerUrl}/health`, { timeout: 5_000 });
          workerOnline = healthRes.ok;
          console.log(`🏥 Health check: ${healthRes.status} (online: ${workerOnline})`);
        } catch (e: any) {
          console.warn(`🏥 Health check falhou: ${e?.message}`);
        }

        if (!workerOnline) {
          logStructured("warn", "worker_offline", { customer_id: customer.id, url: portalWorkerUrl });
          console.warn("⚠️ Worker offline — lead ficará em fila para reprocessamento automático");
          await supabase.from("customers").update({ status: "worker_offline", error_message: "Worker offline no momento do envio" }).eq("id", customer.id);
          try {
            await sendText(remoteJid,
              "⏳ Estamos com um pequeno atraso no processamento. Em até *alguns minutos* você receberá o link para continuar pelo celular.\n\n" +
              "Se não receber em *10 minutos*, responda aqui que verificamos para você. Obrigado!"
            );
          } catch (_) {}
        } else {
          try {
            logStructured("info", "lead_complete", { customer_id: customer.id, step: "data_complete", worker: "dispatching" });
            await withRetry(
              async () => {
                const portalRes = await fetchInsecure(`${portalWorkerUrl}/submit-lead`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${workerSecret}` },
                  body: JSON.stringify({ customer_id: customer.id }),
                  timeout: 25_000,
                });
                const portalData = await portalRes.text();
                console.log(`📡 Worker-portal resposta (${portalRes.status}): ${portalData.substring(0, 200)}`);
                if (!portalRes.ok) {
                  logStructured("warn", "worker_portal_error", { customer_id: customer.id, status: portalRes.status, body: portalData.substring(0, 150) });
                  throw new Error(`Worker ${portalRes.status}: ${portalData.substring(0, 100)}`);
                }
              },
              { maxAttempts: 3, delayMs: 2000, retryOn: () => true }
            );
          } catch (e: any) {
            logStructured("error", "worker_portal_fetch_failed", { customer_id: customer.id, error: e?.message });
            console.error("⚠️ Erro ao disparar worker-portal (após 3 tentativas):", e?.message);
            await supabase.from("customers").update({ status: "worker_offline", error_message: `Worker falhou: ${e?.message?.substring(0, 200)}` }).eq("id", customer.id);
            try {
              await sendText(remoteJid,
                "⏳ Estamos com um pequeno atraso no processamento. Em até *alguns minutos* você receberá o link para continuar pelo celular.\n\n" +
                "Se não receber em *10 minutos*, responda aqui que verificamos para você. Obrigado!"
              );
            } catch (_) {}
          }
        }
      } else {
        logStructured("info", "lead_complete", { customer_id: customer.id, step: "data_complete", worker: "not_configured" });
        console.log("⚠️ PORTAL_WORKER_URL ou WORKER_SECRET não configurados - worker-portal terá que pegar via polling");
      }

      // Updates ja foram salvos acima — limpar para o caller nao salvar de novo
      for (const k of Object.keys(updates)) delete updates[k];
      // Marcar que o handler já enviou mensagem inline (evita fallback "Estou aqui!")
      updates.__inline_sent = true;
      reply = "";
    }
  }

  return { reply, updates };
}

// ── Test-only re-exports (não alteram comportamento) ──
export const __test = { sleepForMedia, fetchUrlToBase64, trigramSim };


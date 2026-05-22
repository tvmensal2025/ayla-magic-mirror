// Hardening determinístico em torno da IA conversacional. Cobre as
// cláusulas 2.27 (sanitizer com grounding), 2.28 (filtro de IDs de
// mídia), 2.29 (slot de áudio com fallback), 2.30 (fallback
// determinístico quando o LLM falha) e 2.31 (pré-condições de step) do
// `bugfix.md` deste spec, e a §6 do `design.md`.
//
// Filosofia:
// - Zero efeito colateral. Tudo aqui é puro: recebe contexto, retorna
//   decisão limpa. Logging/persistência fica no caller.
// - "Em dúvida, restringe": sanitizer zera reply quando detecta número
//   ou link sem grounding; validateNextStep mantém o passo atual
//   quando o proposto não existe.
// - Nunca permitir silêncio total: se sanitizer zerou tudo, o caller
//   chama `deterministicFallback` para garantir que algo seja enviado.

// ─── Tipos públicos ────────────────────────────────────────────────────

export interface KnowledgeSection {
  title?: string;
  body: string;
}

export interface GroundingContext {
  /** Trechos de `ai_knowledge_sections` ativos para o consultor. */
  knowledgeSections?: KnowledgeSection[];
  /** Campos do cliente (`customers.*`) — números/strings que podem ser citados. */
  customer?: Record<string, unknown>;
  /** Domínios permitidos para URLs (host completo, sem protocolo, ex.: "igreen.energy"). */
  allowedDomains?: string[];
  /** Números/strings adicionais autorizados (ex.: telefone do consultor). */
  allowedNumbers?: Array<string | number>;
}

/** Subset relevante da decisão da IA. Mantido leve de propósito para
 * não acoplar este módulo ao schema completo do `ai-agent-router`. */
export interface AiDecision {
  reply_text: string;
  next_step?: string;
  media_to_send_ids?: string[];
  audio_slot_key?: string;
  should_pause_seconds?: number;
}

export type StepPrecondition = (
  customer: Record<string, unknown>,
) => boolean;

// ─── 1) sanitizeHumanReply (cláusula 2.27) ─────────────────────────────

const BANNED_PHRASES = [
  // Identidade não-humana ou linguagem corporativa.
  /assistente\s+(virtual|digital)/i,
  /\bsou\s+(uma?\s+)?(ia|i\.a\.|inteligência\s+artificial)\b/i,
  /\bsou\s+(uma?\s+)?bot\b/i,
  // \b after `ô` doesn't fire (accented chars aren't \w), so we anchor
  // with explicit non-word lookaheads/end-of-string.
  /\bsou\s+um\s+rob[oô](?![a-zA-ZÀ-ÿ])/i,
  /\bcomo\s+(uma?\s+)?(ia|inteligência\s+artificial|bot|rob[oô])(?![a-zA-ZÀ-ÿ])/i,
  /como\s+posso\s+(te\s+)?ajudar/i,
  /fico\s+(à|a)\s+disposição/i,
  // "preço de R$" — número genérico sem grounding garantido. Captura
  // tentativas de mencionar preço fixo no plural ("preço de R$ 250").
  /pre[çc]o\s+de\s+r\$/i,
];

const MAX_REPLY_LEN = 280;

/**
 * Padrões de tokens numéricos cujo grounding deve ser checado contra
 * `ctx.knowledgeSections`/`ctx.customer`/`ctx.allowedNumbers`.
 *
 * Capturamos:
 *   - moeda BRL (R$ X, R$ X,YY, R$ X.XXX,YY)
 *   - percentual (X%, X,Y%)
 *   - durações com unidade reconhecida (X dias, X kWh, X reais, etc.)
 *
 * Inteiros ou decimais isolados sem unidade NÃO disparam o gate (ex.:
 * "1 minutinho" não é alegação verificável; já telefone/preço aparecem
 * com símbolos).
 */
const NUMERIC_PATTERN =
  /(?:r\$\s?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?)|(?:\d+(?:[.,]\d+)?\s*%)|(?:\d+(?:[.,]\d+)?\s*(?:kwh|reais|real|dias?|meses|m[êe]s|horas?|minutos?|anos?))/gi;

const URL_PATTERN = /https?:\/\/[^\s<>"'\)]+/gi;

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

function buildHaystack(ctx: GroundingContext): string {
  const parts: string[] = [];
  for (const k of ctx.knowledgeSections ?? []) {
    if (k?.title) parts.push(k.title);
    if (k?.body) parts.push(k.body);
  }
  if (ctx.customer) {
    for (const v of Object.values(ctx.customer)) {
      if (v == null) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        parts.push(String(v));
      }
    }
  }
  for (const n of ctx.allowedNumbers ?? []) parts.push(String(n));
  return parts.join(" \n ").toLowerCase();
}

function buildAllowedDigits(ctx: GroundingContext): Set<string> {
  const set = new Set<string>();
  const haystack = buildHaystack(ctx);
  // Extrai todas as sequências de dígitos do haystack — qualquer número
  // citado pela IA precisa ter sua sequência de dígitos presente nessas
  // sequências (substring match em dígitos puros, sem pontuação).
  const matches = haystack.match(/\d[\d]*/g) ?? [];
  for (const m of matches) set.add(m);
  return set;
}

function digitsAreGrounded(token: string, allowed: Set<string>): boolean {
  const d = digitsOnly(token);
  if (!d) return true; // sem dígitos => não há alegação numérica
  // Match substring: o token alegado pela IA precisa ser substring de
  // alguma sequência presente no haystack, ou alguma sequência do
  // haystack precisa conter o token. Aceitamos ambos os sentidos para
  // tolerar formatação diferente (ex.: "1.000" vs "1000").
  for (const ref of allowed) {
    if (ref.includes(d) || d.includes(ref) && ref.length >= 2) return true;
  }
  return false;
}

function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostIsAllowed(host: string, allowedDomains: string[]): boolean {
  const h = host.toLowerCase();
  for (const d of allowedDomains) {
    const dom = d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (h === dom || h.endsWith("." + dom)) return true;
  }
  return false;
}

/**
 * Aplica o pipeline de grounding sobre o texto humanizado da IA:
 *   1. trim + remoção de emoji-bot;
 *   2. zera se contiver frase proibida;
 *   3. zera se contiver número que não aparece em `ctx`;
 *   4. zera se contiver link cujo host não esteja em `ctx.allowedDomains`;
 *   5. trunca em 280 chars.
 *
 * "Zerar" significa retornar string vazia. O caller é quem decide o
 * fallback determinístico.
 */
export function sanitizeHumanReply(
  text: string,
  ctx: GroundingContext = {},
): string {
  let msg = (text || "").trim().replace(/🤖/g, "").trim();
  if (!msg) return "";

  for (const re of BANNED_PHRASES) {
    if (re.test(msg)) return "";
  }

  // Grounding numérico — se a IA citou número sem suporte, zera.
  const allowedDigits = buildAllowedDigits(ctx);
  const numericMatches = msg.match(NUMERIC_PATTERN) ?? [];
  for (const tok of numericMatches) {
    if (!digitsAreGrounded(tok, allowedDigits)) return "";
  }

  // Grounding de links — host precisa estar em allowedDomains.
  const allowedDomains = ctx.allowedDomains ?? [];
  const urlMatches = msg.match(URL_PATTERN) ?? [];
  for (const u of urlMatches) {
    const host = hostFromUrl(u);
    if (!host) return "";
    if (!hostIsAllowed(host, allowedDomains)) return "";
  }

  if (msg.length > MAX_REPLY_LEN) {
    msg = msg.slice(0, MAX_REPLY_LEN);
  }
  return msg;
}

// ─── 2) validateNextStep (cláusula 2.18) ───────────────────────────────

/**
 * Devolve `proposed` quando ele consta em `validSteps`; caso contrário,
 * devolve `currentStep` (mantém o cliente onde estava). Trim defensivo
 * para evitar discrepância por whitespace.
 */
export function validateNextStep(
  proposed: string | undefined,
  validSteps: ReadonlySet<string>,
  currentStep: string,
): string {
  const p = (proposed ?? "").trim();
  if (!p) return currentStep;
  if (validSteps.has(p)) return p;
  return currentStep;
}

// ─── 3) filterMediaIds (cláusula 2.28) ─────────────────────────────────

export interface FilterMediaIdsResult {
  kept: string[];
  dropped: string[];
}

/**
 * Particiona os IDs propostos pela IA em `kept` (presentes em
 * `relevantIds`) e `dropped` (alucinados). A garantia importante é
 * `kept ⊆ relevantIds` — testada via PBT.
 */
export function filterMediaIds(
  proposed: string[] | undefined,
  relevantIds: ReadonlySet<string>,
): FilterMediaIdsResult {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const raw of proposed ?? []) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    if (relevantIds.has(id)) kept.push(id);
    else dropped.push(id);
  }
  return { kept, dropped };
}

// ─── 4) validateAudioSlot (cláusula 2.29) ──────────────────────────────

const WELCOME_STEP = "welcome";
const BOAS_VINDAS_SLOT = "boas_vindas";

/**
 * Valida um `audio_slot_key`. Se for inválido em welcome E a fallback
 * `boas_vindas` está disponível, recupera para `boas_vindas`. Caso
 * contrário, devolve string vazia (caller decide se cai em
 * `reply_text` ou template).
 */
export function validateAudioSlot(
  slot: string | undefined,
  validSlots: ReadonlySet<string>,
  currentStep: string,
): string {
  const s = (slot ?? "").trim();
  if (s && validSlots.has(s)) return s;
  if (currentStep === WELCOME_STEP && validSlots.has(BOAS_VINDAS_SLOT)) {
    return BOAS_VINDAS_SLOT;
  }
  return "";
}

// ─── 5) checkPreconditions (cláusula 2.31) ─────────────────────────────

/**
 * Pré-condições de step. Cada entrada recebe `customers.*` e devolve
 * true se o customer pode entrar no step. Lista mínima do design;
 * `ai-agent-router` pode estender em runtime.
 */
export const STEP_PRECONDITIONS: Record<string, StepPrecondition> = {
  aguardando_facial: (c) => !!c.otp_validated_at,
  cadastro_portal: (c) =>
    !!c.electricity_bill_value && !!c.document_uploaded,
};

export interface PreconditionResult {
  ok: boolean;
  reason?: string;
}

/** Retorna `{ ok: true }` quando o step não tem pré-condição configurada. */
export function checkPreconditions(
  step: string,
  customer: Record<string, unknown>,
): PreconditionResult {
  const guard = STEP_PRECONDITIONS[step];
  if (!guard) return { ok: true };
  if (guard(customer)) return { ok: true };
  return { ok: false, reason: `precondition_failed:${step}` };
}

// ─── 6) deterministicFallback (cláusula 2.30) ──────────────────────────

const DEFAULT_FALLBACK_TEXT = "oii 😊 me dá um instantinho que eu te respondo";

/**
 * Decisão determinística usada quando o LLM falha (timeout/429/5xx) ou
 * quando todo o pipeline de validação esvazia a saída. Garante que algo
 * seja enviado ao cliente — nunca silêncio total.
 */
export function deterministicFallback(
  currentStep: string,
  stepTemplates?: Record<string, string>,
): AiDecision {
  const tpl = stepTemplates?.[currentStep];
  return {
    reply_text: tpl && tpl.trim().length > 0 ? tpl : DEFAULT_FALLBACK_TEXT,
    next_step: currentStep,
    media_to_send_ids: [],
    audio_slot_key: "",
    should_pause_seconds: 0,
  };
}

// ─── 7) isReachableFromCurrent + validateAiFallbackChoice (cláusula 2.19) ──

/**
 * Forma mínima de uma `transition` configurada em `bot_flow_steps`.
 * Mantida deliberadamente solta para tolerar nomes alternativos de
 * coluna (`next_step_key` ou `goto_step_key`) que aparecem em pontos
 * diferentes do código.
 */
export interface ReachableTransition {
  next_step_key?: string | null;
  goto_step_key?: string | null;
  goto_special?: string | null;
}

/** Especiais que o `aiDecideFallback` pode escolher por convenção (uppercase). */
const FALLBACK_SPECIAL_CHOICES: ReadonlySet<string> = new Set([
  "REPEAT",
  "HUMANO",
  "CADASTRO",
  "MENU",
]);

/**
 * Decide se `proposed` é alcançável a partir de `currentStep` dado o
 * conjunto de `transitions` configuradas no passo atual e a lista de
 * `specialGotos` permitidos por este caller (ex.: `["cadastro",
 * "humano", "menu"]`). Tolera as duas convenções de coluna
 * (`next_step_key` / `goto_step_key`).
 *
 * Regras:
 *   - `proposed === currentStep`         → alcançável (no-op)
 *   - escolha especial em uppercase      → alcançável (REPEAT/HUMANO/...)
 *   - `proposed` em `specialGotos`        → alcançável
 *   - `proposed` casa com next/goto      → alcançável
 *   - `proposed` casa com `goto_special` → alcançável
 *   - caso contrário                     → NÃO alcançável
 */
export function isReachableFromCurrent(
  proposed: string | undefined | null,
  currentStep: string,
  transitions: ReadonlyArray<ReachableTransition> | null | undefined,
  specialGotos?: ReadonlyArray<string> | null,
): boolean {
  const p = (proposed ?? "").trim();
  if (!p) return false;

  // Auto-loop ou escolha especial uppercase (REPEAT/HUMANO/CADASTRO/MENU)
  if (p === currentStep) return true;
  if (FALLBACK_SPECIAL_CHOICES.has(p)) return true;

  const specials = specialGotos ?? [];
  for (const s of specials) {
    if (s && s === p) return true;
  }

  for (const t of transitions ?? []) {
    if (!t) continue;
    if (t.next_step_key && t.next_step_key === p) return true;
    if (t.goto_step_key && t.goto_step_key === p) return true;
    if (t.goto_special && t.goto_special === p) return true;
  }
  return false;
}

/**
 * Wrapper de validação para aplicar APÓS o LLM do `aiDecideFallback`
 * retornar uma escolha. Aplica, em ordem:
 *
 *   1. alcançabilidade (`isReachableFromCurrent`);
 *   2. pré-condições do step (`checkPreconditions`).
 *
 * Em qualquer falha, devolve `"REPEAT"` — o convencional do
 * `aiDecideFallback` para "fica no passo atual". Logs estruturados são
 * deliberadamente responsabilidade do caller (mantém esta função pura
 * e fácil de testar).
 *
 * Escolhas especiais já em uppercase (REPEAT/HUMANO/CADASTRO/MENU) são
 * preservadas sem checar pré-condições, já que o caller resolve cada
 * uma para um caminho específico.
 */
export interface AiFallbackValidationResult {
  /** Escolha final a ser usada pelo caller (sempre uma string não-vazia). */
  choice: string;
  /** Razão de rebaixamento, quando aplicável. */
  downgradeReason?: "unreachable" | "precondition_failed";
  /** Ramo violado (preenchido quando `downgradeReason` é definido). */
  failedStep?: string;
  /** Detalhe da pré-condição violada, quando aplicável. */
  preconditionReason?: string;
}

export function validateAiFallbackChoice(
  proposed: string | undefined | null,
  currentStep: string,
  transitions: ReadonlyArray<ReachableTransition> | null | undefined,
  customer: Record<string, unknown> | null | undefined,
  specialGotos?: ReadonlyArray<string> | null,
): AiFallbackValidationResult {
  const p = (proposed ?? "").trim();
  if (!p) return { choice: "REPEAT" };

  // Escolhas especiais uppercase: passam direto, caller resolve cada uma.
  if (FALLBACK_SPECIAL_CHOICES.has(p)) return { choice: p };

  if (!isReachableFromCurrent(p, currentStep, transitions, specialGotos)) {
    return {
      choice: "REPEAT",
      downgradeReason: "unreachable",
      failedStep: p,
    };
  }

  const pre = checkPreconditions(p, customer ?? {});
  if (!pre.ok) {
    return {
      choice: "REPEAT",
      downgradeReason: "precondition_failed",
      failedStep: p,
      preconditionReason: pre.reason,
    };
  }

  return { choice: p };
}

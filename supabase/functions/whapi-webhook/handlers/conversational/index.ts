// Conversational flow entrypoint — Part 3 of the dynamic flow migration.
// Loads steps + transitions from `bot_flow_steps` (the table the FluxoCamila UI edits)
// and decides the next step from there. Falls back to the legacy hardcoded
// state machine if the consultant has no flow configured.

import type { BotContext, BotResult } from "../types.ts";
import { CONVERSATIONAL_STEPS, decideTransition, type ConversationalStep } from "./state-machine.ts";
import { classifyIntent } from "./intent-classifier.ts";
import { getTemplate, renderTemplate } from "./templates.ts";
import {
  extractValor, extractTelefone, extractCPF, extractNome, detectRegexIntents,
} from "../../../_shared/captureExtractors.ts";
import { getStepMediaOrder, makeKindComparator } from "../../../_shared/step-media-order.ts";
import { isTestMode } from "../../../_shared/test-mode.ts";

// Cache simples por (consultor) — quando IA degradar, pula chamadas por 60s.
const aiCooldown = new Map<string, number>();
function aiInCooldown(key: string): boolean {
  const until = aiCooldown.get(key);
  return !!until && Date.now() < until;
}
function setAiCooldown(key: string) {
  aiCooldown.set(key, Date.now() + 60_000);
}

export { CONVERSATIONAL_STEPS };

interface DbTransition {
  trigger_intent?: string | null;
  trigger_phrases?: string[] | null;
  goto_step_id?: string | null;
  goto_special?: string | null; // 'cadastro' | 'humano' | 'repeat' | null
}

interface DbCapture {
  field: "name" | "electricity_bill_value" | "phone_whatsapp" | "cpf";
  enabled?: boolean;
}

interface DbFallback {
  mode?: "repeat" | "goto" | "ai";
  goto_step_id?: string | null;
  ai_prompt?: string | null;
}

interface DbStep {
  id: string;
  step_key: string;
  step_type: string | null;
  message_text: string | null;
  text_delay_ms: number | null;
  slot_key: string | null;
  is_active: boolean;
  position: number;
  transitions: DbTransition[] | null;
  captures: DbCapture[] | null;
  fallback: DbFallback | null;
  auto_detect_doc_type: boolean | null;
  media_order?: string[] | null;
}

// Steps the bot must NEVER override (cadastro pipeline owns them)
export const CADASTRO_STEPS = new Set([
  "aguardando_conta", "processando_ocr_conta", "confirmando_dados_conta",
  "ask_tipo_documento", "aguardando_doc_auto", "aguardando_doc_frente", "aguardando_doc_verso",
  "confirmando_dados_doc", "ask_name", "ask_cpf", "ask_rg", "ask_birth_date",
  "ask_phone_confirm", "ask_phone", "ask_email", "ask_cep", "ask_number",
  "ask_complement", "ask_installation_number", "ask_bill_value",
  "ask_doc_frente_manual", "ask_doc_verso_manual", "ask_finalizar",
  "finalizando", "portal_submitting", "aguardando_otp", "validando_otp",
  "aguardando_assinatura", "complete", "aguardando_humano",
  // Edição pós-OCR (conta de luz)
  "editing_conta_menu","editing_conta_nome","editing_conta_endereco",
  "editing_conta_cep","editing_conta_distribuidora","editing_conta_instalacao","editing_conta_valor",
  // Edição pós-OCR (documento)
  "editing_doc_menu","editing_doc_nome","editing_doc_cpf","editing_doc_rg",
  "editing_doc_nascimento","editing_doc_pai","editing_doc_mae",
]);

interface LoadedFlow { flowId: string; steps: DbStep[]; strictMode: boolean; }

async function loadFlow(supabase: any, consultantId: string): Promise<LoadedFlow | null> {
  try {
    const { data: flow } = await supabase
      .from("bot_flows")
      .select("id, strict_mode")
      .eq("consultant_id", consultantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!flow?.id) {
      console.log(`[conversational] loadFlow: no active flow for consultant=${consultantId}`);
      return null;
    }

    const { data: steps, error: stepsErr } = await supabase
      .from("bot_flow_steps")
      .select("id, step_key, step_type, message_text, text_delay_ms, slot_key, is_active, position, transitions, captures, fallback, auto_detect_doc_type, media_order")
      .eq("flow_id", flow.id)
      .order("position", { ascending: true });
    if (stepsErr) {
      console.error("[conversational] loadFlow: steps query failed", stepsErr);
      return null;
    }
    const normalized = ((steps || []) as DbStep[]).map((step) => ({
      ...step,
      // Fluxos antigos podem ter step_key nulo; usa o id como chave estável
      // para o motor dinâmico não cair no fluxo legado.
      step_key: step.step_key || step.id,
    }));
    console.log(`[conversational] loadFlow: flow=${flow.id} steps=${normalized.length} strict=${!!(flow as any).strict_mode}`);
    return { flowId: flow.id as string, steps: normalized, strictMode: !!(flow as any).strict_mode };
  } catch (e) {
    console.error("[conversational] loadFlow failed", e);
    return null;
  }
}

// ─── Q&A matching (FAQ) ────────────────────────────────────────────────
// Procura uma pergunta cadastrada em bot_flow_qa que case com a mensagem do
// lead. Quando casa, manda mídia + texto e MANTÉM o passo atual (repete),
// igual ao comportamento de FAQ do bot-flow legado.
const _norm = (s: string) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

async function matchQA(
  supabase: any,
  flowId: string,
  consultantId: string,
  messageText: string,
): Promise<{ text: string; mediaUrls: { url: string; kind: string; mediaId: string | null }[] } | null> {
  const normalized = _norm(messageText);
  if (!normalized || normalized.length < 2) return null;
  try {
    const { data: qaRows } = await supabase
      .from("bot_flow_qa")
      .select("id, text_response, is_closing")
      .eq("flow_id", flowId)
      .eq("is_opening", false);
    const qaIds = ((qaRows as any[]) || []).map((q) => q.id);
    if (!qaIds.length) return null;

    const { data: triggers } = await supabase
      .from("bot_flow_qa_triggers")
      .select("qa_id, phrase")
      .in("qa_id", qaIds);
    const hit = ((triggers as any[]) || []).find((t) => {
      const phrase = _norm(t.phrase);
      return phrase && (normalized === phrase || normalized.includes(phrase) || phrase.includes(normalized));
    });
    if (!hit) return null;

    const qa = ((qaRows as any[]) || []).find((q) => q.id === hit.qa_id);
    if (!qa) return null;

    const { data: mediaRows } = await supabase
      .from("bot_flow_qa_media")
      .select("media_kind, slot_key, media_id, position")
      .eq("qa_id", qa.id)
      .order("position");

    const mediaUrls: { url: string; kind: string; mediaId: string | null }[] = [];
    for (const m of ((mediaRows as any[]) || [])) {
      let url: string | null = null;
      let mediaId: string | null = m.media_id || null;
      let kind = ["audio", "video", "image"].includes(m.media_kind) ? m.media_kind : "document";
      if (m.media_id) {
        const { data: mr } = await supabase
          .from("ai_media_library").select("url, kind").eq("id", m.media_id).maybeSingle();
        if (mr?.url) { url = mr.url; if (mr.kind) kind = mr.kind; }
      }
      if (!url && m.slot_key) {
        const { data: personal } = await supabase
          .from("ai_media_library").select("id, url")
          .eq("consultant_id", consultantId).eq("slot_key", m.slot_key)
          .eq("active", true).limit(1).maybeSingle();
        if (personal?.url) { url = personal.url; mediaId = personal.id || mediaId; }
      }
      if (url) mediaUrls.push({ url, kind, mediaId });
    }

    return { text: String(qa.text_response || "").trim(), mediaUrls };
  } catch (e) {
    console.error("[conversational] matchQA failed", e);
    return null;
  }
}

async function sleepForMedia(kind: string, durationSec?: number | null, delayBeforeMs?: number | null): Promise<void> {
  if (isTestMode()) return; // 🧪 modo teste: zero espera
  const configuredDelay = Number(delayBeforeMs || 0);
  if (configuredDelay > 0) {
    await new Promise((r) => setTimeout(r, Math.min(configuredDelay, 60_000)));
    return;
  }
  if (kind === "audio") {
    await new Promise((r) => setTimeout(r, Math.min(((durationSec && durationSec > 0) ? durationSec : 7) * 1000, 120_000)));
    return;
  }
  if (kind === "video") {
    await new Promise((r) => setTimeout(r, Math.min(((durationSec && durationSec > 0) ? durationSec : 30) * 1000, 90_000)));
    return;
  }
  await new Promise((r) => setTimeout(r, 1500));
}

// ---------------------------------------------------------------------------
// Capture phase — usa extractors compartilhados (regex + extenso + validação)
// ---------------------------------------------------------------------------
interface ExtractedCaptures {
  electricity_bill_value?: number;
  phone_whatsapp?: string;
  cpf?: string;
  name?: string;
}

function extractCaptures(messageText: string, configured: DbCapture[]): ExtractedCaptures {
  const out: ExtractedCaptures = {};
  if (!messageText) return out;
  const enabled = new Set((configured || []).filter(c => c.enabled !== false).map(c => c.field));
  if (enabled.has("electricity_bill_value")) {
    const v = extractValor(messageText);
    if (v != null) out.electricity_bill_value = v;
  }
  if (enabled.has("phone_whatsapp")) {
    const p = extractTelefone(messageText);
    if (p) out.phone_whatsapp = p;
  }
  if (enabled.has("cpf")) {
    const c = extractCPF(messageText);
    if (c) out.cpf = c;
  }
  if (enabled.has("name")) {
    const n = extractNome(messageText);
    if (n) out.name = n;
  }
  return out;
}

function matchTransition(step: DbStep, intents: string[], messageText: string): DbTransition | null {
  const transitions = Array.isArray(step.transitions) ? step.transitions : [];
  const text = (messageText || "").toLowerCase();
  // 1) match against any of the candidate intents (regex-derived + classifier-derived)
  for (const t of transitions) {
    if (!t.trigger_intent || t.trigger_intent === "default" || t.trigger_intent === "palavra_chave") continue;
    if (intents.includes(t.trigger_intent)) return t;
  }
  // 2) keyword match (palavra_chave OR any rule with phrases)
  for (const t of transitions) {
    const phrases = Array.isArray(t.trigger_phrases) ? t.trigger_phrases : [];
    for (const p of phrases) {
      const needle = (p || "").toLowerCase().trim();
      if (needle && text.includes(needle)) return t;
    }
  }
  return null;
}

async function aiDecideFallback(
  prompt: string,
  messageText: string,
  candidates: { id: string; step_key: string; title?: string }[],
  geminiApiKey: string | undefined,
  cooldownKey: string,
): Promise<string | null> {
  if (!geminiApiKey || !prompt) return null;
  if (aiInCooldown(cooldownKey)) {
    console.warn("[conversational] AI fallback skipped (cooldown active)");
    return null;
  }
  const validKeys = candidates.map(c => c.step_key);
  const enumKeys = [...validKeys, "REPEAT", "HUMANO", "CADASTRO"];

  const sys = `Você decide o próximo passo de um fluxo de WhatsApp.
Instrução do consultor: ${prompt}

Mensagem do cliente: "${messageText}"

Passos válidos: ${enumKeys.join(", ")}

Responda em JSON: {"next_step_key": "<um_dos_passos_válidos>", "reason": "breve"}.`;

  const callOnce = async (timeoutMs: number): Promise<string | null> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: sys }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 80,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  next_step_key: { type: "STRING", enum: enumKeys },
                  reason: { type: "STRING" },
                },
                required: ["next_step_key"],
              },
            },
          }),
          signal: ctrl.signal,
        },
      );
      if (res.status === 429) { setAiCooldown(cooldownKey); return null; }
      if (!res.ok) return null;
      const json: any = await res.json();
      const txt = (json?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (!txt) return null;
      try {
        const parsed = JSON.parse(txt);
        const choice = String(parsed?.next_step_key || "").trim();
        return enumKeys.includes(choice) ? choice : null;
      } catch {
        // fallback: extrai primeira palavra que casa com enum
        const first = txt.split(/[\s,"]+/).find((w: string) => enumKeys.includes(w));
        return first || null;
      }
    } catch (e) {
      console.error("[conversational] aiDecideFallback failed", (e as Error).message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // Tentativa 1 (4s) → se falhar, retry curto (3s)
  const first = await callOnce(4000);
  if (first) return first;
  return await callOnce(3000);
}

async function sendStepMedia(ctx: BotContext, step: DbStep, consultantId: string): Promise<boolean> {
  const slotKey = step.slot_key || step.step_key || step.id;
  if (!slotKey) return false;

  const { data: mediaRows } = await ctx.supabase
    .from("ai_media_library")
    .select("id, kind, label, url, slot_key, send_order, duration_sec, delay_before_ms")
    .eq("consultant_id", consultantId)
    .eq("slot_key", slotKey)
    .eq("active", true)
    .order("send_order", { ascending: true });

  const medias = ((mediaRows as any[]) || []).filter((m) => !!m?.url);
  if (medias.length === 0) return false;

  const configuredOrder = Array.isArray(step.media_order) && step.media_order.length > 0
    ? step.media_order.map((k) => String(k).toLowerCase())
    : await getStepMediaOrder(ctx.supabase, consultantId, slotKey);
  if (configuredOrder) medias.sort(makeKindComparator((m: any) => m.kind, configuredOrder));

  let sent = false;
  for (let i = 0; i < medias.length; i++) {
    const m = medias[i];
    const kind = ["audio", "video", "image"].includes(String(m.kind)) ? String(m.kind) : "document";

    // 🚫 REGRA: nunca repetir o mesmo áudio/vídeo para o mesmo cliente
    if ((kind === "audio" || kind === "video") && m.id) {
      const { data: canSend } = await ctx.supabase.rpc("try_log_media_send", {
        _consultant_id: consultantId,
        _customer_id: ctx.customer.id,
        _media_id: m.id,
        _slot_key: slotKey,
        _kind: kind,
      });
      if (canSend === false) {
        console.log(`[conversational] ⏭️ pulando ${kind} já enviado (media_id=${m.id}) para customer=${ctx.customer.id}`);
        continue;
      }
    }

    const ok = await ctx.sender.sendMedia(ctx.remoteJid, m.url, "", kind);
    if (ok !== false) {
      sent = true;
      await ctx.supabase.from("conversations").insert({
        customer_id: ctx.customer.id,
        message_direction: "outbound",
        message_text: `[flow-step:${step.step_key}:${kind}]`,
        message_type: kind,
        conversation_step: step.step_key,
      });
    }
    if (i < medias.length - 1) await sleepForMedia(kind, Number(m.duration_sec || 0) || null, Number(m.delay_before_ms || 0) || null);
  }
  return sent;
}

export async function runConversationalFlow(ctx: BotContext): Promise<BotResult> {
  const stepKey = (ctx.customer.conversation_step || "welcome") as string;

  // Cadastro steps are NEVER handled here — defensive guard
  if (CADASTRO_STEPS.has(stepKey)) {
    return { reply: "", updates: {} };
  }

  // bot_flows / bot_flow_steps / bot_flow_qa use the consultant UUID (customer.consultant_id),
  // NOT the iGreen numeric id (consultorId). Prefer the UUID; fall back to consultorId only as last resort.
  const consultantId = ctx.customer?.consultant_id || (ctx as any).consultorId;
  const loaded = consultantId ? await loadFlow(ctx.supabase, consultantId) : null;
  console.log(`[conversational] entry stepKey="${stepKey}" consultantId=${consultantId} dbSteps=${loaded?.steps?.length ?? 0}`);

  // Fallback to legacy hardcoded machine if no flow seeded
  if (!loaded || loaded.steps.length === 0) {
    console.log(`[conversational] → falling back to LEGACY (no dynamic flow)`);
    return runLegacyConversational(ctx);
  }
  const dbSteps = loaded.steps;
  const flowId = loaded.flowId;
  const strictMode = loaded.strictMode;

  // Helper: encontra o primeiro step ativo de um determinado step_type
  // (usado para resolver goto_special='cadastro' — preferimos ir para o
  // passo configurado de captura de documento, em vez de pular pra conta).
  const findActiveByType = (t: string) => dbSteps.find((s) => s.is_active && s.step_type === t);

  const firstActive = dbSteps.find((s) => s.is_active) || dbSteps[0];
  // Lookup robusto: tenta por id (preferido — estável) e por step_key (compat reversa).
  // O orchestrator passa stepKey já com prefixo strippado; pode ser UUID, "passo_xxx" ou nome canônico.
  const currentStep =
    dbSteps.find((s) => s.id === stepKey) ||
    dbSteps.find((s) => s.step_key === stepKey);
  if (!currentStep) {
    // Unknown/legacy step → restart at the first active dynamic step.
    console.log(`[conversational] unknown step="${stepKey}" → restart at firstActive=${firstActive?.id} (steps=${dbSteps.length})`);
    const mediaSent = await sendStepMedia(ctx, firstActive, consultantId);
    const tpl = (firstActive.message_text || "").trim();
    const fallbackGreeting = mediaSent ? "" : `Oi${ctx.customer.name ? " " + String(ctx.customer.name).split(" ")[0] : ""}! 👋`;
    const reply = tpl
      ? renderTemplate(tpl, {
          nome: ctx.customer.name,
          representante: ctx.nomeRepresentante,
          valor_conta: (ctx.customer as any).electricity_bill_value,
          telefone: ctx.customer.phone_whatsapp,
          cpf: (ctx.customer as any).cpf,
        })
      : fallbackGreeting;
    return {
      reply,
      // Grava o id (estável) — o orchestrator prefixa "flow:" antes de persistir.
      updates: { conversation_step: firstActive.id, __inline_sent: mediaSent || undefined },
    };
  }

  // ─── Q&A FAQ matching ───────────────────────────────────────────────
  // Antes de classificar intenção, vê se a mensagem casa com uma pergunta
  // cadastrada no Flow Builder. Se casar, responde e MANTÉM o passo atual.
  const qaHit = await matchQA(ctx.supabase, flowId, consultantId, ctx.messageText || "");
  if (qaHit) {
    console.log(`[conversational] QA hit at step="${stepKey}"`);
    // Envia mídia inline (se houver) — texto vai pelo retorno padrão
    for (const m of qaHit.mediaUrls) {
      try { await ctx.sender.sendMedia(ctx.remoteJid, m.url, "", m.kind); } catch (_) {}
    }
    return {
      reply: renderTemplate(qaHit.text || "", {
        nome: ctx.customer.name,
        representante: ctx.nomeRepresentante,
        valor_conta: (ctx.customer as any).electricity_bill_value,
        telefone: ctx.customer.phone_whatsapp,
        cpf: (ctx.customer as any).cpf,
      }),
      updates: { conversation_step: stepKey, __inline_sent: qaHit.mediaUrls.length > 0 || undefined },
    };
  }

  const cls = await classifyIntent(ctx.messageText, stepKey as ConversationalStep, ctx.geminiApiKey);

  // ---------------------------------------------------------------------------
  // Capture phase — extract data the consultor configured for this step
  // ---------------------------------------------------------------------------
  const captureUpdates: Record<string, any> = {};
  try {
    const extracted = extractCaptures(ctx.messageText || "", currentStep.captures || []);
    if (extracted.electricity_bill_value != null) captureUpdates.electricity_bill_value = extracted.electricity_bill_value;
    if (extracted.phone_whatsapp && !ctx.customer.phone_whatsapp) captureUpdates.phone_whatsapp = extracted.phone_whatsapp;
    if (extracted.cpf) captureUpdates.cpf = extracted.cpf;
    if (extracted.name && !ctx.customer.name) captureUpdates.name = extracted.name;

    if (Object.keys(captureUpdates).length > 0 && ctx.customer.id) {
      await ctx.supabase.from("customers").update(captureUpdates).eq("id", ctx.customer.id);
    }
  } catch (e) {
    console.error("[conversational] capture phase failed", e);
  }

  // Global overrides: cadastro / humano keywords win in any step
  if (cls.intent === "quer_cadastrar") {
    return {
      reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_conta", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates },
    };
  }
  if (cls.intent === "quer_humano") {
    return {
      reply: await getTemplate(ctx.supabase, "aguardando_humano", "avisado", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_humano", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates },
    };
  }

  // Build candidate intent list: classifier intent + regex-derived intents
  const candidateIntents = [cls.intent, ...detectRegexIntents(ctx.messageText || "")];
  const transition = matchTransition(currentStep, candidateIntents, ctx.messageText);

  const vars = {
    nome: captureUpdates.name || ctx.customer.name,
    representante: ctx.nomeRepresentante,
    valor_conta: captureUpdates.electricity_bill_value ?? (ctx.customer as any).electricity_bill_value,
    telefone: captureUpdates.phone_whatsapp || ctx.customer.phone_whatsapp,
    cpf: captureUpdates.cpf || (ctx.customer as any).cpf,
  };

  // Mapeia step_type especial → primeiro conversation_step do pipeline de cadastro
  // (definido em bot-flow.ts). O lead recebe o texto/mídia configurado no passo
  // E em seguida cai no estado correto para a Camila pedir conta/doc/finalizar.
  const stepTypeToCadastro = (st: string | null | undefined): string | null => {
    if (st === "capture_conta") return "aguardando_conta";
    if (st === "capture_documento") return "aguardando_doc_auto"; // novo: detecta tipo automaticamente
    if (st === "capture_email") return "ask_email";
    if (st === "confirm_phone") return "ask_phone_confirm";
    if (st === "finalizar_cadastro") return "ask_finalizar";
    return null;
  };

  // Helper — render and return a step (respeita text_delay_ms configurado no passo)
  const goToStep = async (s: DbStep, extra: Record<string, any> = {}) => {
    const delay = Math.max(0, Math.min(60000, s.text_delay_ms ?? 1500));
    if (delay > 0 && !isTestMode()) await new Promise((r) => setTimeout(r, delay));
    const mediaSent = await sendStepMedia(ctx, s, consultantId);
    const cadastroStep = stepTypeToCadastro(s.step_type);
    // Se for um passo especial (capture_conta/documento/finalizar), o conversation_step
    // salvo já é o do pipeline de cadastro — assim a próxima mensagem do lead cai direto
    // no bot-flow.ts e segue o fluxo de OCR / portal / OTP.
    // cadastroStep retorna nome canônico (ex.: "aguardando_conta") — orchestrator prefixa "sys:".
    // Caso contrário, gravamos s.id (estável) em vez de step_key, e orchestrator prefixa "flow:".
    const nextConversationStep = cadastroStep || s.id;
    return {
      reply: renderTemplate(s.message_text || "", vars),
      updates: { conversation_step: nextConversationStep, __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, __inline_sent: mediaSent || undefined, ...extra },
    };
  };
  const repeatCurrent = () => goToStep(currentStep);

  // Resolve a transition (special or step) to a BotResult
  const resolveTransition = async (t: DbTransition): Promise<BotResult> => {
    if (t.goto_special === "cadastro") {
      // Preferência: se o fluxo do consultor tem um passo de captura de documento
      // ativo, vamos para ele (segue o desenho da UI). Cai no aguardando_conta
      // só se realmente não houver passo de cadastro configurado.
      const docStep = findActiveByType("capture_documento");
      if (docStep) return goToStep(docStep);
      const contaStep = findActiveByType("capture_conta");
      if (contaStep) return goToStep(contaStep);
      return {
        reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
        updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates },
      };
    }
    if (t.goto_special === "humano") {
      return {
        reply: await getTemplate(ctx.supabase, "aguardando_humano", "avisado", vars),
        updates: { conversation_step: "aguardando_humano", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates },
      };
    }
    if (t.goto_special === "repeat" || (!t.goto_step_id && !t.goto_special)) return repeatCurrent();
    const nextStep = dbSteps.find((s) => s.id === t.goto_step_id);
    if (!nextStep || !nextStep.is_active) return repeatCurrent();
    if (nextStep.step_key === "cadastro" || CADASTRO_STEPS.has(nextStep.step_key)) {
      const docStep = findActiveByType("capture_documento");
      if (docStep) return goToStep(docStep);
      return {
        reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
        updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates },
      };
    }
    return goToStep(nextStep);
  };

  // 1) A regular rule matched
  if (transition) return resolveTransition(transition);

  // 2) FALLBACK (Plano B)
  const fb = currentStep.fallback || { mode: "repeat" };
  if (fb.mode === "goto" && fb.goto_step_id) {
    const nextStep = dbSteps.find((s) => s.id === fb.goto_step_id);
    if (nextStep && nextStep.is_active) {
      if (nextStep.step_key === "cadastro" || CADASTRO_STEPS.has(nextStep.step_key)) {
        return {
          reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
          updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates },
        };
      }
      return goToStep(nextStep);
    }
  }
  if (fb.mode === "ai" && fb.ai_prompt && !strictMode) {
    const candidates = dbSteps.filter(s => s.is_active && s.id !== currentStep.id).map(s => ({ id: s.id, step_key: s.step_key }));
    const choice = await aiDecideFallback(fb.ai_prompt, ctx.messageText || "", candidates, ctx.geminiApiKey, consultantId || "global");
    if (choice) {
      const upper = choice.toUpperCase();
      if (upper === "REPEAT") return repeatCurrent();
      if (upper === "HUMANO") return resolveTransition({ goto_special: "humano" } as DbTransition);
      if (upper === "CADASTRO") return resolveTransition({ goto_special: "cadastro" } as DbTransition);
      const nextStep = dbSteps.find(s => s.step_key === choice);
      if (nextStep && nextStep.is_active) return goToStep(nextStep);
    }
  } else if (fb.mode === "ai" && strictMode) {
    console.log(`[conversational] strict_mode=true → fallback IA ignorado, usando repeat`);
  }

  // Auto-advance se o passo não tem transições configuradas E intenção positiva
  const noTransitionsConfigured = !Array.isArray(currentStep.transitions) || currentStep.transitions.length === 0;
  const positiveIntent = ["afirmacao", "saudacao", "quer_cadastrar", "ja_assistiu_video"].includes(cls.intent);
  if (noTransitionsConfigured && positiveIntent) {
    const nextByPosition = dbSteps.find((s) => s.is_active && s.position > currentStep.position);
    if (nextByPosition) {
      console.log(`[conversational] auto-advance ${currentStep.step_key} → ${nextByPosition.step_key} (no transitions, intent=${cls.intent})`);
      if (nextByPosition.step_key === "cadastro" || CADASTRO_STEPS.has(nextByPosition.step_key)) {
        const docStep = findActiveByType("capture_documento");
        if (docStep) return goToStep(docStep);
        return {
          reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
          updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates },
        };
      }
      return goToStep(nextByPosition);
    }
  }

  // Default: repeat
  return repeatCurrent();
}

// Legacy hardcoded path — preserved for consultants without a custom flow.
async function runLegacyConversational(ctx: BotContext): Promise<BotResult> {
  const step = (ctx.customer.conversation_step || "welcome") as ConversationalStep;
  if (!CONVERSATIONAL_STEPS.has(step)) return { reply: "", updates: {} };

  const cls = await classifyIntent(ctx.messageText, step, ctx.geminiApiKey);
  const transition = decideTransition(step, cls.intent, ctx.customer);
  const vars = { nome: ctx.customer.name, representante: ctx.nomeRepresentante };
  let reply = "";
  if (transition.action.type === "send_template") {
    reply = await getTemplate(ctx.supabase, transition.action.step_key, transition.action.template_key, vars);
  }
  return {
    reply,
    updates: {
      conversation_step: transition.nextStep,
      __intent: cls.intent,
      __confidence: cls.confidence,
    },
  };
}

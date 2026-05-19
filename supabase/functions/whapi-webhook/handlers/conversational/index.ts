// Conversational flow entrypoint — Part 3 of the dynamic flow migration.
// Loads steps + transitions from `bot_flow_steps` (the table the FluxoCamila UI edits)
// and decides the next step from there. Falls back to the legacy hardcoded
// state machine if the consultant has no flow configured.

import type { BotContext, BotResult } from "../types.ts";
import { CONVERSATIONAL_STEPS, decideTransition, type ConversationalStep } from "./state-machine.ts";
import { classifyIntent } from "./intent-classifier.ts";
import { getTemplate, renderTemplate } from "./templates.ts";
import {
  extractValor, extractValorPermissivo, extractTelefone, extractCPF, extractNome, detectRegexIntents,
} from "../../../_shared/captureExtractors.ts";
import { getStepMediaOrder, makeKindComparator } from "../../../_shared/step-media-order.ts";
import { isTestMode } from "../../../_shared/test-mode.ts";
import { evaluateRules, logRuleFire, _consumeCustomerRateLimit } from "./rules-engine.ts";
import { answerFaqWithAI } from "../../../_shared/ai-faq-answerer.ts";
import { ensureAudioTranscript } from "../../../_shared/audio-transcript.ts";

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
  wait_for: string | null;
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
  "confirmando_dados_doc", "confirmar_titularidade", "ask_name", "ask_cpf", "ask_rg", "ask_birth_date",
  "ask_phone_confirm", "ask_phone", "ask_email", "ask_cep", "ask_number",
  "ask_complement", "ask_installation_number", "ask_bill_value",
  "ask_doc_frente_manual", "ask_doc_verso_manual", "ask_finalizar",
  "finalizando", "portal_submitting", "aguardando_otp", "validando_otp",
  "aguardando_facial", "aguardando_assinatura", "cadastro_em_analise", "complete", "aguardando_humano",
  // Edição pós-OCR (conta de luz)
  "editing_conta_menu","editing_conta_nome","editing_conta_endereco",
  "editing_conta_cep","editing_conta_distribuidora","editing_conta_instalacao","editing_conta_valor",
  // Edição pós-OCR (documento)
  "editing_doc_menu","editing_doc_nome","editing_doc_cpf","editing_doc_rg",
  "editing_doc_nascimento","editing_doc_pai","editing_doc_mae",
]);

interface LoadedFlow { flowId: string; steps: DbStep[]; strictMode: boolean; }

async function loadFlow(supabase: any, consultantId: string, variant: string = "A"): Promise<LoadedFlow | null> {
  try {
    const { data: flow } = await supabase
      .from("bot_flows")
      .select("id, strict_mode")
      .eq("consultant_id", consultantId)
      .eq("is_active", true)
      .eq("variant", variant)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!flow?.id) {
      console.log(`[conversational] loadFlow: no active flow for consultant=${consultantId} variant=${variant}`);
      return null;
    }

    const { data: steps, error: stepsErr } = await supabase
      .from("bot_flow_steps")
      .select("id, step_key, step_type, message_text, wait_for, text_delay_ms, slot_key, is_active, position, transitions, captures, fallback, auto_detect_doc_type, media_order")
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

export async function matchQA(
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

async function sleepForMedia(kind: string, _durationSec?: number | null, delayBeforeMs?: number | null): Promise<void> {
  if (isTestMode()) return; // 🧪 modo teste: zero espera
  // ⚠️ ANTES esperávamos a duração inteira do áudio/vídeo antes da próxima mídia.
  // Isso fazia a Edge Function estourar 60-120s, dar timeout no Whapi e o passo
  // nunca avançava. Agora usamos pausa curta: o Whapi já entrega na ordem.
  const configuredDelay = Number(delayBeforeMs || 0);
  if (configuredDelay > 0) {
    await new Promise((r) => setTimeout(r, Math.min(configuredDelay, 5_000)));
    return;
  }
  // Sincronia rápida entre mídias soltas (fora do cascade); 600ms padrão.
  const pause = kind === "audio" || kind === "video" ? 800 : 600;
  await new Promise((r) => setTimeout(r, pause));
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
  // Nome: sempre tenta extrair (cliente pode se apresentar em qualquer step).
  // Guard real (lock por OCR/user_confirmed) fica no consumer (~linha 754).
  {
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

// Envia mídias + (opcionalmente) o texto do passo respeitando a ordem
// configurada em consultants.flow_step_media_order[slotKey] (ex.: text→audio→video→image).
// Retorna:
//   - mediaSent: true se ao menos uma mídia foi enviada, false se não havia mídia,
//                null se tentou e falhou em TODAS.
//   - textSentInline: true quando o texto já foi enviado dentro daqui (na posição certa).
async function sendStepMedia(
  ctx: BotContext,
  step: DbStep,
  consultantId: string,
  _waitForSend = true,
  textPayload?: { text: string; delayMs: number } | null,
): Promise<{ mediaSent: boolean | null; textSentInline: boolean }> {
  const slotKey = step.slot_key || step.step_key || step.id;
  if (!slotKey) return { mediaSent: false, textSentInline: false };

  const { data: mediaRows } = await ctx.supabase
    .from("ai_media_library")
    .select("id, kind, label, url, slot_key, send_order, duration_sec, delay_before_ms, transcript")
    .eq("consultant_id", consultantId)
    .eq("slot_key", slotKey)
    .eq("active", true)
    .order("send_order", { ascending: true });

  const variant = (ctx.customer as any)?.flow_variant || "A";
  let medias = ((mediaRows as any[]) || []).filter((m) => !!m?.url);
  // Variante B: cada áudio vira um item de texto (transcript) na mesma posição.
  // Mantemos `kind: 'audio'` no item para que o slot "audio" do media_order
  // continue casando; o flag `_asText` faz a sequência empurrar como text item.
  if (variant === "B") {
    const transformed: any[] = [];
    for (const m of medias) {
      if (String(m.kind).toLowerCase() !== "audio") { transformed.push(m); continue; }
      const transcript = await ensureAudioTranscript(ctx.supabase, m);
      if (transcript && transcript.trim()) {
        transformed.push({ ...m, _asText: true, _transcript: transcript.trim() });
        console.log(`[sendStepMedia] variant=B: audio "${m.label || m.id}" → text (${transcript.length} chars)`);
      } else {
        console.warn(`[sendStepMedia] variant=B: audio "${m.label || m.id}" sem transcript → pulado`);
      }
    }
    medias = transformed;
  }


  // Precedência: UI (consultants.flow_step_media_order) → step.media_order → default.
  const uiOrder = await getStepMediaOrder(ctx.supabase, consultantId, slotKey);
  const stepOrder = Array.isArray(step.media_order) && step.media_order.length > 0
    ? step.media_order.map((k) => String(k).toLowerCase())
    : null;
  const configuredOrder = uiOrder || stepOrder; // pode conter "text"

  // Constrói sequência unificada (texto + mídias) na ordem configurada.
  type Item =
    | { kind: "text"; text: string; delayMs: number }
    | { kind: "audio" | "video" | "image" | "document"; media: any };
  const sequence: Item[] = [];

  const textItem: Item | null = (textPayload && textPayload.text.trim().length > 0)
    ? { kind: "text", text: textPayload.text, delayMs: Math.max(0, textPayload.delayMs || 0) }
    : null;

  if (configuredOrder && configuredOrder.length > 0) {
    const remaining = [...medias];
    let textInjected = false;
    for (const slot of configuredOrder) {
      const s = String(slot).toLowerCase();
      if (s === "text") {
        if (textItem && !textInjected) { sequence.push(textItem); textInjected = true; }
        continue;
      }
      const taken: any[] = [];
      for (const m of remaining) {
        if (String(m.kind).toLowerCase() === s) taken.push(m);
      }
      for (const m of taken) {
        const idx = remaining.indexOf(m);
        if (idx >= 0) remaining.splice(idx, 1);
        if ((m as any)._asText) {
          sequence.push({ kind: "text", text: String((m as any)._transcript || ""), delayMs: Number(m.delay_before_ms || 0) });
        } else {
          const k = ["audio", "video", "image"].includes(String(m.kind)) ? String(m.kind) as any : "document";
          sequence.push({ kind: k, media: m });
        }
      }
    }
    // Mídias com kind não listado vão para o fim (preserva send_order)
    for (const m of remaining) {
      if ((m as any)._asText) {
        sequence.push({ kind: "text", text: String((m as any)._transcript || ""), delayMs: Number(m.delay_before_ms || 0) });
      } else {
        const k = ["audio", "video", "image"].includes(String(m.kind)) ? String(m.kind) as any : "document";
        sequence.push({ kind: k, media: m });
      }
    }
    // Se a ordem não menciona "text" mas existe texto, manda no fim
    if (textItem && !textInjected) sequence.push(textItem);
  } else {
    // Sem ordem configurada: mantém comportamento legado (mídias antes, texto depois).
    for (const m of medias) {
      if ((m as any)._asText) {
        sequence.push({ kind: "text", text: String((m as any)._transcript || ""), delayMs: Number(m.delay_before_ms || 0) });
      } else {
        const k = ["audio", "video", "image"].includes(String(m.kind)) ? String(m.kind) as any : "document";
        sequence.push({ kind: k, media: m });
      }
    }
    if (textItem) sequence.push(textItem);
  }

  if (sequence.length === 0) return { mediaSent: false, textSentInline: false };

  let mediaSent = false;
  let mediaAttempted = false;
  let mediaFailed = false;
  let textSentInline = false;
  let prevForPause: { kind: string; duration_sec?: number | null } | null = null;

  for (let i = 0; i < sequence.length; i++) {
    const item = sequence[i];

    if (item.kind === "text") {
      // ⏱️ Respeita text_delay_ms antes do texto
      if (!isTestMode()) {
        const wait = Math.max(0, Math.min(item.delayMs, 120_000));
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
      try {
        await ctx.sender.sendText(ctx.remoteJid, item.text);
        textSentInline = true;
        prevForPause = { kind: "text" };
        // A1: log every inline text in conversations so CRM shows the real step trail
        try {
          if (ctx.customer?.id) {
            await ctx.supabase.from("conversations").insert({
              customer_id: ctx.customer.id,
              message_direction: "outbound",
              message_text: item.text,
              message_type: "text",
              conversation_step: step.step_key,
            });
          }
        } catch (_) { /* noop */ }
      } catch (e) {
        console.error(`[conversational] sendText inline falhou step=${step.step_key}:`, (e as Error)?.message || e);
        try {
          if (ctx.customer?.id) {
            await ctx.supabase.from("conversations").insert({
              customer_id: ctx.customer.id,
              message_direction: "outbound",
              message_text: `[failed:text] ${(e as Error)?.message || e}`,
              message_type: "text_failed",
              conversation_step: step.step_key,
            });
          }
        } catch (_) { /* noop */ }
      }
      continue;
    }

    const m = item.media;
    const kind = item.kind;

    // 🚫 ANTI-DUPLICAÇÃO: reserva no dispatch_log antes de enviar
    if ((kind === "audio" || kind === "video" || kind === "image") && m.id && ctx.customer?.id) {
      const { data: canSend } = await ctx.supabase.rpc("try_log_media_send", {
        _consultant_id: consultantId,
        _customer_id: ctx.customer.id,
        _media_id: m.id,
        _slot_key: slotKey,
        _kind: kind,
      });
      if (canSend === false) {
        console.log(`[conversational] ⏭️ pulando ${kind} já reservado/entregue (media_id=${m.id}) customer=${ctx.customer.id}`);
        continue;
      }
    }

    // ⏱️ Pausa antes da mídia (respeita delay_before_ms; senão, pausa curta baseada no item anterior)
    const configuredDelay = Number(m.delay_before_ms || 0);
    if (!isTestMode()) {
      if (configuredDelay > 0) {
        const wait = Math.min(configuredDelay, 10_000);
        await new Promise((r) => setTimeout(r, wait));
      } else if (prevForPause) {
        let pause = 600;
        if ((prevForPause.kind === "audio" || prevForPause.kind === "video") && Number(prevForPause.duration_sec || 0) > 0) {
          pause = Math.min(Number(prevForPause.duration_sec) * 1000, 8000);
        }
        await new Promise((r) => setTimeout(r, pause));
      }
    }

    mediaAttempted = true;
    // B1: retry media up to 2x with 1500ms gap to ride out Whapi/network blips
    let ok: any = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      ok = await ctx.sender.sendMedia(ctx.remoteJid, m.url, "", kind, Number((m as any).duration_sec || 0) || undefined);
      if (ok !== false) break;
      if (attempt === 0) {
        console.warn(`[conversational] mídia ${kind} falhou (media_id=${m.id}) — retry em 1500ms`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (ok !== false) {
      mediaSent = true;
      await ctx.supabase.from("conversations").insert({
        customer_id: ctx.customer.id,
        message_direction: "outbound",
        message_text: `[flow-step:${step.step_key}:${kind}]`,
        message_type: kind,
        conversation_step: step.step_key,
        media_id: m.id || null,
        slot_key: slotKey || null,
      });
      prevForPause = { kind, duration_sec: m.duration_sec };
    } else {
      mediaFailed = true;
      console.warn(`[conversational] mídia ${kind} falhou após retry (media_id=${m.id}); reserva mantida`);
      try {
        await ctx.supabase.from("conversations").insert({
          customer_id: ctx.customer.id,
          message_direction: "outbound",
          message_text: `[failed:${kind}] media_id=${m.id}`,
          message_type: `${kind}_failed`,
          conversation_step: step.step_key,
          media_id: m.id || null,
          slot_key: slotKey || null,
        });
      } catch (_) { /* noop */ }
    }
  }

  const mediaResult: boolean | null = medias.length === 0
    ? false
    : (mediaAttempted && mediaFailed && !mediaSent) ? null : mediaSent;
  return { mediaSent: mediaResult, textSentInline };
}

// 🚫 REMOVIDO: fallbackTextForStep — inventava texto fora do /admin/fluxos.
// Regra de ouro: o bot só envia o que o consultor configurou. Se não há
// message_text nem mídia válida, cascateia pelo fallback.goto_step_id.

// Registro do passo atual por turno, populado pelo runConversationalFlow.
// _finalize usa isso para compor uma reentrada quando o reply ficaria vazio,
// evitando silêncio total quando o lead manda algo fora do esperado.
// IMPORTANTE: guardamos também as `vars` p/ renderizar {{nome}}, {{valor_conta}},
// etc. antes de enviar ao lead. Sem isso, o lead recebia placeholder cru.
let _currentTurnStepQuestion: string = "";
// deno-lint-ignore no-explicit-any
let _currentTurnVars: any = {};
let _currentTurnCustomerId: string | null = null;
let _currentTurnMessageText: string = "";
// deno-lint-ignore no-explicit-any
function _setTurnStepQuestion(q: string, vars?: any) {
  _currentTurnStepQuestion = (q || "").trim();
  _currentTurnVars = vars || {};
}

// Detecta saudação no texto do lead e devolve o prefixo correspondente
// no mesmo tom ("Bom dia!", "Boa tarde!", "Boa noite!", "Oi!"). Retorna ""
// quando não há saudação — assim o fluxo segue sem alterações.
function greetingPrefix(text: string): string {
  const t = (text || "").toLowerCase();
  if (!t) return "";
  if (/\bbom\s*dia\b/.test(t)) return "Bom dia!";
  if (/\bboa\s*tarde\b/.test(t)) return "Boa tarde!";
  if (/\bboa\s*noite\b/.test(t)) return "Boa noite!";
  if (/\b(oi+|ol[áa]|opa|e a[íi]|eai|hello|hi)\b/.test(t)) return "Oi!";
  return "";
}
function _extractTail(t: string): string {
  if (!t) return "";
  const cleaned = String(t).replace(/^📋\s*\*?Voltando ao seu cadastro:\*?\s*/i, "").trim();
  const qMatches = cleaned.match(/[^.!?\n]*\?+/g);
  if (qMatches && qMatches.length > 0) return qMatches[qMatches.length - 1].trim();
  const sents = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (sents[sents.length - 1] || cleaned).trim();
}

// Guarda em memória da última reentrada por customer, p/ evitar repetir
// a mesma muleta 2x em menos de 60s.
const _lastReentryByCustomer = new Map<string, { tail: string; at: number }>();

// Wrapper de segurança — NUNCA silencia. Se não há reply nem mídia inline,
// devolve a própria pergunta do passo atual (sem prefixo "Boa!"), e suprime
// repetição em menos de 60s pro mesmo cliente.
function _finalize(stepKey: string, r: BotResult): BotResult {
  const reply = (r.reply || "").trim();
  const hasMedia = r.updates?.__inline_sent === true;

  // Saudação contextual: se o lead cumprimentou ("bom dia", "boa noite", etc.),
  // prefixa a resposta no mesmo tom. Não altera o fluxo — só cortesia.
  const greet = greetingPrefix(_currentTurnMessageText);
  const applyGreet = (text: string): string => {
    if (!greet) return text;
    const t = (text || "").trim();
    if (!t) return greet;
    // Evita duplicar se a própria resposta já começa com a mesma saudação.
    if (new RegExp(`^${greet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(t)) return t;
    return `${greet} ${t}`;
  };

  if (!reply && !hasMedia) {
    const rawTail = _extractTail(_currentTurnStepQuestion);
    // ✅ Renderiza variáveis ({{nome}}, {{valor_conta}}, etc.) e remove
    // qualquer {{...}} residual pra não vazar placeholder cru pro lead.
    let tail = rawTail ? renderTemplate(rawTail, _currentTurnVars || {}) : "";
    tail = tail.replace(/\{\{\s*[^}]+\s*\}\}/g, "").replace(/\s{2,}/g, " ").trim();
    tail = tail.replace(/^[,;:\-\s]+/, "").trim();

    // Suprime repetição da mesma reentrada em curto intervalo.
    const cid = _currentTurnCustomerId;
    if (cid) {
      const prev = _lastReentryByCustomer.get(cid);
      const now = Date.now();
      if (prev && prev.tail === tail && now - prev.at < 60_000) {
        console.warn(`[conversational] 🤫 reentry suprimida (repetida <60s) step=${stepKey}`);
        return { reply: "", updates: { ...r.updates, __suppressed_reentry: true } as any };
      }
      _lastReentryByCustomer.set(cid, { tail, at: now });
    }

    const reentry = tail
      ? tail
      : "Tô aqui 👀 — me conta um pouquinho mais pra eu te ajudar?";
    console.warn(`[conversational] ⚠️ reply vazio → reentry em step=${stepKey}`);
    return { reply: applyGreet(reentry), updates: { ...r.updates } };
  }

  // Caso comum: prefixa saudação se aplicável.
  if (reply) return { reply: applyGreet(reply), updates: r.updates };
  // Sem reply mas com mídia: se houve saudação, envia ao menos o "Bom dia!".
  if (greet) return { reply: greet, updates: r.updates };
  return { reply, updates: r.updates };
}

export async function runConversationalFlow(ctx: BotContext): Promise<BotResult> {
  let stepKey = (ctx.customer.conversation_step || "welcome") as string;
  _currentTurnCustomerId = (ctx.customer?.id as string) || null;
  _currentTurnMessageText = (ctx.messageText as string) || "";


  // Cadastro steps are NEVER handled here — defensive guard
  if (CADASTRO_STEPS.has(stepKey)) {
    return { reply: "", updates: {} };
  }

  // 📸 FIX: foto/documento recebido enquanto o lead ainda está em step
  // conversacional (welcome, qualificacao, flow:*) deve ser tratado como
  // conta de luz IMEDIATAMENTE — vai para o pipeline determinístico de OCR
  // no próximo turno. Sem isso, o lead manda a foto e o bot continua
  // disparando áudios/explicações antigas.
  if (
    (ctx.isFile || ctx.hasImage || ctx.hasDocument) &&
    !(ctx.customer as any).electricity_bill_photo_url &&
    !CADASTRO_STEPS.has(stepKey)
  ) {
    console.log(`[conversational] 📸 arquivo recebido em step="${stepKey}" → redirecionando para aguardando_conta`);
    // Reprocessa a mesma mensagem como conta no próximo webhook
    // (que será disparado quando o customer for atualizado).
    // Alternativamente, chama o bot determinístico inline.
    try {
      const { runBotFlow } = await import("../bot-flow.ts");
      // Atualiza step em memória pra o bot-flow processar como aguardando_conta
      (ctx.customer as any).conversation_step = "aguardando_conta";
      const result = await runBotFlow(ctx);
      return {
        reply: result.reply,
        updates: { ...(result.updates || {}), conversation_step: result.updates?.conversation_step || "aguardando_conta", __inline_sent: true },
      };
    } catch (e) {
      console.error("[conversational] falha ao redirecionar p/ bot-flow:", (e as Error)?.message || e);
      return {
        reply: "",
        updates: { conversation_step: "aguardando_conta", __inline_sent: true },
      };
    }
  }

  // ─── Dedupe de mensagem (idempotência) ─────────────────────────────────
  // Whapi às vezes reenvia o mesmo webhook. Sem isso, capturas são processadas
  // 2x e auto-advance pula passos. Tabela tem TTL de 24h (pg_cron).
  if (ctx.messageId) {
    try {
      const { data: inserted, error: dupErr } = await ctx.supabase
        .from("webhook_message_dedupe")
        .insert({ message_id: ctx.messageId, consultant_id: ctx.customer?.consultant_id || null })
        .select("message_id")
        .maybeSingle();
      if (!inserted && !dupErr) {
        console.log(`[conversational] 🔁 dedupe hit: ${ctx.messageId} já processado`);
        return { reply: "", updates: { __inline_sent: true } };
      }
      // Em caso de conflito (PK violation), o insert retorna erro 23505 — também é dedupe hit.
      if (dupErr && String((dupErr as any).code) === "23505") {
        console.log(`[conversational] 🔁 dedupe conflict: ${ctx.messageId}`);
        return { reply: "", updates: { __inline_sent: true } };
      }
    } catch (e) {
      console.error("[conversational] dedupe check failed (continuando)", e);
    }
  }

  // ─── Detour return: se o lead foi desviado por uma regra goto_step no turno
  // anterior, restaura o passo original ANTES de processar a nova mensagem.
  // Isso garante que ele volte exatamente onde estava no funil.
  const prevStep = (ctx.customer as any).previous_conversation_step as string | null;
  const lastRuleId = (ctx.customer as any).last_rule_id as string | null;
  let restoreDetourUpdates: Record<string, any> = {};
  if (prevStep && lastRuleId && prevStep !== stepKey) {
    console.log(`[conversational] ↩️  restaurando detour: ${stepKey} → ${prevStep}`);
    stepKey = prevStep;
    restoreDetourUpdates = { previous_conversation_step: null, last_rule_id: null };
  }

  // bot_flows / bot_flow_steps / bot_flow_qa use the consultant UUID (customer.consultant_id),
  // NOT the iGreen numeric id (consultorId). Prefer the UUID; fall back to consultorId only as last resort.
  const consultantId = ctx.customer?.consultant_id || (ctx as any).consultorId;
  const flowVariant = (ctx.customer as any)?.flow_variant || "A";
  const loaded = consultantId ? await loadFlow(ctx.supabase, consultantId, flowVariant) : null;
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

  const firstActiveRaw = dbSteps.find((s) => s.is_active) || dbSteps[0];
  // Lookup robusto: tenta por id (preferido — estável) e por step_key (compat reversa).
  // O orchestrator passa stepKey já com prefixo strippado; pode ser UUID, "passo_xxx" ou nome canônico.
  const currentStepRaw =
    dbSteps.find((s) => s.id === stepKey) ||
    dbSteps.find((s) => s.step_key === stepKey);

  // ─── resolveLandingStep ────────────────────────────────────────────────
  // Se o passo atual existe SÓ pra capturar um dado que já temos (ex: Passo 1
  // pergunta o nome, mas o cliente já se apresentou no welcome), pula pro
  // próximo passo ativo por position. Loop limitado a 5 saltos com visited
  // set pra nunca ciclar. Falha silenciosa: se algo der errado, mantém o
  // passo original (comportamento atual).
  const TRUSTED_NAME_SKIP = new Set([
    "ocr", "ocr_conta", "ocr_doc", "user_confirmed", "self_introduced", "manual",
  ]);
  const stepCapturesField = (s: DbStep, field: string): boolean => {
    if (!Array.isArray(s.captures)) return false;
    return s.captures.some((c: any) => c?.field === field && c?.enabled !== false);
  };
  const isAskOnlyStep = (s: DbStep, field: string): boolean => {
    // O passo é considerado "pergunta este dado" se tem capture habilitada
    // pro field OU se título/slot menciona algo relacionado (heurístico já
    // usado na captura de nome — linhas 665-669).
    if (stepCapturesField(s, field)) return true;
    if (field === "name") {
      return /\bnome\b|\bchama\b/i.test(String((s as any).title || "")) ||
             /\bnome\b/i.test(String((s as any).slot_key || ""));
    }
    return false;
  };
  const isFieldAlreadyCaptured = (field: string, c: any): boolean => {
    if (!c) return false;
    if (field === "name") {
      const v = String(c.name || "").trim();
      if (v.length < 2) return false;
      return TRUSTED_NAME_SKIP.has(String(c.name_source || ""));
    }
    if (field === "electricity_bill_value") {
      const v = Number(c.electricity_bill_value || 0);
      return v > 0;
    }
    if (field === "cpf") {
      const v = String(c.cpf || "").replace(/\D/g, "");
      return v.length === 11;
    }
    if (field === "phone_whatsapp") {
      return !!String(c.phone_whatsapp || "").replace(/\D/g, "");
    }
    return false;
  };
  const resolveLandingStep = (start: DbStep | undefined): DbStep | undefined => {
    if (!start) return start;
    const fields = ["name", "electricity_bill_value", "cpf", "phone_whatsapp"];
    const visited = new Set<string>();
    let cur: DbStep | undefined = start;
    let hops = 0;
    while (cur && !visited.has(cur.id) && hops < 5) {
      visited.add(cur.id);
      // Só pula se TODOS os fields capturados pelo step já estão preenchidos.
      const captured = fields.filter((f) => isAskOnlyStep(cur!, f));
      if (captured.length === 0) return cur;
      const allFilled = captured.every((f) => isFieldAlreadyCaptured(f, ctx.customer));
      if (!allFilled) return cur;
      // Regra de pulo: o passo de NOME pode ser pulado SEMPRE que o nome já
      // estiver capturado (mesmo se tiver texto/slot — é só uma pergunta).
      // Para os demais campos, preservamos passos com mídia/texto para não
      // perder áudios como boas_vindas/como_funciona.
      const onlyAsksName = captured.length === 1 && captured[0] === "name";
      if (!onlyAsksName) {
        const hasMediaSlot = !!(cur.slot_key && String(cur.slot_key).trim());
        const hasText = !!(cur.message_text && String(cur.message_text).trim());
        if (hasMediaSlot || hasText) {
          console.log(`[skip-step] mantendo ${cur.step_key} (tem slot_key/texto) mesmo com captura preenchida`);
          return cur;
        }
      }
      const next = dbSteps.find((s) => s.is_active && s.position > cur!.position);
      if (!next) return cur;
      console.log(`[skip-step] from=${cur.step_key} → to=${next.step_key} reason=${captured.join(",")}_already_captured`);
      cur = next;
      hops++;
    }
    return cur;
  };

  let firstActive: DbStep;
  let currentStep: DbStep | undefined;
  try {
    firstActive = resolveLandingStep(firstActiveRaw) || firstActiveRaw;
    currentStep = resolveLandingStep(currentStepRaw) || currentStepRaw;
  } catch (e) {
    console.error("[skip-step] failed, falling back to raw steps", e);
    firstActive = firstActiveRaw;
    currentStep = currentStepRaw;
  }
  // Se resolveLandingStep avançou o passo, sincroniza stepKey para que
  // _finalize salve conversation_step no passo novo (e não no antigo).
  if (currentStep && currentStepRaw && currentStep.id !== currentStepRaw.id) {
    stepKey = currentStep.id;
  }
  // Registra a pergunta do passo atual + vars para o fallback de _finalize.
  const _turnVars = {
    nome: ctx.customer.name,
    representante: ctx.nomeRepresentante,
    valor_conta: (ctx.customer as any).electricity_bill_value,
    telefone: ctx.customer.phone_whatsapp,
    cpf: (ctx.customer as any).cpf,
  };
  _setTurnStepQuestion(currentStep?.message_text || "", _turnVars);
  if (!currentStep) {
    // Unknown/legacy step → restart no primeiro step ativo.
    // REGRA DE OURO: SEMPRE seguir o /admin/fluxos. NUNCA inventar texto.
    // - Se o step tem message_text → usa.
    // - Se está vazio → tenta mídia; se também vazio/falhou, cascateia pelo
    //   fallback.goto_step_id até achar um step com conteúdo real OU um
    //   step que precise esperar resposta (wait_for=reply).
    console.log(`[conversational] unknown step="${stepKey}" → restart at firstActive=${firstActive?.id} (steps=${dbSteps.length})`);
    const vars = {
      nome: ctx.customer.name,
      representante: ctx.nomeRepresentante,
      valor_conta: (ctx.customer as any).electricity_bill_value,
      telefone: ctx.customer.phone_whatsapp,
      cpf: (ctx.customer as any).cpf,
    };

    const parts: string[] = [];
    let anyMediaSent = false;
    let cursor: DbStep | undefined = firstActive;
    const visited = new Set<string>();
    let landingStepId = firstActive.id;

    while (cursor && !visited.has(cursor.id)) {
      // Skip steps already satisfied (ex: pergunta nome quando self-intro já capturou)
      const resolvedCursor = resolveLandingStep(cursor);
      if (resolvedCursor && resolvedCursor.id !== cursor.id) {
        console.log(`[restart-cascade] skip ${cursor.step_key} → ${resolvedCursor.step_key} (captura já satisfeita)`);
        cursor = resolvedCursor;
        if (visited.has(cursor.id)) break;
      }
      visited.add(cursor.id);
      landingStepId = cursor.id;

      const { mediaSent } = await sendStepMedia(ctx, cursor, consultantId, true);
      if (mediaSent === true) anyMediaSent = true;
      const tpl = (cursor.message_text || "").trim();
      if (tpl) parts.push(renderTemplate(tpl, vars));

      const stepHasContent = !!tpl || mediaSent === true;
      // Para se o step espera resposta do cliente.
      if (cursor.wait_for === "reply" || cursor.wait_for === "media") break;
      // Se este step já entregou conteúdo (texto OU mídia), só cascateia se
      // o próximo tipo for "none" sem espera — preserva a UX configurada.
      const nextId = cursor.fallback?.mode === "goto" ? cursor.fallback?.goto_step_id : null;
      if (!nextId) break;
      const next = dbSteps.find((s) => s.id === nextId && s.is_active);
      if (!next) break;
      // Continuamos cascateando enquanto não tivermos NADA para enviar OU
      // enquanto o consultor configurou cascata explícita (wait_for=none).
      if (stepHasContent && cursor.wait_for !== "none") break;
      cursor = next;
    }

    const reply = parts.filter((p) => p && p.trim()).join("\n\n");
    if (!reply && !anyMediaSent) {
      console.warn(`[conversational] restart sem conteúdo — step ${landingStepId} sem text/mídia válidos. Mantendo lead no step sem resposta para não inventar texto.`);
    }
    return {
      reply,
      updates: { conversation_step: landingStepId, __inline_sent: anyMediaSent || undefined },
    };
  }

  // Nota: a avaliação de bot_flow_rules agora roda DEPOIS de matchTransition
  // (como fallback inteligente, não como primeiro filtro) — ver bloco mais abaixo.

  // ---------------------------------------------------------------------------
  // Capture phase — extract data the consultor configured for this step
  // Roda ANTES do QA e do classifier para que "300 reais" nunca seja roubado
  // por uma pergunta FAQ com phrase "reais".
  // ---------------------------------------------------------------------------
  const captureUpdates: Record<string, any> = {};
  try {
    const extracted = extractCaptures(ctx.messageText || "", currentStep.captures || []);
    if (extracted.electricity_bill_value != null) captureUpdates.electricity_bill_value = extracted.electricity_bill_value;
    // Fallback contextual: se este passo claramente pergunta valor da conta
    // (slot/text/title mencionam valor|conta|luz) e o lead respondeu com um número plausível,
    // captura mesmo sem `captures` configurado e mesmo com texto extra ("200 mas ou menos").
    if (extracted.electricity_bill_value == null && !ctx.customer.electricity_bill_value) {
      const stepHaystack = `${currentStep.message_text || ""} ${(currentStep as any).title || ""} ${currentStep.slot_key || ""}`.toLowerCase();
      const isValueStep = /\bvalor\b|\bconta\b|\bluz\b|electricity|bill/.test(stepHaystack);
      if (isValueStep) {
        const permissive = extractValorPermissivo(ctx.messageText || "");
        if (permissive != null) {
          captureUpdates.electricity_bill_value = permissive;
          console.log(`[capture-fallback] valor=${permissive} via permissivo no step ${currentStep.step_key}`);
        }
      }
    }
    if (extracted.phone_whatsapp && !ctx.customer.phone_whatsapp) captureUpdates.phone_whatsapp = extracted.phone_whatsapp;
    if (extracted.cpf) captureUpdates.cpf = extracted.cpf;
    // Nome: se o passo atual é um "pergunta nome" (título/slot menciona nome,
    // ou tem capture explícita de name habilitada), sobrescreve.
    // Caso contrário, mantém a guarda anti-sobrescrita.
    // EXCEÇÃO CRÍTICA: se name_source vier de OCR (ocr_conta/ocr_doc) ou
    // user_confirmed, NUNCA sobrescreve por captura de texto livre — só os
    // passos editing_* explícitos podem trocar (no bot-flow.ts).
    const TRUSTED_LOCK = new Set(["ocr_conta", "ocr_doc", "user_confirmed"]);
    const nameLocked = TRUSTED_LOCK.has(String((ctx.customer as any).name_source || ""));
    // Detecta pergunta de nome também pela ÚLTIMA outbound — compensa cascade
    // que avança o currentStep antes do lead responder a pergunta anterior.
    let lastOutboundWasNameQuestion = false;
    try {
      const { data: lastOut } = await ctx.supabase
        .from("conversations")
        .select("message_text")
        .eq("customer_id", ctx.customer.id)
        .eq("message_direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const txt = String((lastOut as any)?.message_text || "");
      lastOutboundWasNameQuestion = /qual\s+(?:é\s+)?(?:o\s+)?(?:seu\s+)?nome|como\s+(?:posso\s+)?(?:te\s+)?(?:chamar|chamo)|me\s+diz\s+(?:seu\s+)?nome/i.test(txt);
    } catch { /* best-effort */ }
    const stepIsAskName =
      lastOutboundWasNameQuestion ||
      /\bnome\b|\bchama\b/i.test(String((currentStep as any).title || "")) ||
      /\bnome\b/i.test(String((currentStep as any).slot_key || "")) ||
      (Array.isArray(currentStep.captures) &&
        currentStep.captures.some((c: any) => c?.field === "name" && c?.enabled !== false));
    // Quando a pergunta foi de nome (passo atual OU última outbound), sobrescreve
    // mesmo whatsapp_profile/freeform_multi anteriores — o nome digitado é mais confiável.
    const currentNameSource = String((ctx.customer as any).name_source || "");
    const weakNameSource = currentNameSource === "" || currentNameSource === "whatsapp_profile" || currentNameSource === "freeform_multi";
    if (extracted.name && !nameLocked && (stepIsAskName || !ctx.customer.name || weakNameSource)) {
      captureUpdates.name = extracted.name;
      captureUpdates.name_source = "self_introduced";
      if (stepIsAskName) {
        console.log(`[name-capture] override "${ctx.customer.name || ""}"(${currentNameSource}) → "${extracted.name}" (askName via ${lastOutboundWasNameQuestion ? "last-outbound" : "current-step"})`);
      }
    }

    if (Object.keys(captureUpdates).length > 0 && ctx.customer.id) {
      await ctx.supabase.from("customers").update(captureUpdates).eq("id", ctx.customer.id);
      // Reflete no objeto em memória pra re-resolver landing step abaixo.
      Object.assign(ctx.customer as any, captureUpdates);
    }

    // Após capturar, re-resolve landing step: se o próximo passo só perguntaria
    // o dado que acabou de chegar, pula automaticamente.
    if (Object.keys(captureUpdates).length > 0) {
      const advanced = resolveLandingStep(currentStep);
      if (advanced && advanced.id !== currentStep.id) {
        console.log(`[skip-step] post-capture: ${currentStep.step_key} → ${advanced.step_key}`);
        currentStep = advanced;
        stepKey = currentStep.id;
      }
    }
  } catch (e) {
    console.error("[conversational] capture phase failed", e);
  }

  // Intents virtuais derivados das capturas (precisamos cedo para suprimir QA/regras).
  const captureIntents: string[] = [];
  if (captureUpdates.electricity_bill_value != null) captureIntents.push("informou_valor", "valor_brl");
  if (captureUpdates.name) captureIntents.push("informou_nome");
  if (captureUpdates.phone_whatsapp) captureIntents.push("informou_telefone");
  if (captureUpdates.cpf) captureIntents.push("informou_cpf");
  const hasCapture = captureIntents.length > 0;

  // ─── Q&A FAQ matching ───────────────────────────────────────────────
  // Pula se a mensagem produziu captura legítima — captura tem prioridade.
  const qaHit = hasCapture ? null : await matchQA(ctx.supabase, flowId, consultantId, ctx.messageText || "");
  if (qaHit) {
    console.log(`[conversational] QA hit at step="${stepKey}"`);
    for (const m of qaHit.mediaUrls) {
      if ((m.kind === "audio" || m.kind === "video" || m.kind === "image") && m.mediaId) {
        const { data: canSend } = await ctx.supabase.rpc("try_log_media_send", {
          _consultant_id: consultantId,
          _customer_id: ctx.customer.id,
          _media_id: m.mediaId,
          _slot_key: "__qa__",
          _kind: m.kind,
        });
        if (canSend === false) {
          console.log(`[conversational] ⏭️ QA: pulando ${m.kind} já enviado (media_id=${m.mediaId})`);
          continue;
        }
      }
      try { await ctx.sender.sendMedia(ctx.remoteJid, m.url, "", m.kind, Number((m as any).duration_sec || 0) || undefined); } catch (_) {}
    }
    return _finalize(stepKey, {
      reply: renderTemplate(qaHit.text || "", {
        nome: ctx.customer.name,
        representante: ctx.nomeRepresentante,
        valor_conta: (ctx.customer as any).electricity_bill_value,
        telefone: ctx.customer.phone_whatsapp,
        cpf: (ctx.customer as any).cpf,
      }),
      updates: { conversation_step: stepKey, __inline_sent: qaHit.mediaUrls.length > 0 || undefined, ...restoreDetourUpdates },
    });
  }

  const cls = await classifyIntent(ctx.messageText, stepKey as ConversationalStep, ctx.geminiApiKey);

  // ─── AI FAQ Answerer (Lovable AI) ──────────────────────────────────
  // Quando o lead faz pergunta (tem_duvida) que NÃO casou em bot_flow_qa
  // E não é uma captura legítima, tenta responder via Lovable AI usando
  // ai_knowledge_sections como base. Mantém o passo atual (não avança
  // o funil). Se confidence < 0.6 OU shouldHandoff → pula e deixa o
  // fluxo default seguir (que vai disparar regras/handoff conforme cfg).
  if (cls.intent === "tem_duvida" && !hasCapture) {
    try {
      const ai = await answerFaqWithAI({
        supabase: ctx.supabase,
        question: ctx.messageText || "",
        leadName: ctx.customer.name,
        currentStepLabel: currentStep.step_key,
      });
      if (ai.source === "ai" && ai.text && ai.confidence >= 0.6 && !ai.shouldHandoff) {
        console.log(`[ai-faq] hit step="${stepKey}" conf=${ai.confidence.toFixed(2)}`);
        return _finalize(stepKey, {
          reply: renderTemplate(ai.text, {
            nome: ctx.customer.name,
            representante: ctx.nomeRepresentante,
            valor_conta: (ctx.customer as any).electricity_bill_value,
            telefone: ctx.customer.phone_whatsapp,
            cpf: (ctx.customer as any).cpf,
          }),
          updates: {
            conversation_step: stepKey,
            __intent: cls.intent,
            __confidence: cls.confidence,
            __ai_faq: true,
            ...restoreDetourUpdates,
          },
        });
      }
      if (ai.shouldHandoff) {
        console.log(`[ai-faq] handoff sugerido step="${stepKey}" — deixando fluxo default tratar`);
      }
    } catch (e) {
      console.warn("[ai-faq] erro, ignorando:", (e as Error).message);
    }
  }

  // ─── Saudação ──────────────────────────────────────────────────────
  // "Bom dia/Boa tarde/Boa noite/Oi" não muda o fluxo. _finalize prefixa
  // a resposta no mesmo tom; o lead segue exatamente no passo em que está.



  // Global overrides: cadastro / humano keywords win in any step
  if (cls.intent === "quer_cadastrar") {
    return _finalize(stepKey, {
      reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_conta", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
    });
  }
  if (cls.intent === "quer_humano") {
    return _finalize(stepKey, {
      reply: await getTemplate(ctx.supabase, "aguardando_humano", "avisado", {
        nome: ctx.customer.name, representante: ctx.nomeRepresentante,
      }),
      updates: { conversation_step: "aguardando_humano", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
    });
  }

  // Build candidate intent list: classifier intent + regex-derived intents + capture intents
  const candidateIntents = [cls.intent, ...detectRegexIntents(ctx.messageText || ""), ...captureIntents];
  const transition = matchTransition(currentStep, candidateIntents, ctx.messageText);

  const vars = {
    nome: captureUpdates.name || ctx.customer.name,
    representante: ctx.nomeRepresentante,
    valor_conta: captureUpdates.electricity_bill_value ?? (ctx.customer as any).electricity_bill_value,
    telefone: captureUpdates.phone_whatsapp || ctx.customer.phone_whatsapp,
    cpf: captureUpdates.cpf || (ctx.customer as any).cpf,
  };

  // Mapeia step_type especial → primeiro conversation_step do pipeline de cadastro
  const stepTypeToCadastro = (st: string | null | undefined): string | null => {
    if (st === "capture_conta") return "aguardando_conta";
    if (st === "capture_documento") return "aguardando_doc_auto";
    if (st === "capture_email") return "ask_email";
    if (st === "confirm_phone") return "ask_phone_confirm";
    if (st === "finalizar_cadastro") return "ask_finalizar";
    return null;
  };

  // Helper — render and return a step (respeita text_delay_ms configurado no passo)
  // 📐 REGRA: SEMPRE enviar a mídia configurada (áudio/vídeo/imagem) + o texto, se ambos existirem.
  //   - Mídia nunca é suprimida quando existe texto: as duas coisas vão.
  //   - Se a mídia falhou e o step tem texto → manda só o texto.
  //   - Se não tem nem mídia nem texto → cascateia sem inventar nada.
  // Durante cascade (wait_for=none), cada step intermediário é enviado como
  // MENSAGEM SEPARADA via ctx.sender (mídia + texto), e o último vira `reply`.
  const renderStepText = (st: DbStep): string =>
    renderTemplate(st.message_text || "", vars).trim();

  // Envia um step (mídia SEMPRE + texto SEMPRE quando existem), respeitando a ordem configurada.
  const emitStep = async (
    st: DbStep,
    asReply: boolean,
  ): Promise<{ replyText: string; inlineSent: boolean }> => {
    const text = renderStepText(st);
    const textDelay = Math.max(0, Math.min(120_000, st.text_delay_ms ?? 1500));

    // 🛡️ Anti-repetição: se o MESMO step (por step_key OU id) saiu como outbound
    // nos últimos 10 minutos, não reenvia (texto nem mídia). Evita os disparos
    // duplicados de "Vou explicar..." / "Deu para entender..." observados nos logs.
    try {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const { data: recent } = await ctx.supabase
        .from("conversations")
        .select("conversation_step, created_at")
        .eq("customer_id", ctx.customer.id)
        .eq("message_direction", "outbound")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);
      const rows: any[] = (recent as any[]) || [];
      const stepIds = new Set<string>([
        st.id,
        st.step_key,
        `flow:${st.id}`,
        `flow:${st.step_key}`,
      ]);
      const hit = rows.find((r) => stepIds.has(String(r.conversation_step || "")));
      if (hit) {
        const ageSec = Math.round((Date.now() - new Date(hit.created_at).getTime()) / 1000);
        console.log(`[conversational] 🛡️ anti-rep emitStep ${st.step_key} (saiu há ${ageSec}s) — pulando reenvio`);
        return { replyText: "", inlineSent: true };
      }
      if (text) {
        const normalizedText = text.trim().replace(/\s+/g, " ");
        const { data: recentText } = await ctx.supabase
          .from("conversations")
          .select("message_text, created_at")
          .eq("customer_id", ctx.customer.id)
          .eq("message_direction", "outbound")
          .eq("message_type", "text")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10);
        const duplicateText = ((recentText as any[]) || []).find((r) =>
          String(r.message_text || "").trim().replace(/\s+/g, " ") === normalizedText,
        );
        if (duplicateText) {
          const ageSec = Math.round((Date.now() - new Date(duplicateText.created_at).getTime()) / 1000);
          console.log(`[conversational] 🛡️ anti-rep texto step=${st.step_key} (mesmo texto saiu há ${ageSec}s) — pulando reenvio`);
          return { replyText: "", inlineSent: true };
        }
      }
    } catch (_e) { /* best-effort */ }


    // Quando é reply final, o texto vai como reply (não inline). Quando é cascade
    // ou quando o consultor pediu texto antes da mídia, mandamos tudo inline aqui.
    const slotKey = st.slot_key || st.step_key || st.id;
    const uiOrder = await getStepMediaOrder(ctx.supabase, consultantId, slotKey);
    const stepOrder = Array.isArray(st.media_order) && st.media_order.length > 0
      ? st.media_order.map((k) => String(k).toLowerCase())
      : null;
    const configuredOrder = uiOrder || stepOrder;
    const textComesBeforeAllMedia = !!text && Array.isArray(configuredOrder)
      && configuredOrder.length > 0
      && configuredOrder.indexOf("text") >= 0
      && configuredOrder.every((k, i) => k !== "text" ? configuredOrder.indexOf("text") < i : true);

    // Texto entra inline (na posição certa) em qualquer caso, EXCETO quando:
    // - é o reply final E não há ordem configurada (mantém comportamento legado: texto vira reply)
    // - é o reply final E a ordem termina em "text" (texto fica por último → vira reply)
    const orderEndsWithText = Array.isArray(configuredOrder) && configuredOrder.length > 0
      && configuredOrder[configuredOrder.length - 1] === "text";
    const sendTextInline = !!text && (!asReply || !orderEndsWithText && !!configuredOrder);

    let mediaResult: { mediaSent: boolean | null; textSentInline: boolean } =
      { mediaSent: false, textSentInline: false };
    try {
      mediaResult = await sendStepMedia(
        ctx, st, consultantId, false,
        sendTextInline ? { text, delayMs: textDelay } : null,
      );
    } catch (e) {
      console.error(`[conversational] sendStepMedia threw em step=${st.step_key}:`, (e as Error)?.message || e);
      mediaResult = { mediaSent: null, textSentInline: false };
    }
    const mediaSent = mediaResult.mediaSent;
    const inlineMedia = mediaSent === true;
    console.log(`[conversational] emitStep step=${st.step_key} asReply=${asReply} media=${mediaSent} hasText=${!!text} textInline=${mediaResult.textSentInline} order=${JSON.stringify(configuredOrder)}`);

    if (!text) {
      if (mediaSent === null) {
        console.warn(`[conversational] ⚠️ step=${st.step_key}: mídia falhou e sem texto fallback — continuando cascata`);
      }
      // 🛟 Fallback anti-pulo-silencioso: se o passo não tem texto, nem mídia foi
      // enviada (mediaSent !== true), usa o título do passo como mensagem mínima.
      // Evita que passos "router" (transitions sem conteúdo) avancem invisíveis.
      if (mediaSent !== true && st.title && String(st.title).trim().length > 0) {
        const fallbackText = String(st.title).trim();
        console.warn(`[conversational] 🛟 step=${st.step_key} sem texto/mídia — usando título como fallback: "${fallbackText}"`);
        if (asReply) {
          return { replyText: fallbackText, inlineSent: false };
        }
        try {
          await ctx.sender.sendText(ctx.remoteJid, fallbackText);
          if (ctx.customer?.id) {
            await ctx.supabase.from("conversations").insert({
              customer_id: ctx.customer.id,
              message_direction: "outbound",
              message_text: fallbackText,
              message_type: "text",
              conversation_step: st.step_key,
            });
          }
        } catch (e) {
          console.error(`[conversational] fallback sendText falhou step=${st.step_key}:`, (e as Error)?.message || e);
        }
        return { replyText: "", inlineSent: true };
      }
      return { replyText: "", inlineSent: inlineMedia };
    }

    // Se o texto já foi enviado inline na posição configurada, não devolve replyText.
    if (mediaResult.textSentInline) {
      return { replyText: "", inlineSent: true };
    }

    // Texto ainda não enviado: aplica text_delay e devolve como reply (asReply)
    // ou envia inline como cascade (último recurso, sem ordem configurada).
    if (textDelay > 0 && !isTestMode()) {
      await new Promise((r) => setTimeout(r, textDelay));
    }
    if (asReply) {
      return { replyText: text, inlineSent: inlineMedia };
    }
    try {
      await ctx.sender.sendText(ctx.remoteJid, text);
      // A1: log cascade text in conversations (was silently sent before)
      try {
        if (ctx.customer?.id) {
          await ctx.supabase.from("conversations").insert({
            customer_id: ctx.customer.id,
            message_direction: "outbound",
            message_text: text,
            message_type: "text",
            conversation_step: st.step_key,
          });
        }
      } catch (_) { /* noop */ }
    } catch (e) {
      console.error(`[conversational] cascade sendText falhou step=${st.step_key}:`, (e as Error)?.message || e);
      try {
        if (ctx.customer?.id) {
          await ctx.supabase.from("conversations").insert({
            customer_id: ctx.customer.id,
            message_direction: "outbound",
            message_text: `[failed:text] ${(e as Error)?.message || e}`,
            message_type: "text_failed",
            conversation_step: st.step_key,
          });
        }
      } catch (_) { /* noop */ }
    }
    return { replyText: "", inlineSent: true };
  };

  const goToStep = async (s: DbStep, extra: Record<string, any> = {}) => {
    // text_delay_ms é aplicado dentro de emitStep (após mídia, antes do texto).
    // Não esperamos aqui pra não criar espera dupla antes da mídia.

    const cadastroStep = stepTypeToCadastro(s.step_type);
    let nextConversationStep = cadastroStep || s.id;

    // Decide se este step vai cascatear (wait_for=none). Cascade segue fallback.goto
    // OU, se o consultor deixou repeat/sem goto mas marcou none, próximo por position.
    // GUARD: passos que capturam dados (name/cpf/valor/telefone) SEMPRE esperam resposta,
    // mesmo se configurados como wait_for=none — caso contrário o bot pergunta e cascateia.
    const stepCapturesAnything = Array.isArray(s.captures)
      && s.captures.some((c: any) => c?.enabled !== false && c?.field);
    const effectiveWaitFor = stepCapturesAnything ? "reply" : s.wait_for;
    const hasNextActive = !!dbSteps.find((step) => step.is_active && step.position > s.position);
    const gotoTargetId = s.fallback?.mode === "goto" ? s.fallback?.goto_step_id : null;
    const willCascade = !cadastroStep && effectiveWaitFor === "none"
      && (!!gotoTargetId || hasNextActive);

    const first = await emitStep(s, !willCascade);
    let replyText = first.replyText;
    let inlineSent = first.inlineSent;

    // Se o passo é do tipo cadastro mas o consultor não configurou texto/mídia,
    // emite o prompt padrão para não deixar o lead no escuro.
    if (cadastroStep && !replyText && !inlineSent) {
      if (cadastroStep === "aguardando_conta") {
        replyText = await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars);
      } else if (cadastroStep === "aguardando_doc_auto") {
        replyText = "📸 Agora preciso do seu *documento com foto* (RG ou CNH).\n\nEnvie a *frente* do documento.";
      } else if (cadastroStep === "ask_email") {
        replyText = "📧 Me passa seu *e-mail* (pode ser de qualquer provedor — Gmail, Outlook, iCloud, Yahoo...).";
      } else if (cadastroStep === "ask_phone_confirm") {
        replyText = "📞 Esse número é seu telefone de contato?\n\n1️⃣ ✅ Sim\n2️⃣ 📱 Outro número";
      } else if (cadastroStep === "ask_finalizar") {
        replyText = "✅ Tudo pronto! Toque no botão *Finalizar* ou responda *FINALIZAR* para concluir.";
      }
    }

    // Persiste o step alvo ANTES de dispatchar mídia pesada (anti-race entre webhooks paralelos).
    if (ctx.customer?.id) {
      try {
        await ctx.supabase
          .from("customers")
          .update({ conversation_step: nextConversationStep, last_step_advanced_at: new Date().toISOString() })
          .eq("id", ctx.customer.id);
      } catch (_) { /* best-effort */ }
    }

    // Se o passo `message` não tem texto E não enviou nada inline (sem mídia válida),
    // não devemos cascatear silenciosamente — isso faz o lead "perder" passos.
    // Persistimos o lead nele e paramos; a próxima inbound dispara repeat e emite mídia anexada.
    const firstIsSilentEmpty = !cadastroStep
      && !replyText
      && !inlineSent
      && !String(s.message_text || "").trim();
    if (firstIsSilentEmpty) {
      console.log(`[cascade-stop] pos=${s.position} step=${s.step_key} motivo=step-vazio-sem-midia`);
    }
    let cursor: DbStep | null = (cadastroStep || firstIsSilentEmpty) ? null : s;
    // Helper para achar próximo step. ORDEM DE PRIORIDADE:
    //   1) transitions[default].goto_step_id — configuração explícita do consultor
    //   2) fallback.goto_step_id — somente se não houver transition default
    //   3) próximo por position — último recurso
    // (Antes priorizávamos fallback, o que fazia 5 → 7 pular o 6.)
    const findCascadeNext = (cur: DbStep): DbStep | undefined => {
      const defaultT = Array.isArray(cur.transitions)
        ? cur.transitions.find((t: any) => t?.trigger_intent === "default" && t?.goto_step_id)
        : null;
      if (defaultT?.goto_step_id) {
        const byDefault = dbSteps.find((step) => step.id === defaultT.goto_step_id && step.is_active);
        if (byDefault) return byDefault;
      }
      const gotoId = cur.fallback?.mode === "goto" ? cur.fallback.goto_step_id : null;
      if (gotoId) {
        const byGoto = dbSteps.find((step) => step.id === gotoId && step.is_active);
        if (byGoto) return byGoto;
      }
      return dbSteps.find((step) => step.is_active && step.position > cur.position);
    };
    // C1: guard reduzido (6→3) e cada hop com timeout — se a Edge Function
    // estourar 20s, perdíamos passos no meio da cascata sem deixar rastro.
    // Heurística: passo cujo texto termina em "?" é uma pergunta — aguarda resposta
    // mesmo se o consultor marcou wait_for=none por descuido.
    const _looksLikeQuestion = (st: DbStep): boolean =>
      String(st?.message_text || "")
        .trim()
        .replace(/[\s\u200B-\u200D\uFEFF]+$/g, "")
        .endsWith("?");
    // Captura textual (kind=text) ou com field — qualquer uma exige espera por resposta.
    const _hasTextCapture = (st: DbStep): boolean =>
      Array.isArray(st.captures) && st.captures.some((c: any) =>
        c?.enabled !== false && (c?.field || c?.kind === "text" || c?.name === "resposta_texto")
      );
    const cursorCascades = (st: DbStep): boolean => {
      if (_hasTextCapture(st)) return false;
      if (st.wait_for !== "none") return false;
      if (_looksLikeQuestion(st)) return false;
      return true;
    };
    for (let guard = 0; cursor && cursorCascades(cursor) && guard < 3; guard++) {
      const nextStep = findCascadeNext(cursor);
      if (!nextStep) {
        console.log(`[conversational] cascade parou em step=${cursor.step_key} (sem próximo step ativo)`);
        break;
      }
      if (nextStep.id === cursor.id) {
        console.warn(`[conversational] cascade quebrada step=${cursor.step_key} aponta para si mesmo`);
        break;
      }

      const cascadeCadastroStep = stepTypeToCadastro(nextStep.step_type);
      // Se o próximo passo parece pergunta, emite uma vez e para — não cascateia além.
      const nextIsQuestion = !cascadeCadastroStep && _looksLikeQuestion(nextStep);
      const nextWillCascade = !cascadeCadastroStep && !nextIsQuestion
        && nextStep.wait_for === "none"
        && !!findCascadeNext(nextStep);

      // PERSIST FIRST: marca o lead já no nextStep ANTES de enviar mídia pesada.
      // Se o envio demorar e a Edge Function reentrar, não regredimos pro passo
      // anterior nem reprocessamos a captura.
      nextConversationStep = cascadeCadastroStep || nextStep.id;
      if (ctx.customer?.id) {
        try {
          await ctx.supabase
            .from("customers")
            .update({ conversation_step: nextConversationStep, last_step_advanced_at: new Date().toISOString() })
            .eq("id", ctx.customer.id);
        } catch (_) { /* noop */ }
      }

      // Timeout ampliado para 30s — vídeos/áudios pesados (boas_vindas/como_funciona)
      // chegam a levar 15-25s de upload+envio. Se passar de 30s, paramos cascade
      // mas o lead já está persistido no passo correto.
      let emit: { replyText: string; inlineSent: boolean };
      try {
        emit = await Promise.race([
          emitStep(nextStep, !nextWillCascade),
          new Promise<{ replyText: string; inlineSent: boolean }>((_r, rej) =>
            setTimeout(() => rej(new Error("cascade_hop_timeout")), 30_000),
          ),
        ]);
      } catch (e) {
        console.warn(`[conversational] ⏱️ cascade hop timeout em ${nextStep.step_key} (lead persistido em ${nextConversationStep})`);
        break;
      }

      if (emit.replyText) replyText = emit.replyText;
      inlineSent = inlineSent || emit.inlineSent;
      console.log(`[conversational] auto-cascade ${cursor.step_key} → ${nextStep.step_key} (wait_for=${nextStep.wait_for})`);

      // G1: telemetria por hop — sem isso parece que pulamos passos.
      try {
        await ctx.supabase.from("bot_step_transitions").insert({
          customer_id: ctx.customer?.id || null,
          consultant_id: consultantId,
          phone: ctx.remoteJid?.replace(/\D/g, "") || null,
          from_step: cursor.step_key,
          to_step: nextStep.step_key,
          intent: "cascade",
        });
      } catch (_) { /* noop */ }

      if (cascadeCadastroStep) break;
      if (nextIsQuestion) {
        console.log(`[cascade-stop] pos=${nextStep.position} step=${nextStep.step_key} motivo=pergunta(text ends with ?)`);
        cursor = nextStep;
        break;
      }
      cursor = nextStep;
    }

    return {
      reply: replyText,
      updates: { conversation_step: nextConversationStep, __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, __inline_sent: inlineSent || undefined, ...extra },
    };
  };
  // Repeat inteligente: se a MESMA pergunta já foi enviada nos últimos 90s,
  // manda uma reformulação curta em vez de repetir literal (sem reenviar mídia).
  // Isso evita o "disco riscado" que o lead vê quando responde algo fora do esperado.
  const repeatCurrent = async (): Promise<BotResult> => _smartRepeat();
  const _smartRepeat = async (): Promise<BotResult> => {
    // GUARD 0: se este turno extraiu QUALQUER dado válido, NUNCA reformula —
    // significa que o lead respondeu e devemos avançar via fluxo (não nudge).
    if (Object.keys(captureUpdates).length > 0) {
      console.log(`[smart-repeat] skip nudge — captureUpdates=${Object.keys(captureUpdates).join(",")} (avança via fluxo)`);
      return { reply: "", updates: { conversation_step: currentStep.id, ...captureUpdates, ...restoreDetourUpdates, __inline_sent: true } };
    }
    // GUARD 1: debounce — se houve outbound nos últimos 30s, não nudge.
    try {
      const sinceDebounce = new Date(Date.now() - 30_000).toISOString();
      const { count: recentOut } = await ctx.supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", ctx.customer.id)
        .eq("message_direction", "outbound")
        .gte("created_at", sinceDebounce);
      if ((recentOut ?? 0) > 0) {
        return { reply: "", updates: { conversation_step: currentStep.id, ...restoreDetourUpdates } };
      }
    } catch (_) { /* segue */ }
    const baseText = renderStepText(currentStep);
    if (!baseText) return goToStep(currentStep, restoreDetourUpdates);
    let lastSameTextCount = 0;
    try {
      const since = new Date(Date.now() - 90_000).toISOString();
      const { data: recent } = await ctx.supabase
        .from("conversations")
        .select("message_text, message_type")
        .eq("customer_id", ctx.customer.id)
        .eq("message_direction", "outbound")
        .eq("message_type", "text")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);
      lastSameTextCount = ((recent as any[]) || []).filter(
        (r) => (r.message_text || "").trim() === baseText.trim(),
      ).length;
    } catch (_) { /* segue normal */ }

    if (lastSameTextCount === 0) {
      return goToStep(currentStep, restoreDetourUpdates);
    }

    // Já mandou esse texto nos últimos 90s → reformula, SEM reenviar mídia.
    // Sprint C4: pool ampliado + fallback de escalonamento quando esgotar
    const userName = vars.nome || ctx.customer.name || "";
    const reformVariants: Record<string, string[]> = {
      default: [
        "Pode me responder, por favor? 🙂",
        "Tô aqui esperando sua resposta 😉",
        "Me conta aí, posso te ajudar!",
        userName ? `${userName}, me dá um retorno rapidinho? 🙏` : "Me dá um retorno rapidinho? 🙏",
        "Posso continuar? É só responder aqui 😊",
        "Sem pressa, mas se puder me responder eu sigo o atendimento 🙂",
      ],
      valor: [
        userName ? `${userName}, me passa só o valor médio da conta de luz, por favor? Pode ser aproximado 😉` : "Me passa só o valor médio da conta de luz, por favor? Pode ser aproximado 😉",
        "Quanto vem em média sua conta de luz? Tipo R$ 200, R$ 400...",
        "Pode mandar só o número mesmo, ex: 350 🙏",
        "Me diz uma média da conta — não precisa ser exato, ok?",
        "Quanto você paga mais ou menos por mês de luz?",
      ],
      nome: [
        "Como posso te chamar? Só seu primeiro nome já tá ótimo 😊",
        "Me conta seu nome, por favor 🙂",
        "Qual seu nome? Pode ser só o primeiro 😉",
        "Me diz seu nome pra eu te chamar direitinho 🙏",
      ],
    };
    const stepKeyLower = (currentStep.title || currentStep.step_key || "").toLowerCase();
    const variantKey = /valor|conta/.test(stepKeyLower)
      ? "valor"
      : /nome|chama/.test(stepKeyLower)
      ? "nome"
      : "default";
    const pool = reformVariants[variantKey];

    // Esgotou o pool (5+ repetições da mesma pergunta) → escala silenciosamente pra humano
    if (lastSameTextCount >= pool.length) {
      console.warn(`[smart-repeat] pool esgotado em "${currentStep.step_key}" após ${lastSameTextCount} repetições — escalando`);
      try {
        await ctx.supabase.from("bot_handoff_alerts").insert({
          customer_id: ctx.customer.id,
          consultant_id: ctx.customer.consultant_id,
          reason: "lead_nao_responde",
          metadata: { step: currentStep.step_key, repetitions: lastSameTextCount },
        });
      } catch (_) { /* noop */ }
      return {
        reply: userName ? `${userName}, vou pedir pra um consultor humano te chamar daqui a pouco, ok? 🤝` : "Vou pedir pra um consultor humano te chamar daqui a pouco, ok? 🤝",
        updates: {
          conversation_step: currentStep.id,
          bot_paused: true,
          bot_paused_reason: "lead_nao_responde",
          bot_paused_at: new Date().toISOString(),
          __intent: cls.intent,
          __confidence: cls.confidence,
          ...captureUpdates,
          ...restoreDetourUpdates,
        },
      };
    }
    const reform = pool[Math.min(lastSameTextCount - 1, pool.length - 1)];

    return {
      reply: reform,
      updates: {
        conversation_step: currentStep.id,
        __intent: cls.intent,
        __confidence: cls.confidence,
        ...captureUpdates,
        ...restoreDetourUpdates,
      },
    };
  };

  // Resolve a transition (special or step) — sempre propaga restoreDetourUpdates
  // para limpar flags de detour quando o lead seguir o fluxo normal.
  const resolveTransition = async (t: DbTransition): Promise<BotResult> => {
    if (t.goto_special === "cadastro") {
      const docStep = findActiveByType("capture_documento");
      if (docStep) return goToStep(docStep, restoreDetourUpdates);
      const contaStep = findActiveByType("capture_conta");
      if (contaStep) return goToStep(contaStep, restoreDetourUpdates);
      return {
        reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
        updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
      };
    }
    if (t.goto_special === "humano") {
      return {
        reply: await getTemplate(ctx.supabase, "aguardando_humano", "avisado", vars),
        updates: { conversation_step: "aguardando_humano", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
      };
    }
    if (t.goto_special === "repeat" || (!t.goto_step_id && !t.goto_special)) return repeatCurrent();
    const nextStep = dbSteps.find((s) => s.id === t.goto_step_id);
    if (!nextStep || !nextStep.is_active) return repeatCurrent();
    if (nextStep.step_key === "cadastro" || CADASTRO_STEPS.has(nextStep.step_key)) {
      const docStep = findActiveByType("capture_documento");
      if (docStep) return goToStep(docStep, restoreDetourUpdates);
      return {
        reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
        updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
      };
    }
    return goToStep(nextStep, restoreDetourUpdates);
  };

  // Helper: emite o conteúdo do passo atual (slot/texto) ANTES de pular para o
  // próximo. Evita pular passos com áudio/vídeo configurados quando o motor
  // auto-avança por captura/posição/default transition. O anti-rep interno do
  // emitStep (10 min) protege contra duplicidade se já foi emitido nesta sessão.
  const emitCurrentBeforeGoto = async (cur: DbStep, next: DbStep) => {
    if (!cur || !next || cur.id === next.id) return;
    const hasSlot = !!(cur.slot_key && String(cur.slot_key).trim());
    const hasText = !!(cur.message_text && String(cur.message_text).trim());
    if (!hasSlot && !hasText) return;
    try {
      console.log(`[emit-before-goto] emitindo "${cur.step_key}" antes de avançar para "${next.step_key}"`);
      await emitStep(cur, false);
    } catch (e) {
      console.warn(`[emit-before-goto] falhou em ${cur.step_key}:`, (e as Error)?.message || e);
    }
  };

  // 1) A regular rule matched
  if (transition) return _finalize(stepKey, await resolveTransition(transition));


  // 1.5) Captura sem transição configurada → segue o Plano B configurado
  // (PREFERE fallback.goto_step_id — é o que o consultor configurou em /admin/fluxos).
  // Só cai pra próximo por posição como último recurso.
  if (hasCapture) {
    let nextByConfig: DbStep | undefined;
    const fbId = currentStep.fallback?.mode === "goto" ? currentStep.fallback.goto_step_id : null;
    if (fbId) nextByConfig = dbSteps.find((s) => s.is_active && s.id === fbId);
    if (!nextByConfig) {
      nextByConfig = dbSteps.find((s) => s.is_active && s.position > currentStep.position);
    }
    if (nextByConfig) {
      console.log(`[conversational] auto-advance por captura ${currentStep.step_key} → ${nextByConfig.step_key} (intents=${captureIntents.join(",")}, source=${fbId ? "fallback.goto" : "position"})`);
      if (nextByConfig.step_key === "cadastro" || CADASTRO_STEPS.has(nextByConfig.step_key)) {
        const docStep = findActiveByType("capture_documento");
        if (docStep) return _finalize(stepKey, await goToStep(docStep, restoreDetourUpdates));
        return _finalize(stepKey, {
          reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
          updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
        });
      }
      try {
        await emitCurrentBeforeGoto(currentStep, nextByConfig);
        return _finalize(stepKey, await goToStep(nextByConfig, restoreDetourUpdates));
      } catch (e) {
        console.error(`[conversational] 💥 goToStep falhou para ${nextByConfig.step_key}:`, (e as Error)?.message || e);
        // Salva pelo menos o avanço de step para não travar o lead no passo anterior.
        return _finalize(stepKey, {
          reply: "",
          updates: { conversation_step: nextByConfig.id, __inline_sent: true, ...captureUpdates, ...restoreDetourUpdates },
        });
      }
    }
  }

  // 1.75) GLOBAL KEYWORD RULES — fallback inteligente, com rate-limit por customer
  const rateLimitOk = ctx.customer.id ? _consumeCustomerRateLimit(String(ctx.customer.id)) : true;
  if (!rateLimitOk) {
    console.warn(`[conversational] ⛔ rate-limit: pulando regras para customer=${ctx.customer.id}`);
  }
  if (rateLimitOk) try {
    const ruleHit = await evaluateRules({
      supabase: ctx.supabase,
      flowId,
      consultantId,
      customerId: ctx.customer.id || null,
      currentStepId: currentStep.id,
      messageText: ctx.messageText || "",
      lastRuleFireAt: (ctx.customer as any).last_rule_fire_at || null,
      lastRuleId: (ctx.customer as any).last_rule_id || null,
      hasCapture,
    });
    if (ruleHit) {
      const { rule, matchedKeyword } = ruleHit;
      console.log(`[conversational] 🎯 rule hit "${rule.name}" (${matchedKeyword}) at step="${stepKey}" → ${rule.return_behavior}`);

      if (rule.media_id) {
        const { data: mr } = await ctx.supabase
          .from("ai_media_library").select("url, kind").eq("id", rule.media_id).maybeSingle();
        if (mr?.url) {
          const kind = ["audio","video","image"].includes(String(mr.kind)) ? String(mr.kind) : "document";
          let canSend = true;
          if (kind === "audio" || kind === "video" || kind === "image") {
            const { data } = await ctx.supabase.rpc("try_log_media_send", {
              _consultant_id: consultantId, _customer_id: ctx.customer.id,
              _media_id: rule.media_id, _slot_key: null, _kind: kind,
            });
            canSend = data !== false;
          }
          if (canSend) { try { await ctx.sender.sendMedia(ctx.remoteJid, mr.url, "", kind, Number((mr as any).duration_sec || 0) || undefined); } catch (_) {} }
        }
      }

      let nextStepKey: string = stepKey;
      const extraUpdates: Record<string, any> = {
        last_rule_id: rule.id, last_rule_fire_at: new Date().toISOString(),
      };
      if (rule.return_behavior === "goto_step" && rule.goto_step_id) {
        const target = dbSteps.find((s) => s.id === rule.goto_step_id);
        if (target) { nextStepKey = target.id; extraUpdates.previous_conversation_step = stepKey; }
      } else if (rule.return_behavior === "restart") {
        nextStepKey = firstActive.id; extraUpdates.previous_conversation_step = null;
      } else if (rule.return_behavior === "handoff") {
        nextStepKey = "aguardando_humano";
        extraUpdates.bot_paused = true;
        extraUpdates.bot_paused_reason = "rule_handoff";
        extraUpdates.bot_paused_at = new Date().toISOString();
      }

      await logRuleFire(ctx.supabase, {
        ruleId: rule.id, consultantId, customerId: ctx.customer.id || null,
        matchedKeyword, messageText: ctx.messageText || "",
        stepBefore: stepKey, stepAfter: nextStepKey, returnBehavior: rule.return_behavior,
      });

      const replyText = rule.response_text ? renderTemplate(rule.response_text, vars) : "";
      const hasReply = !!(replyText && replyText.trim().length > 0);
      const inlineSent = hasReply || !!rule.media_id;
      return _finalize(stepKey, {
        reply: hasReply ? replyText : "",
        updates: {
          conversation_step: nextStepKey,
          __inline_sent: inlineSent || undefined,
          ...captureUpdates,
          ...extraUpdates,
          ...restoreDetourUpdates,
        },
      });
    }
  } catch (e) {
    console.error("[conversational] rules-engine failed (ignorando)", e);
  }

  // 2) FALLBACK (Plano B)
  const fb = currentStep.fallback || { mode: "repeat" };
  if (fb.mode === "goto" && fb.goto_step_id) {
    const nextStep = dbSteps.find((s) => s.id === fb.goto_step_id);
      if (nextStep && nextStep.is_active) {
        const nextIsMediaOnly = !String(nextStep.message_text || "").trim();
        if (currentStep.captures?.some((c) => c.enabled !== false) && !hasCapture && nextIsMediaOnly) {
          console.log(`[conversational] fallback goto bloqueado: step=${stepKey} exige captura antes de ${nextStep.step_key}`);
          return _finalize(stepKey, await repeatCurrent());
        }
      if (nextStep.step_key === "cadastro" || CADASTRO_STEPS.has(nextStep.step_key)) {
        return _finalize(stepKey, {
          reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
          updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
        });
      }
      await emitCurrentBeforeGoto(currentStep, nextStep);
      return _finalize(stepKey, await goToStep(nextStep, restoreDetourUpdates));
    }
  }
  // Sprint A2: passo terminal nunca deve cair no fallback AI nem voltar pra cadastro —
  // o lead já está finalizando. Mantém no passo, sem regredir para documento/conta.
  if (currentStep.step_type === "finalizar_cadastro") {
    console.log(`[conversational] terminal step ${currentStep.step_key} → mantendo (sem regressão)`);
    return _finalize(stepKey, {
      reply: "",
      updates: { conversation_step: currentStep.id, __inline_sent: true, ...captureUpdates, ...restoreDetourUpdates },
    });
  }
  if (fb.mode === "ai" && fb.ai_prompt && !strictMode) {
    const candidates = dbSteps.filter(s => s.is_active && s.id !== currentStep.id).map(s => ({ id: s.id, step_key: s.step_key }));
    const choice = await aiDecideFallback(fb.ai_prompt, ctx.messageText || "", candidates, ctx.geminiApiKey, consultantId || "global");
    if (choice) {
      const upper = choice.toUpperCase();
      if (upper === "REPEAT") return _finalize(stepKey, await repeatCurrent());
      if (upper === "HUMANO") return _finalize(stepKey, await resolveTransition({ goto_special: "humano" } as DbTransition));
      if (upper === "CADASTRO") return _finalize(stepKey, await resolveTransition({ goto_special: "cadastro" } as DbTransition));
      const nextStep = dbSteps.find(s => s.step_key === choice);
      if (nextStep && nextStep.is_active) return _finalize(stepKey, await goToStep(nextStep, restoreDetourUpdates));
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
        if (docStep) return _finalize(stepKey, await goToStep(docStep, restoreDetourUpdates));
        return _finalize(stepKey, {
          reply: await getTemplate(ctx.supabase, "checkin_pos_video", "pedir_conta", vars),
          updates: { conversation_step: "aguardando_conta", sales_phase: "fechamento", __intent: cls.intent, __confidence: cls.confidence, ...captureUpdates, ...restoreDetourUpdates },
        });
      }
      await emitCurrentBeforeGoto(currentStep, nextByPosition);
      return _finalize(stepKey, await goToStep(nextByPosition, restoreDetourUpdates));
    }
  }

  // Default: repeat
  return _finalize(stepKey, await repeatCurrent());
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

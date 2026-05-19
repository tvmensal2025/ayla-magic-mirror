// Manual step sender: human takes over a conversation and triggers individual
// pieces (audio / image / video / text) of a configured flow step, on-demand.
// By default it does NOT advance conversation_step or unpause the bot. When
// continueFlow=true, it resumes the custom flow after the selected step.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createWhapiSender } from "../_shared/whapi-api.ts";
import { ensureAudioTranscript } from "../_shared/audio-transcript.ts";

type Part = "text" | "audio" | "image" | "video" | "document" | "all";

interface Body {
  consultantId: string;
  customerId: string;
  stepId?: string;   // bot_flow_steps.id
  stepKey?: string;  // alternative lookup
  part: Part;        // which piece to send (or "all")
  mediaId?: string;  // when there are multiple medias of same kind, target one
  continueFlow?: boolean; // resume flow after sending the selected full step
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth: must be logged-in user matching consultantId OR super_admin
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await userClient.auth.getUser(jwt);
    const userId = userRes?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.consultantId || !body?.customerId || !body?.part) {
      return json({ error: "missing_fields", message: "Faltam dados obrigatórios (consultor, cliente ou parte)." }, 400);
    }
    // Allow if same consultant OR has super_admin role
    if (userId !== body.consultantId) {
      const { data: isAdmin } = await supabase.rpc("is_super_admin", { _user_id: userId });
      if (!isAdmin) return json({ error: "forbidden", message: "Sem permissão." }, 403);
    }

    // Resolve customer + phone
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone_whatsapp, consultant_id, electricity_bill_value, flow_variant, conversation_step, last_custom_prompt_at")
      .eq("id", body.customerId)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found", message: "Lead não encontrado." }, 404);

    const rawPhone = String(customer.phone_whatsapp || "");
    if (rawPhone.startsWith("sem_celular_")) {
      return json({
        error: "lead_sem_whatsapp",
        message: "Esse lead foi importado via Excel sem celular válido — não dá pra enviar pelo WhatsApp.",
      }, 400);
    }
    const phoneDigits = rawPhone.replace(/\D/g, "");
    if (!phoneDigits || phoneDigits.length < 10) {
      return json({
        error: "customer_no_phone",
        message: "Lead sem número de WhatsApp válido.",
      }, 400);
    }
    const remoteJid = `${phoneDigits}@s.whatsapp.net`;

    // Resolve step
    let stepQuery = supabase
      .from("bot_flow_steps")
      .select("id, step_key, slot_key, message_text, media_order, flow_id, step_type, position, transitions, captures")
      .eq("is_active", true);
    const variant = (customer as any)?.flow_variant || "A";
    if (body.stepId) stepQuery = stepQuery.eq("id", body.stepId);
    else if (body.stepKey) {
      const { data: flow } = await supabase
        .from("bot_flows")
        .select("id")
        .eq("consultant_id", body.consultantId)
        .eq("is_active", true)
        .eq("variant", variant)
        .maybeSingle();
      if (!flow?.id) return json({ error: "no_active_flow", message: "Nenhum fluxo ativo encontrado para essa variante." }, 404);
      stepQuery = stepQuery.eq("flow_id", flow.id).eq("step_key", body.stepKey);
    } else return json({ error: "missing_step", message: "Passo do fluxo não informado." }, 400);

    const { data: step } = await stepQuery.maybeSingle();
    if (!step) return json({ error: "step_not_found", message: "Passo selecionado não existe mais (foi removido ou desativado)." }, 404);

    const slotKey = (step as any).slot_key || (step as any).step_key;

    // Resolve medias for slot
    const { data: mediaRows } = await supabase
      .from("ai_media_library")
      .select("id, kind, url, slot_key, send_order, duration_sec, transcript, label")
      .eq("consultant_id", body.consultantId)
      .eq("slot_key", slotKey)
      .eq("active", true)
      .eq("is_draft", false)
      .order("send_order", { ascending: true });
    let medias = ((mediaRows as any[]) || []).filter((m) => !!m?.url);
    if (variant === "B") {
      const transformed: any[] = [];
      for (const m of medias) {
        if (String(m.kind).toLowerCase() !== "audio") { transformed.push(m); continue; }
        const transcript = await ensureAudioTranscript(supabase, m);
        if (transcript && transcript.trim()) {
          transformed.push({ ...m, _asText: true, _transcript: transcript.trim() });
          console.log(`[manual-step-send] variant=B: audio "${m.label || m.id}" → text (${transcript.length} chars)`);
        } else {
          console.warn(`[manual-step-send] variant=B: audio "${m.label || m.id}" sem transcript → pulado`);
        }
      }
      medias = transformed;
    }


    // Whapi token
    const { data: settingsRows } = await supabase.from("settings").select("key,value");
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((s: any) => { settings[s.key] = s.value; });
    const whapiToken = settings.whapi_token || Deno.env.get("WHAPI_TOKEN") || "";
    if (!whapiToken) return json({ error: "whapi_token_missing" }, 500);

    const sender = createWhapiSender(whapiToken);

    // Build variables for text rendering
    const firstName = String((customer as any).name || "").trim().split(/\s+/)[0] || "";
    const billValue = Number((customer as any).electricity_bill_value || 0);
    const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const vars: Record<string, string> = {
      "{nome}": firstName,
      "{{nome}}": firstName,
      "{nome_completo}": String((customer as any).name || ""),
      "{{nome_completo}}": String((customer as any).name || ""),
      "{valor}": fmtBRL(billValue),
      "{{valor}}": fmtBRL(billValue),
      "{economia_mensal}": fmtBRL(billValue * 0.20),
      "{{economia_mensal}}": fmtBRL(billValue * 0.20),
      "{economia_anual}": fmtBRL(billValue * 0.20 * 12),
      "{{economia_anual}}": fmtBRL(billValue * 0.20 * 12),
    };
    const applyVars = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
    const renderedText = (step as any).message_text ? applyVars(String((step as any).message_text)) : "";

    // Build items list per part request
    type Item = { kind: string; text?: string; media?: any };
    const allItems: Item[] = [];
    medias.forEach((m) => {
      if ((m as any)._asText) {
        allItems.push({ kind: "text", text: String((m as any)._transcript || "") });
      } else {
        allItems.push({ kind: String(m.kind || "document").toLowerCase(), media: m });
      }
    });
    if (renderedText.trim()) allItems.push({ kind: "text", text: renderedText });

    let toSend: Item[] = [];
    if (body.part === "all") {
      const order = Array.isArray((step as any).media_order) && (step as any).media_order.length > 0
        ? (step as any).media_order.map((k: any) => String(k).toLowerCase())
        : ["audio", "image", "video", "text", "document"];
      toSend = [...allItems].sort((a, b) => {
        const ia = order.indexOf(a.kind); const ib = order.indexOf(b.kind);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    } else if (body.part === "text") {
      if (renderedText.trim()) toSend = [{ kind: "text", text: renderedText }];
    } else {
      const targeted = allItems.filter((it) => it.kind === body.part);
      const chosen = body.mediaId ? targeted.find((it) => it.media?.id === body.mediaId) : targeted[0];
      if (chosen) toSend = [chosen];
    }

    // Se o passo é de captura (capture_*, confirm_phone, finalizar_cadastro)
    // e nada foi montado para enviar, gera um prompt automático.
    const stepType = String((step as any).step_type || "message");
    const isCaptureStep = stepType !== "message";
    if (isCaptureStep && toSend.length === 0) {
      const promptRaw = resolveCapturePrompt(step, renderedText);
      if (promptRaw) {
        const prompt = applyVars(promptRaw);
        const legacyStep = mapCaptureStepToLegacy(stepType, (step as any).id, (step as any).step_key);

        // Debounce: se prompt enviado recentemente e lead já está no destino, pula.
        const lastPromptAt = (customer as any).last_custom_prompt_at
          ? new Date((customer as any).last_custom_prompt_at).getTime()
          : 0;
        const sameStep = String((customer as any).conversation_step || "") === legacyStep;
        if (sameStep && Date.now() - lastPromptAt < 20_000) {
          return json({
            ok: true,
            sent: [],
            skipped: "recent_prompt",
            message: "Pergunta já enviada há poucos segundos — aguarde a resposta do cliente.",
          });
        }

        await sender.sendText(remoteJid, prompt);
        await supabase.from("conversations").insert({
          customer_id: customer.id,
          message_direction: "outbound",
          message_text: prompt,
          message_type: "text",
          conversation_step: legacyStep,
        });
        await supabase.from("customers").update({
          conversation_step: legacyStep,
          bot_paused: false,
          bot_paused_reason: null,
          bot_paused_at: null,
          bot_paused_until: null,
          assigned_human_id: null,
          custom_step_retries: 0,
          custom_step_retries_step: null,
          last_custom_prompt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", customer.id);

        return json({
          ok: true,
          sent: [{ kind: "text", auto_prompt: true }],
          continued: true,
          next_step: legacyStep,
        });
      }
    }

    if (toSend.length === 0) {
      // Nothing to send (step has no media/text for this part). If the caller asked
      // to continue the flow, still reposition the lead onto this step and unpause.
      if (body.continueFlow && body.part === "all") {
        await supabase.from("customers").update({
          conversation_step: (step as any).step_key || (step as any).id,
          bot_paused: false,
          bot_paused_reason: null,
          bot_paused_at: null,
          bot_paused_until: null,
          assigned_human_id: null,
          custom_step_retries: 0,
          custom_step_retries_step: null,
          updated_at: new Date().toISOString(),
        }).eq("id", customer.id);
        return json({
          ok: true,
          sent: [],
          continued: true,
          next_step: (step as any).step_key || (step as any).id,
          message: "Passo sem mídia/texto — lead reposicionado sem envio.",
        });
      }
      return json({
        ok: false,
        error: "nothing_to_send",
        message: "Esse passo não tem mídia nem texto configurado para enviar.",
      }, 400);
    }

    const sentLog: any[] = [];
    for (let i = 0; i < toSend.length; i++) {
      const it = toSend[i];
      const isLast = i === toSend.length - 1;
      if (it.kind === "text" && it.text) {
        await sender.sendText(remoteJid, it.text);
        await supabase.from("conversations").insert({
          customer_id: customer.id,
          message_direction: "outbound",
          message_text: it.text,
          message_type: "text",
          conversation_step: (step as any).step_key || null,
        });
        sentLog.push({ kind: "text" });
      } else if (it.media?.url) {
        const kind = ["audio", "video", "image"].includes(it.kind) ? it.kind : "document";
        await sender.sendMedia(remoteJid, it.media.url, "", kind, Number(it.media.duration_sec || 0) || undefined);
        await supabase.from("conversations").insert({
          customer_id: customer.id,
          message_direction: "outbound",
          message_text: `[${kind}:${it.media.slot_key || slotKey}] (manual)`,
          message_type: kind,
          conversation_step: (step as any).step_key || null,
        });
        sentLog.push({ kind, mediaId: it.media.id });
      }
      if (!isLast) await new Promise((r) => setTimeout(r, 1200));
    }

    const flowPatch = body.continueFlow && body.part === "all"
      ? await buildContinuationPatch(supabase, sender, remoteJid, body.consultantId, customer, step, vars, variant)
      : null;
    if (flowPatch) {
      await supabase.from("customers").update(flowPatch).eq("id", customer.id);
    }

    return json({ ok: true, sent: sentLog, continued: !!flowPatch, next_step: flowPatch?.conversation_step });
  } catch (e) {
    console.error("[manual-step-send] error", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

async function buildContinuationPatch(supabase: any, sender: any, remoteJid: string, consultantId: string, customer: any, step: any, vars: Record<string, string>, variant: string = "A") {
  const patch: any = {
    bot_paused: false,
    bot_paused_reason: null,
    bot_paused_at: null,
    assigned_human_id: null,
    custom_step_retries: 0,
    custom_step_retries_step: null,
    updated_at: new Date().toISOString(),
  };

  // Encadeia passos consecutivos do tipo "message" (sem capture nem aguardando resposta),
  // até esbarrar num passo que exige input do cliente.
  let cursorPos = Number(step.position) || 0;
  let lastReached: any = null;
  const MAX_CHAIN = 6; // proteção contra loop

  for (let i = 0; i < MAX_CHAIN; i++) {
    const { data: next } = await supabase
      .from("bot_flow_steps")
      .select("id, step_key, slot_key, message_text, media_order, step_type, position, captures, transitions")
      .eq("flow_id", step.flow_id)
      .eq("is_active", true)
      .gt("position", cursorPos)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!next) {
      if (!lastReached) patch.conversation_step = "finalizando";
      break;
    }
    lastReached = next;
    cursorPos = Number(next.position) || cursorPos + 1;

    const ntype = String(next.step_type || "message");
    // Passos que exigem input do cliente — para a cadeia, posiciona o lead
    // e dispara o prompt da captura (message_text → retry_text → fallback).
    if (ntype !== "message") {
      const legacy = mapCaptureStepToLegacy(ntype, next.id, next.step_key);
      patch.conversation_step = legacy;
      const applyVars = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
      const rendered = next.message_text ? applyVars(String(next.message_text)) : "";
      const promptRaw = resolveCapturePrompt(next, rendered);
      if (promptRaw) {
        const prompt = applyVars(promptRaw);
        try {
          await sender.sendText(remoteJid, prompt);
          await supabase.from("conversations").insert({
            customer_id: customer.id,
            message_direction: "outbound",
            message_text: prompt,
            message_type: "text",
            conversation_step: legacy,
          });
          patch.last_custom_prompt_at = new Date().toISOString();
        } catch (e) {
          console.error(`[manual-step-send] falha ao enviar prompt do capture (${ntype}):`, (e as Error).message);
        }
      }
      break;
    }

    // Passo do tipo message — envia agora e segue para o próximo.
    patch.conversation_step = next.id;
    const sentNext = await sendConfiguredStep(supabase, sender, remoteJid, consultantId, customer.id, next, vars, variant);
    if (sentNext) patch.last_custom_prompt_at = new Date().toISOString();

    // Se tem regras de transição esperando resposta do cliente, para aqui.
    const hasTransitions = Array.isArray(next.transitions) && next.transitions.length > 0;
    if (hasTransitions) break;

    // Pequeno delay entre passos encadeados.
    await new Promise((r) => setTimeout(r, 2500));
  }

  console.log(`[manual-step-send] continueFlow step=${step.step_key || step.id} consultant=${consultantId} final=${patch.conversation_step}`);
  return patch;
}

async function sendConfiguredStep(supabase: any, sender: any, remoteJid: string, consultantId: string, customerId: string, step: any, vars: Record<string, string>, variant: string = "A") {
  const applyVars = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
  const slotKey = step.slot_key || step.step_key;
  const { data: mediaRows } = await supabase
    .from("ai_media_library")
    .select("id, kind, url, slot_key, send_order, duration_sec, transcript, label")
    .eq("consultant_id", consultantId)
    .eq("slot_key", slotKey)
    .eq("active", true)
    .eq("is_draft", false)
    .order("send_order", { ascending: true });
  const rawRows = ((mediaRows as any[]) || []).filter((m) => !!m?.url);
  const items: Array<{ kind: string; text?: string; media?: any }> = [];
  for (const m of rawRows) {
    if (variant === "B" && String(m.kind).toLowerCase() === "audio") {
      const transcript = await ensureAudioTranscript(supabase, m);
      if (transcript && transcript.trim()) {
        items.push({ kind: "text", text: transcript.trim() });
      }
      continue;
    }
    items.push({ kind: String(m.kind || "document").toLowerCase(), media: m });
  }
  const text = step.message_text ? applyVars(String(step.message_text)) : "";
  if (text.trim()) items.push({ kind: "text", text });
  if (!items.length) return false;

  const order = Array.isArray(step.media_order) && step.media_order.length > 0
    ? step.media_order.map((k: any) => String(k).toLowerCase())
    : ["audio", "image", "video", "text", "document"];
  items.sort((a: any, b: any) => {
    const ia = order.indexOf(a.kind); const ib = order.indexOf(b.kind);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  let sent = false;
  for (let i = 0; i < items.length; i++) {
    const it: any = items[i];
    if (it.kind === "text" && it.text) {
      await sender.sendText(remoteJid, it.text);
      await supabase.from("conversations").insert({ customer_id: customerId, message_direction: "outbound", message_text: it.text, message_type: "text", conversation_step: step.step_key || step.id });
      sent = true;
    } else if (it.media?.url) {
      const kind = ["audio", "video", "image"].includes(it.kind) ? it.kind : "document";
      await sender.sendMedia(remoteJid, it.media.url, "", kind, Number(it.media.duration_sec || 0) || undefined);
      await supabase.from("conversations").insert({ customer_id: customerId, message_direction: "outbound", message_text: `[${kind}:${it.media.slot_key || slotKey}] (continue)`, message_type: kind, conversation_step: step.step_key || step.id });
      sent = true;
    }
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 1200));
  }
  return sent;
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Mapeia step_type custom de captura para a chave legada usada pelo bot
 * (whapi-webhook trata essas chaves nativamente: aguardando_conta, etc).
 */
function mapCaptureStepToLegacy(stepType: string, stepId: string, stepKey?: string): string {
  switch (stepType) {
    case "capture_conta": return "aguardando_conta";
    case "capture_documento":
    case "capture_doc": return "aguardando_doc_auto";
    case "capture_email": return "ask_email";
    case "confirm_phone": return "ask_phone_confirm";
    case "finalizar_cadastro": return "finalizando";
    default: return stepKey || stepId;
  }
}

/**
 * Resolve o texto a enviar quando o passo é de captura.
 * Ordem: message_text já renderizado → primeiro captures[].retry_text → fallback por tipo.
 */
function resolveCapturePrompt(step: any, renderedText: string): string | null {
  if (renderedText && renderedText.trim()) return renderedText.trim();

  const caps = Array.isArray(step?.captures) ? step.captures : [];
  for (const c of caps) {
    const t = String(c?.retry_text || c?.prompt || "").trim();
    if (t) return t;
  }

  const stepType = String(step?.step_type || "");
  switch (stepType) {
    case "capture_conta":
      return "{{nome}}, me manda a foto *ou PDF* da sua conta de luz aqui pelo WhatsApp 📄";
    case "capture_documento":
    case "capture_doc":
      return "Agora me envia uma foto do seu documento (RG ou CNH, frente e verso) 📷";
    case "capture_email":
      return "Qual é o seu melhor e-mail? ✉️";
    case "confirm_phone":
      return "Esse número é o melhor pra falar com você no WhatsApp? Pode confirmar?";
    case "finalizar_cadastro":
      return "Tô finalizando seu cadastro, só um instante… ⏳";
    default:
      return null;
  }
}

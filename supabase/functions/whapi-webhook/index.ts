/**
 * Whapi Webhook — Super Admin ONLY (rafael.ids@icloud.com)
 * 
 * Recebe mensagens do Whapi Cloud e roda o MESMO bot-flow.ts
 * que o Evolution webhook, mas usando botões reais do WhatsApp.
 * 
 * NÃO interfere nas instâncias Evolution dos consultores.
 * 
 * Endpoint: POST /whapi-webhook
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhone } from "../_shared/utils.ts";
import { createWhapiSender, parseWhapiMessage } from "../_shared/whapi-api.ts";
import { checkAndMarkProcessed, logStepTransition, jsonLog } from "../_shared/audit.ts";
import { runBotFlow } from "./handlers/bot-flow.ts";
import { runConversationalFlow } from "./handlers/conversational/index.ts";
import { normalizeIncoming, normalizeOutgoing, routeEngine, stripPrefix } from "./handlers/step-namespace.ts";
import { captureError } from "../_shared/sentry.ts";
import { detectHandoffIntent } from "../_shared/captureExtractors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    console.log("Whapi webhook received:", JSON.stringify(body).substring(0, 500));

    // ─── Ignorar eventos que não são mensagens ─────────────────────────
    const eventType = body.event?.type;
    if (eventType && eventType !== "messages") {
      return new Response(JSON.stringify({ ok: true, msg: "non-message event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Parsear mensagem Whapi ────────────────────────────────────────
    const parsed = parseWhapiMessage(body);
    if (!parsed) {
      console.log("⏭️ Mensagem ignorada (from_me, grupo, ou vazia)");
      return new Response(JSON.stringify({ ok: true, msg: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      remoteJid, buttonId, hasImage, hasDocument, hasAudio, isButton,
      imageMessage, documentMessage, audioMessage, key, message, messageId,
      fileBase64: whapiFileBase64, fileUrl: whapiFileUrl,
    } = parsed;
    let { messageText, isFile } = parsed;

    if (!messageText && !isFile && !isButton) {
      console.log("⏭️ Mensagem vazia");
      return new Response(JSON.stringify({ ok: true, msg: "empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Deduplicação ──────────────────────────────────────────────────
    if (messageId && await checkAndMarkProcessed(supabase, messageId, "whapi-superadmin")) {
      return new Response(JSON.stringify({ ok: true, msg: "duplicate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(remoteJid.replace("@s.whatsapp.net", ""));

    // ─── Buscar token Whapi e dados do super admin ─────────────────────
    const { data: settingsRows } = await supabase.from("settings").select("*");
    const settings: Record<string, string> = {};
    settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });

    const whapiToken = settings.whapi_token || Deno.env.get("WHAPI_TOKEN") || "";
    if (!whapiToken) {
      console.error("❌ WHAPI_TOKEN não configurado");
      return new Response(JSON.stringify({ error: "Whapi token not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sender = createWhapiSender(whapiToken);

    // ─── Identificar consultor super admin ─────────────────────────────
    // O super admin tem consultant_id fixo na settings
    const superAdminConsultantId = settings.superadmin_consultant_id || "";
    if (!superAdminConsultantId) {
      console.error("❌ superadmin_consultant_id não configurado na tabela settings");
      return new Response(JSON.stringify({ error: "Super admin not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: consultantData } = await supabase
      .from("consultants")
      .select("id, name, igreen_id, conversational_flow_enabled")
      .eq("id", superAdminConsultantId)
      .single();

    const nomeRepresentante = consultantData?.name || "iGreen Energy";
    const consultorId = consultantData?.igreen_id || "124170";
    console.log(`✅ Whapi super admin: ${nomeRepresentante} (iGreen ID: ${consultorId})`);

    // ─── Find or create customer ────────────────────────────────────
    const statusFinalizados = [
      "data_complete", "portal_submitting", "awaiting_otp", "validating_otp",
      "awaiting_manual_submit", "portal_submitted", "registered_igreen",
      "awaiting_signature", "complete",
    ];
    // Comparações com conversation_step usam stripPrefix() para tolerar valores legacy + namespaced.
    const stepsFinalizados = ["complete", "portal_submitting"];

    let { data: activeRecords } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_whatsapp", phone)
      .eq("consultant_id", superAdminConsultantId)
      .not("status", "in", `(${statusFinalizados.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(1);

    let customer = activeRecords?.[0] || null;

    const RESUMABLE_STATUSES = new Set(["abandoned", "stuck_finalizar", "stuck_contact", "email_pendente_revisao"]);
    if (customer && customer.status === "automation_failed") {
      await supabase.from("customers").update({ conversation_step: "sys:welcome", status: "pending", error_message: null }).eq("id", customer.id);
      customer.conversation_step = "sys:welcome";
      customer.status = "pending";
    } else if (customer && RESUMABLE_STATUSES.has(customer.status)) {
      await supabase.from("customers").update({ status: "pending", error_message: null, rescue_attempts: 0 }).eq("id", customer.id);
      customer.status = "pending";
    }

    if (customer && stepsFinalizados.includes(stripPrefix(customer.conversation_step || ""))) {
      customer = null;
    }

    if (!customer) {
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({
          phone_whatsapp: phone,
          consultant_id: superAdminConsultantId,
          status: "pending",
          conversation_step: "sys:welcome",
        })
        .select().single();
      if (error) {
        const { data: fallback } = await supabase
          .from("customers")
          .select("*")
          .eq("phone_whatsapp", phone)
          .eq("consultant_id", superAdminConsultantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallback) {
          if (stepsFinalizados.includes(stripPrefix(fallback.conversation_step || "")) || statusFinalizados.includes(fallback.status)) {
            await supabase.from("customers").update({ conversation_step: "sys:welcome", status: "pending" }).eq("id", fallback.id);
            fallback.conversation_step = "sys:welcome";
            fallback.status = "pending";
          }
          customer = fallback;
        } else {
          return new Response(JSON.stringify({ error: "Failed to create customer" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        customer = newCustomer;
      }
    }

    // ─── 🔇 BOT PAUSADO (handoff humano ativo) ────────────────────────
    // Se o consultor tomou conta da conversa, NÃO interferimos por X horas.
    if ((customer as any).bot_paused_until && new Date((customer as any).bot_paused_until) > new Date()) {
      // Loga inbound mas não responde — deixa o consultor responder
      await supabase.from("conversations").insert({
        customer_id: customer.id,
        message_direction: "inbound",
        message_text: messageText || (hasAudio ? "[áudio]" : "[arquivo]"),
        message_type: hasAudio ? "audio" : (isFile ? "image" : "text"),
        conversation_step: customer.conversation_step,
      });
      console.log(`🔇 Bot pausado para ${phone} até ${(customer as any).bot_paused_until} — ignorando msg`);
      return new Response(JSON.stringify({ ok: true, msg: "bot_paused", paused_until: (customer as any).bot_paused_until }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 🆘 HANDOFF: cliente pediu pra falar com humano ────────────────
    if (messageText && detectHandoffIntent(messageText)) {
      const pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("customers").update({
        bot_paused_until: pausedUntil,
        bot_paused_reason: "handoff_request",
      }).eq("id", customer.id);
      await supabase.from("bot_handoff_alerts").insert({
        customer_id: customer.id,
        consultant_id: superAdminConsultantId,
        phone,
        reason: "client_requested_human",
        user_message: messageText.slice(0, 500),
      });
      // Log inbound
      await supabase.from("conversations").insert({
        customer_id: customer.id,
        message_direction: "inbound",
        message_text: messageText,
        message_type: "text",
        conversation_step: customer.conversation_step,
      });
      const handoffReply = `Tudo bem! 🙏 Vou te transferir agora para ${nomeRepresentante}. Em alguns instantes alguém vai responder por aqui.`;
      try { await sender.sendText(remoteJid, handoffReply); } catch (e: any) { console.error("erro handoff reply:", e); }
      await supabase.from("conversations").insert({
        customer_id: customer.id,
        message_direction: "outbound",
        message_text: handoffReply,
        message_type: "text",
        conversation_step: customer.conversation_step,
      });
      console.log(`🆘 Handoff ativado para ${phone} (${customer.id})`);
      return new Response(JSON.stringify({ ok: true, msg: "handoff_triggered", paused_until: pausedUntil }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Log inbound (audio: marcamos como [áudio] e atualizamos depois com a transcrição) ──
    const inboundLogText = hasAudio ? "[áudio]" : (isFile ? "[arquivo]" : messageText);
    const inboundLogType = hasAudio ? "audio" : (isFile ? "image" : "text");
    const { data: inboundLog } = await supabase.from("conversations").insert({
      customer_id: customer.id,
      message_direction: "inbound",
      message_text: inboundLogText,
      message_type: inboundLogType,
      conversation_step: customer.conversation_step,
    }).select("id").maybeSingle();

    // ─── Download media ────────────────────────────────────────────────
    let fileUrl: string | null = whapiFileUrl || null;
    let fileBase64: string | null = whapiFileBase64 || null;

    // Se Whapi enviou link mas não base64, baixar
    if (isFile && !fileBase64 && fileUrl && fileUrl.startsWith("http")) {
      try {
        console.log(`📥 Baixando mídia Whapi: ${fileUrl.substring(0, 80)}`);
        const mediaRes = await fetch(fileUrl, {
          headers: { "Authorization": `Bearer ${whapiToken}` },
        });
        if (mediaRes.ok) {
          const buf = await mediaRes.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          fileBase64 = btoa(binary);
          const mime = audioMessage?.mimetype || imageMessage?.mimetype || documentMessage?.mimetype || "application/octet-stream";
          fileUrl = `data:${mime};base64,${fileBase64}`;
          console.log(`✅ Mídia Whapi baixada (${mime}, b64 len: ${fileBase64.length})`);
        }
      } catch (e: any) {
        console.warn(`⚠️ Erro ao baixar mídia Whapi: ${e?.message}`);
      }
    }

    // ─── Áudio do cliente → transcreve com Gemini e trata como texto ──────
    if (hasAudio && fileBase64) {
      try {
        const mt = audioMessage?.mimetype || "audio/ogg";
        console.log(`🎙️ [whapi] Transcrevendo áudio do cliente (${mt}, ${fileBase64.length} b64 chars)...`);
        const transRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-transcribe-media`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
          },
          body: JSON.stringify({ base64: fileBase64, mimeType: mt, kind: "audio", language: "pt-BR" }),
        });
        const tj = await transRes.json().catch(() => ({}));
        const transcript = (tj?.transcript || "").trim();
        if (transcript) {
          console.log(`✅ [whapi] Transcrição (${transcript.length} chars): "${transcript.substring(0, 120)}"`);
          messageText = transcript;
          isFile = false; // tratar como texto pra IA conversar normalmente
          // Atualiza o log inbound com a transcrição (mantém marca [áudio])
          if (inboundLog?.id) {
            await supabase.from("conversations").update({
              message_text: `[áudio] ${transcript}`,
              message_type: "audio",
            }).eq("id", inboundLog.id);
          }
        } else {
          console.warn("⚠️ [whapi] Transcrição vazia — pedindo pro lead repetir por texto");
          try { await sender.sendText(remoteJid, "Não consegui ouvir direito seu áudio 🙏 Pode me mandar por texto, por favor?"); } catch {}
          return new Response(JSON.stringify({ ok: true, msg: "audio_empty_transcript" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e: any) {
        console.error(`❌ [whapi] Erro ao transcrever áudio:`, e?.message);
        try { await sender.sendText(remoteJid, "Não consegui ouvir seu áudio agora 🙏 Pode me mandar por texto?"); } catch {}
        return new Response(JSON.stringify({ ok: true, msg: "audio_transcribe_failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── Run bot flow ──────────────────────────────────────────────────
    // Normaliza o step lido do banco (compat reversa para valores sem prefixo).
    const rawStep = customer.conversation_step || null;
    const normalizedStep = normalizeIncoming(rawStep);
    const stepBefore = stripPrefix(normalizedStep); // valor cru consumido pelos engines

    // Sincroniza o customer em memória com o valor cru — engines mantêm sua lógica intacta.
    (customer as any).conversation_step = stepBefore;

    let reply = "";
    let updates: Record<string, any> = {};
    let engineUsed: "sys" | "flow" = "sys";
    try {
      // Roteamento explícito por namespace.
      // - "sys:<name>"  → motor determinístico (cadastro + edição + welcome legacy)
      // - "flow:<id>"   → motor conversacional DB-driven
      // Override individual: customer.conversational_flow_enabled === false força sys.
      const customerOverride = (customer as any).conversational_flow_enabled;
      const consultantFlag = (consultantData as any)?.conversational_flow_enabled === true;

      let engine = routeEngine(normalizedStep);
      // Se o consultor não habilitou o motor novo, ou o cliente desligou explicitamente,
      // qualquer step "flow:" é rebaixado para sys (que cai no welcome canônico).
      if (engine === "flow" && (!consultantFlag || customerOverride === false)) {
        engine = "sys";
      }
      engineUsed = engine;

      const result = engine === "flow"
        ? await runConversationalFlow({
            supabase, sender, customer, consultorId, nomeRepresentante,
            remoteJid, phone, messageText, buttonId, isFile, isButton,
            hasImage, hasDocument, imageMessage, documentMessage, message, key, messageId,
            fileUrl, fileBase64, geminiApiKey: GEMINI_API_KEY,
          })
        : await runBotFlow({
            supabase, sender, customer, consultorId, nomeRepresentante,
            remoteJid, phone, messageText, buttonId, isFile, isButton,
            hasImage, hasDocument, imageMessage, documentMessage, message, key, messageId,
            fileUrl, fileBase64, geminiApiKey: GEMINI_API_KEY,
          });
      reply = result.reply;
      updates = result.updates;

      // Telemetria do classificador (intent/confidence) — registrada na transição, não persistida no customer.
      if (engine === "flow") {
        (updates as any).__intent = (updates as any).__intent;
        (updates as any).__confidence = (updates as any).__confidence;
      }
    } catch (botErr: any) {
      console.error(`💥 [whapi bot-flow crash] step=${stepBefore}:`, botErr);
      captureError(botErr, {
        tags: { function: "whapi-webhook", kind: "bot_flow_crash" },
        extra: { customer_id: customer.id, step: stepBefore },
      });
      reply = "Tive um probleminha aqui. Pode me mandar de novo, por favor?";
      updates = {};
    }

    // Normaliza o conversation_step de saída — sempre persistir com prefixo.
    if (updates.conversation_step) {
      const prefixed = normalizeOutgoing(String(updates.conversation_step), engineUsed);
      if (prefixed) updates.conversation_step = prefixed;
    }

    // ─── Persist updates ───────────────────────────────────────────────
    if (Object.keys(updates).length > 0 || reply) {
      (updates as any).last_bot_reply_at = new Date().toISOString();
      // Reseta follow-up state — cliente respondeu, conversa está viva
      (updates as any).last_bot_interaction_at = new Date().toISOString();
      if ((customer as any).followup_count > 0) (updates as any).followup_count = 0;
    }
    const STUCK_STATES = new Set(["abandoned", "stuck_finalizar", "stuck_contact", "email_pendente_revisao", "contato_incompleto", "automation_failed"]);
    if ((Object.keys(updates).length > 0 || reply) && customer?.status && STUCK_STATES.has(customer.status) && !(updates as any).status) {
      (updates as any).status = "pending";
      (updates as any).error_message = null;
      (updates as any).rescue_attempts = 0;
    }
    // A/B: cliente respondeu (qualquer msg dentro de 1h da última outbound conta como "replied")
    try {
      const lastOut = (customer as any).last_bot_reply_at ? new Date((customer as any).last_bot_reply_at) : null;
      if (lastOut && (Date.now() - lastOut.getTime()) < 60 * 60 * 1000) {
        await supabase.rpc("increment_ab_metric", {
          p_template_key: "any", p_step_key: stepBefore, p_variant: "default",
          p_consultant_id: superAdminConsultantId, p_metric: "replied",
        });
      }
      if (updates.conversation_step && stripPrefix(updates.conversation_step) !== stepBefore) {
        await supabase.rpc("increment_ab_metric", {
          p_template_key: "any", p_step_key: stepBefore, p_variant: "default",
          p_consultant_id: superAdminConsultantId, p_metric: "advanced",
        });
      }
    } catch (e) { /* tracking não bloqueia */ }

    // Extrai metadados de telemetria (não persistir no customers).
    const __intent = (updates as any).__intent ?? null;
    const __confidence = (updates as any).__confidence ?? null;
    delete (updates as any).__intent;
    delete (updates as any).__confidence;

    if (Object.keys(updates).length > 0) {
      delete (updates as any).__inline_sent;
      const { error: updateError } = await supabase.from("customers").update(updates).eq("id", customer.id).select();
      if (updateError) console.error(`❌ ERRO ao salvar updates:`, updateError);
      if (updates.conversation_step && stripPrefix(updates.conversation_step) !== stepBefore) {
        await logStepTransition(supabase, {
          customer_id: customer.id, consultant_id: superAdminConsultantId,
          phone, from_step: stepBefore, to_step: stripPrefix(updates.conversation_step),
          intent: __intent, confidence: __confidence,
        });
      }
    }

    // ─── Send reply ────────────────────────────────────────────────────
    // Considera "inline_sent" sempre que houver QUALQUER update — inclusive só __inline_sent.
    const handlerSentInline = reply === "" && (Object.keys(updates).length > 0 || (updates as any).__inline_sent);
    delete (updates as any).__inline_sent;
    let finalReply = reply;
    if (!finalReply && !handlerSentInline) {
      // Sem fallback robotizado. Silêncio é melhor do que empurrar texto fantasma.
      finalReply = "";
    }
    if (finalReply) {
      try { await sender.sendText(remoteJid, finalReply); } catch (e: any) { console.error("Erro enviar:", e); }
    }

    // ─── Log outbound (apenas se houve resposta de texto enviada inline aqui) ─────
    if (finalReply) {
      await supabase.from("conversations").insert({
        customer_id: customer.id,
        message_direction: "outbound",
        message_text: finalReply,
        message_type: "text",
        conversation_step: updates.conversation_step || stepBefore,
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Whapi webhook error:", err);
    captureError(err, { tags: { function: "whapi-webhook" } });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

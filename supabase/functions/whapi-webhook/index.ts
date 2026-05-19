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
import { runConversationalFlow, CADASTRO_STEPS } from "./handlers/conversational/index.ts";
import { normalizeOutgoing, routeEngine, stripPrefix } from "./handlers/step-namespace.ts";
import { captureError } from "../_shared/sentry.ts";
import { detectHandoffIntent } from "../_shared/captureExtractors.ts";
import { extractMultiField, buildMultiFieldPatch } from "../_shared/multi-field-extractor.ts";
import { botRequestStore, isTestPhone, logTestOutbound } from "../_shared/test-mode.ts";
import { notifyNewLead } from "../_shared/notify-consultant.ts";
import { syncDealStageFromStep } from "../_shared/crm-stage-sync.ts";
import { isCustomerPausedByHuman } from "../_shared/bot/paused.ts";

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
      console.log("⏭️ Mensagem ignorada (from_me via API, grupo, ou vazia)");
      return new Response(JSON.stringify({ ok: true, msg: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Outbound humano (consultor digitou no WhatsApp Business/app) ─
    if ((parsed as any).outboundHuman) {
      const outChatId: string = (parsed as any).chatId || "";
      const outSource: string = (parsed as any).source || "";
      const outPhone = normalizePhone(outChatId.replace("@s.whatsapp.net", "")).replace(/\D/g, "");
      console.log(`👤 Outbound humano detectado (source=${outSource}) → pausando bot para ${outPhone}`);
      try {
        const { data: cust, error: selErr } = await supabase
          .from("customers")
          .select("id, bot_paused, assigned_human_id, consultant_id")
          .eq("phone_whatsapp", outPhone)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (selErr) console.error("⚠️ select customer (outboundHuman):", selErr);
        if (cust && (!cust.bot_paused || !cust.assigned_human_id)) {
          const { error: updErr } = await supabase
            .from("customers")
            .update({
              bot_paused: true,
              bot_paused_reason: "humano_assumiu_whatsapp",
              bot_paused_at: new Date().toISOString(),
              bot_paused_until: null,
              assigned_human_id: cust.consultant_id ?? cust.assigned_human_id ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", cust.id);
          if (updErr) console.error("⚠️ update bot_paused (outboundHuman):", updErr);
          else console.log(`✅ Bot pausado para ${outPhone} (customer ${cust.id})`);
        } else if (!cust) {
          console.warn(`⚠️ Nenhum customer encontrado para ${outPhone} — bot não foi pausado`);
        }
      } catch (e) {
        console.error("⚠️ Falha ao pausar bot via outbound humano:", e);
      }
      return new Response(JSON.stringify({ ok: true, msg: "outbound_human_takeover" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const {
      remoteJid, buttonId, hasImage, hasDocument, hasAudio, isButton,
      imageMessage, documentMessage, audioMessage, key, message, messageId,
      fileBase64: whapiFileBase64, fileUrl: whapiFileUrl, fromName,
    } = parsed;
    let { messageText, isFile } = parsed;

    // Helper: limpa emojis/símbolos do pushName e pega o primeiro nome válido
    const cleanPushName = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      // Remove emojis e símbolos, mantém letras/acentos/espaços/hífen
      const cleaned = String(raw)
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
        .replace(/[^\p{L}\s'-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned) return null;
      // Rejeita se parecer só número/placeholder
      if (/^\d+$/.test(cleaned)) return null;
      return cleaned;
    };

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

    // ─── Modo teste end-to-end (telefone reservado 5500000xxx) ─────────
    const testMode = isTestPhone(phone);
    let testRunId: string | null = null;
    let testTurn = 0;
    if (testMode) {
      const headerRunId = req.headers.get("x-bot-test-run-id");
      const headerTurn = Number(req.headers.get("x-bot-test-turn") || "0");
      if (headerRunId) {
        testRunId = headerRunId;
        testTurn = Number.isFinite(headerTurn) ? headerTurn : 0;
      } else {
        const { data: runRow } = await supabase
          .from("bot_test_runs")
          .select("id")
          .eq("status", "running")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        testRunId = runRow?.id || null;
      }
      console.log(`🧪 [test-mode] ATIVO phone=${phone} runId=${testRunId} turn=${testTurn}`);
    }

    // Sender real OU mock que registra em bot_test_outbound
    const realSender = createWhapiSender(whapiToken);
    const sender = testMode
      ? {
          sendText: async (_jid: string, text: string) => {
            await logTestOutbound("text", text); return true;
          },
          sendButtons: async (_jid: string, message: string, buttons: any[]) => {
            await logTestOutbound("buttons", `${message}\n[${buttons.map((b: any) => b.title || b.id).join(" | ")}]`);
            return true;
          },
          sendMedia: async (_jid: string, mediaUrl: string, caption: string, mediatype: string) => {
            await logTestOutbound(`media:${mediatype}`, `${mediaUrl} | ${caption || ""}`);
            return true;
          },
          sendPresence: async () => true,
          downloadMedia: async () => null,
        }
      : realSender;

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

    // ─── 🔑 OTP INTERCEPT (antes do bot-flow) ─────────────────────────
    // Se o cliente está em awaiting_otp/portal_submitting e mandou um código
    // numérico, capturamos e notificamos o worker. Bypassa o fluxo conversacional.
    if (messageText && !isButton && !isFile) {
      const otpDigits = messageText.replace(/\D/g, "");
      let extractedOtp: string | null = null;
      const otpPatterns = [
        /(?:c[oó]digo|code|otp|token|verifica[cç][aã]o)[^\d]*(\d{4,8})/i,
        /^(\d{4,8})$/,
      ];
      for (const pat of otpPatterns) {
        const m = messageText.match(pat);
        if (m) { extractedOtp = m[1] || m[0]; break; }
      }
      if (!extractedOtp && /^\d{4,8}$/.test(otpDigits)) extractedOtp = otpDigits;

      if (extractedOtp) {
        const { data: otpCustomer } = await supabase
          .from("customers")
          .select("id, name, status")
          .eq("phone_whatsapp", phone)
          .eq("consultant_id", superAdminConsultantId)
          .in("status", ["awaiting_otp", "portal_submitting"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (otpCustomer) {
          console.log(`🔑 [whapi-otp] OTP ${extractedOtp} capturado para ${otpCustomer.name} (${otpCustomer.id})`);
          await supabase.from("customers").update({
            otp_code: extractedOtp,
            otp_received_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", otpCustomer.id);

          const workerUrl = settings.portal_worker_url || Deno.env.get("PORTAL_WORKER_URL") || Deno.env.get("WORKER_PORTAL_URL") || "";
          const workerSecret = settings.worker_secret || Deno.env.get("WORKER_SECRET") || "";
          if (workerUrl && workerSecret) {
            try {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 5000);
              await fetch(`${workerUrl.replace(/\/$/, "")}/confirm-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${workerSecret}` },
                body: JSON.stringify({ customer_id: otpCustomer.id, otp_code: extractedOtp }),
                signal: ctrl.signal,
              });
              clearTimeout(timer);
              console.log(`✅ [whapi-otp] OTP enviado ao worker`);
            } catch (e: any) {
              console.warn(`⚠️ [whapi-otp] Falha ao notificar worker: ${e?.message}`);
            }
          }

          await supabase.from("conversations").insert({
            customer_id: otpCustomer.id, message_direction: "inbound",
            message_text: messageText, message_type: "text",
            conversation_step: "otp_received",
          });
          try {
            const reply = "✅ Código recebido! Estou finalizando seu cadastro, aguarde alguns segundos...";
            await realSender.sendText(remoteJid, reply);
            await supabase.from("conversations").insert({
              customer_id: otpCustomer.id, message_direction: "outbound",
              message_text: reply, message_type: "text",
              conversation_step: "otp_received",
            });
          } catch (_) {}

          return new Response(JSON.stringify({ ok: true, msg: "otp_intercepted", otp: extractedOtp }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // ─── Find or create customer ────────────────────────────────────
    // 🚨 NUNCA filtrar a busca por status — se filtrarmos, leads em
    // awaiting_otp/awaiting_signature/registered_igreen/complete ficam
    // "invisíveis" e o código cria um customer NOVO com step=welcome,
    // disparando o áudio inicial de novo. Sempre buscar o registro mais
    // recente do telefone e decidir o que fazer baseado no status.
    let { data: activeRecords } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_whatsapp", phone)
      .eq("consultant_id", superAdminConsultantId)
      .order("created_at", { ascending: false })
      .limit(1);

    let customer = activeRecords?.[0] || null;

    // Status pós-cadastro — manter como está; handlers de bot-flow
    // (aguardando_otp / aguardando_assinatura / cadastro_em_analise / complete)
    // já respondem educadamente sem disparar mídia.
    const POST_CADASTRO_STATUSES = new Set([
      "data_complete", "portal_submitting", "awaiting_otp", "validating_otp",
      "awaiting_manual_submit", "portal_submitted", "registered_igreen",
      "awaiting_signature", "awaiting_facial", "complete",
      "cadastro_concluido", "active", "approved",
    ]);
    const RESUMABLE_STATUSES = new Set(["abandoned", "stuck_finalizar", "stuck_contact", "email_pendente_revisao"]);

    if (customer && customer.status === "automation_failed") {
      // Falha técnica — pode recomeçar do welcome.
      await supabase.from("customers").update({ conversation_step: "welcome", status: "pending", error_message: null }).eq("id", customer.id);
      customer.conversation_step = "welcome";
      customer.status = "pending";
    } else if (customer && RESUMABLE_STATUSES.has(customer.status)) {
      await supabase.from("customers").update({ status: "pending", error_message: null, rescue_attempts: 0 }).eq("id", customer.id);
      customer.status = "pending";
    } else if (customer && POST_CADASTRO_STATUSES.has(customer.status)) {
      // ✅ NÃO resetar. Garante que o step esteja em algum handler educado.
      const curStep = stripPrefix(customer.conversation_step || "");
      const safeSteps = new Set([
        "aguardando_otp", "validando_otp", "aguardando_assinatura",
        "aguardando_facial", "cadastro_em_analise", "complete",
        "portal_submitting",
      ]);
      if (!safeSteps.has(curStep)) {
        // Step legacy/desconhecido em customer já finalizado → coloca em cadastro_em_analise.
        await supabase.from("customers")
          .update({ conversation_step: "cadastro_em_analise" })
          .eq("id", customer.id);
        customer.conversation_step = "cadastro_em_analise";
      }
      console.log(`[find-customer] customer ${customer.id} pós-cadastro (status=${customer.status}, step=${customer.conversation_step}) — mantendo, sem reset`);
    }

    if (!customer) {
      const pushedName = cleanPushName(fromName);
      const { data: newCustomer, error } = await supabase
        .from("customers")
        .insert({
          phone_whatsapp: phone,
          consultant_id: superAdminConsultantId,
          status: "pending",
          conversation_step: "welcome",
          ...(pushedName ? { name: pushedName, name_source: "whatsapp_profile" } : {}),
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
          // Mesma regra do bloco principal: NÃO resetar leads pós-cadastro para welcome.
          customer = fallback;
        } else {
          return new Response(JSON.stringify({ error: "Failed to create customer" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        customer = newCustomer;
        // 🎉 Notifica o consultor (fire-and-forget)
        notifyNewLead(superAdminConsultantId, {
          id: newCustomer.id,
          name: newCustomer.name,
          phone_whatsapp: newCustomer.phone_whatsapp,
        }).catch((e) => console.warn("[notify-new-lead] falhou:", (e as Error).message));
      }
    } else {
      // ─── Notificação de "novo lead" também quando o customer já existe ───
      // Dispara se: (a) não há inbound nas últimas 24h (lead voltou depois de sumir)
      // ou (b) foi acabado de reativar (automation_failed / RESUMABLE_STATUSES acima).
      // O helper tem dedup interno de 60s, evita duplicatas em rajada.
      try {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { count } = await supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customer.id)
          .eq("message_direction", "inbound")
          .gte("created_at", since);
        if ((count ?? 0) === 0) {
          notifyNewLead(superAdminConsultantId, {
            id: customer.id,
            name: (customer as any).name,
            phone_whatsapp: (customer as any).phone_whatsapp,
          }).catch((e) => console.warn("[notify-new-lead reentry] falhou:", (e as Error).message));
        }
      } catch (e) {
        console.warn("[notify-new-lead reentry] check falhou:", (e as Error).message);
      }
    }

    // ─── Backfill: se o customer existe mas ainda não tem nome, usa o pushName do WhatsApp ─
    // Depois de clicar em "Zerar", não reaproveitamos from_name/pushName do WhatsApp.
    // Isso evita parecer que o bot "lembrou" do número durante testes do fluxo.
    const wasManuallyReset = !!(customer as any)?.chat_cleared_at;
    if (customer && !customer.name && !wasManuallyReset) {
      const pushedName = cleanPushName(fromName);
      if (pushedName) {
        await supabase.from("customers")
          .update({ name: pushedName, name_source: "whatsapp_profile" })
          .eq("id", customer.id);
        customer.name = pushedName;
        (customer as any).name_source = "whatsapp_profile";
      }
    }

    // ─── Self-intro: captura nome/CEP/valor da PRIMEIRA mensagem do lead ───
    // Ex: "Oi me chamo Paula", "Sou João, conta 250" — evita re-perguntar o nome.
    // Source `freeform_multi` sobrescreve `whatsapp_profile`.
    // Self-intro roda mesmo em chats zerados manualmente — não reaproveita pushName,
    // mas extrai dados que o lead escreveu explicitamente nas primeiras mensagens.
    if (messageText && !isFile && customer) {
      try {
        const { count: inboundCount } = await supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("customer_id", customer.id)
          .eq("message_direction", "inbound");
        const isEarly = (inboundCount ?? 0) <= 2; // 1ª ou 2ª inbound
        if (isEarly) {
          const multi = extractMultiField(messageText);
          const patch = buildMultiFieldPatch(customer, multi);
          if (Object.keys(patch).length > 0) {
            // Promove name_source para self_introduced (mais forte que freeform_multi)
            if (patch.name) patch.name_source = "self_introduced";
            await supabase.from("customers").update(patch).eq("id", customer.id);
            Object.assign(customer as any, patch);
            console.log(`[self-intro] customer=${customer.id} fields=${Object.keys(patch).join(",")} name="${patch.name || ""}"`);
          }
        }
      } catch (e) {
        console.warn("[self-intro] falhou:", (e as Error).message);
      }
    }

    // ─── 🔇 BOT PAUSADO (handoff humano ativo) ────────────────────────
    // Respeita bot_paused, assigned_human_id E bot_paused_until via helper único.
    if (isCustomerPausedByHuman(customer as any)) {
      await supabase.from("conversations").insert({
        customer_id: customer.id,
        message_direction: "inbound",
        message_text: messageText || (hasAudio ? "[áudio]" : "[arquivo]"),
        message_type: hasAudio ? "audio" : (isFile ? "image" : "text"),
        conversation_step: customer.conversation_step,
      });
      const _pausedUntil = (customer as any).bot_paused_until && new Date((customer as any).bot_paused_until) > new Date();
      const _reason = (customer as any).bot_paused_reason || ((customer as any).assigned_human_id ? "humano_assumiu" : (_pausedUntil ? "paused_until" : "manual"));
      console.log(`🔇 Bot pausado para ${phone} (flag=${(customer as any).bot_paused === true}, human=${(customer as any).assigned_human_id || "—"}, until=${(customer as any).bot_paused_until || "—"}, reason=${_reason}) — ignorando msg`);
      return new Response(JSON.stringify({ ok: true, msg: "bot_paused", reason: _reason, paused_until: (customer as any).bot_paused_until || null }), {
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


    // ─── Auto-tag lead source (Meta Ads) ─────────────────────────────────
    // 1) Sinal forte: payload Whapi com referral/context (CTWA do Meta)
    // 2) Fallback: regex no texto (frase pré-preenchida do CTWA ou menção a ad)
    try {
      if (!(customer as any).lead_source) {
        const rawMsg: any = body?.messages?.[0] || {};
        const referral = rawMsg.referral || rawMsg.context?.referred_product || rawMsg.context?.referral || rawMsg.ad_reply || null;
        const ctwaClid = rawMsg.ctwa_clid || referral?.ctwa_clid || null;
        const hasReferral = !!(referral || ctwaClid);

        const adsRegex = /(tenho interesse.*mais informa[çc][õo]es|gostaria de saber mais|quero saber mais|vi seu an[uú]ncio|vim do an[uú]ncio|do an[uú]ncio|pelo an[uú]ncio|vi o an[uú]ncio|facebook|instagram|\bfb ads?\b|\bmeta ads?\b|patrocinad|reels|stories|sponsored)/i;
        const textMatch = !hasAudio && !isFile && messageText && adsRegex.test(messageText);

        if (hasReferral || textMatch) {
          await supabase.from("customers")
            .update({ lead_source: "meta_ads" })
            .eq("id", customer.id)
            .is("lead_source", null);
          (customer as any).lead_source = "meta_ads";
          const reason = hasReferral ? `referral=${JSON.stringify(referral).slice(0,120)} ctwa=${ctwaClid}` : `regex msg="${(messageText||'').slice(0,80)}"`;
          console.log(`[lead-source] customer ${customer.id} marcado como meta_ads (${reason})`);
        }
      }
    } catch (e) {
      console.warn("[lead-source] falha ao detectar:", (e as Error).message);
    }
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
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
          }
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
    if (hasAudio && testMode) {
      // 🧪 modo teste: usa transcript embutido no payload
      const t = (audioMessage as any)?.transcript || (parsed.message as any)?.audio?.transcript || "";
      if (t) { messageText = String(t); isFile = false; }
    } else if (hasAudio && fileBase64) {
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
          isFile = false;
          if (inboundLog?.id) {
            await supabase.from("conversations").update({
              message_text: `[áudio] ${transcript}`,
              message_type: "audio",
            }).eq("id", inboundLog.id);
          }
        } else {
          console.warn(`⚠️ [whapi] Transcrição vazia — status=${transRes.status} body=${JSON.stringify(tj).substring(0, 300)}`);
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
    // ─── 🔒 Lock per-customer: evita webhooks paralelos enviando msgs duplicadas
    // quando o lead manda 2+ mensagens em rajada. O fluxo pode enviar áudio/vídeo/
    // imagem + texto e passar de 25s; por isso a trava precisa durar mais que a
    // cascata inteira, senão uma segunda invocação entra no meio e repete o step.
    let lockAcquired = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const { data: ok } = await supabase.rpc("try_lock_customer_processing", {
        _customer_id: customer.id,
        _seconds: 120,
      });
      if (ok === true) { lockAcquired = true; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!lockAcquired) {
      // Em vez de descartar silenciosamente, enfileira a mensagem pra a 1ª
      // invocação reprocessar quando liberar o lock. Garante zero perda.
      try {
        await supabase.rpc("enqueue_pending_inbound", {
          _customer_id: customer.id,
          _message_id: messageId || `noid-${Date.now()}`,
        });
        console.warn(`📥 [whapi] customer=${customer.id} busy — enfileirado pending_inbound`);
      } catch (e) {
        console.error("[whapi] enqueue_pending_inbound falhou:", (e as Error)?.message);
      }
      return new Response(JSON.stringify({ ok: true, skipped: "busy_enqueued" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Re-fetch customer pra pegar updates feitos pela invocação anterior (ex: novo conversation_step)
    try {
      const { data: fresh } = await supabase.from("customers").select("*").eq("id", customer.id).maybeSingle();
      if (fresh) customer = fresh;
    } catch (_) { /* mantém customer atual */ }

    // Roteamento por prefixo: "flow:<id>" → conversational; nome cru → bot-flow determinístico.
    // Compat reversa: UUIDs/"passo_xxx" sem prefixo são tratados como flow.
    const rawStep = customer.conversation_step || null;
    const stepBefore = stripPrefix(rawStep); // valor cru consumido pelos engines

    // Sincroniza o customer em memória com o valor cru — engines mantêm sua lógica intacta.
    (customer as any).conversation_step = stepBefore;

    let reply = "";
    let updates: Record<string, any> = {};
    let engineUsed: "sys" | "flow" = "sys";
    try {
      const customerOverride = (customer as any).conversational_flow_enabled;
      const consultantFlag = (consultantData as any)?.conversational_flow_enabled === true;

      let engine = routeEngine(rawStep);
      // Se o consultor não habilitou o motor novo, ou o cliente desligou explicitamente,
      // qualquer step "flow:" é rebaixado para sys (cai no welcome canônico).
      if (engine === "flow" && (!consultantFlag || customerOverride === false)) {
        engine = "sys";
        (customer as any).conversation_step = "welcome";
      }

      // 🚀 FONTE ÚNICA DE VERDADE: Fluxo da Camila (DB) controla TODO step
      // que não pertence ao pipeline de cadastro (OCR/doc/portal). Cadastro
      // continua em sys (bot-flow.ts). Nada mais bounce entre engines.
      const currentStepRaw = stripPrefix((customer as any).conversation_step || "");
      const isCadastroStep = CADASTRO_STEPS.has(currentStepRaw);
      if (
        engine === "sys" &&
        !isCadastroStep &&
        consultantFlag &&
        customerOverride !== false
      ) {
        try {
          // 🔑 FIX: Rafael tem fluxos A/B/C ativos simultâneos. Filtrar pela
          // variant do customer (default "A") evita o erro "multiple rows"
          // que antes deixava activeFlow=null e fazia o engine cair em sys
          // (que disparava a IA do welcome legacy em vez do Fluxo da Camila).
          const variant = (customer as any)?.flow_variant || "A";
          const { data: activeFlows } = await supabase
            .from("bot_flows")
            .select("id")
            .eq("consultant_id", superAdminConsultantId)
            .eq("is_active", true)
            .eq("variant", variant)
            .order("created_at", { ascending: true })
            .limit(1);
          const activeFlow = activeFlows?.[0] || null;
          if (activeFlow?.id) {
            const { count } = await supabase
              .from("bot_flow_steps")
              .select("id", { count: "exact", head: true })
              .eq("flow_id", (activeFlow as any).id)
              .eq("is_active", true);
            if ((count || 0) > 0) {
              engine = "flow";
              // Limpa o step legado para que runConversationalFlow restarte
              // no firstActive do Fluxo da Camila — sem bounce, sem mistura.
              (customer as any).conversation_step = null;
              console.log(`🚀 [router] forçado para flow (consultor=${superAdminConsultantId}, variant=${variant}, step legado="${stepBefore}")`);
            } else {
              console.warn(`[router] flow ${activeFlow.id} (variant=${variant}) sem steps ativos — mantendo sys`);
            }
          } else {
            console.warn(`[router] nenhum bot_flow ativo para variant=${variant} consultor=${superAdminConsultantId} — mantendo sys`);
          }
        } catch (e) {
          console.warn("[router] falha ao verificar flow ativo:", (e as any)?.message);
        }
      }

      engineUsed = engine;

      const runEngine = async () => engine === "flow"
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
      const result = testMode && testRunId
        ? await botRequestStore.run({ testMode: true, runId: testRunId, supabase, turn: testTurn }, runEngine)
        : await runEngine();
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

    // Normaliza o conversation_step de saída — flow ganha prefixo, sys vai cru.
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
    const __inline_sent_flag = (updates as any).__inline_sent === true;
    // Strip TODAS as chaves internas "__*" antes do update — previne erros
    // de coluna inexistente (ex: __ai_faq, __intent etc.) que quebram tudo.
    for (const k of Object.keys(updates)) {
      if (k.startsWith("__")) delete (updates as any)[k];
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.from("customers").update(updates).eq("id", customer.id).select();
      if (updateError) console.error(`❌ ERRO ao salvar updates:`, updateError);
      if (updates.conversation_step && stripPrefix(updates.conversation_step) !== stepBefore) {
        await logStepTransition(supabase, {
          customer_id: customer.id, consultant_id: superAdminConsultantId,
          phone, from_step: stepBefore, to_step: stripPrefix(updates.conversation_step),
          intent: __intent, confidence: __confidence,
        });
      }
      // Avança o estágio do deal no Kanban conforme o lead progride na conversa.
      if (updates.conversation_step) {
        await syncDealStageFromStep(supabase, customer.id, updates.conversation_step);
      }
    }

    // ─── Send reply ────────────────────────────────────────────────────
    // Considera "inline_sent" sempre que houver QUALQUER update — inclusive só __inline_sent.
    const handlerSentInline = reply === "" && (Object.keys(updates).length > 0 || __inline_sent_flag);
    let finalReply = reply;
    if (!finalReply && !handlerSentInline) {
      // Sem fallback robotizado. Silêncio é melhor do que empurrar texto fantasma.
      finalReply = "";
    }
    if (finalReply) {
      // 🛡️ Anti-duplicação universal: bloqueia envio de texto idêntico ao último
      // outbound feito ao mesmo cliente nos últimos 60s. Cobre TODAS as origens
      // (dispatchStepFromFlow, respondAndReentry, replies finais, etc).
      let isDuplicate = false;
      try {
        const sinceIso = new Date(Date.now() - 60_000).toISOString();
        const { data: lastOut } = await supabase
          .from("conversations")
          .select("message_text, created_at")
          .eq("customer_id", customer.id)
          .eq("message_direction", "outbound")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastOut && String((lastOut as any).message_text || "").trim() === String(finalReply).trim()) {
          const ageMs = Date.now() - new Date((lastOut as any).created_at).getTime();
          console.warn(`🛡️ [anti-dup] skip — mesma msg enviada há ${Math.round(ageMs/1000)}s para customer=${customer.id}`);
          isDuplicate = true;
        }
      } catch (_) { /* anti-dup é best-effort */ }

      if (!isDuplicate) {
        try { await sender.sendText(remoteJid, finalReply); } catch (e: any) { console.error("Erro enviar:", e); }
        // ─── Log outbound (apenas se houve resposta de texto enviada inline aqui) ─────
        await supabase.from("conversations").insert({
          customer_id: customer.id,
          message_direction: "outbound",
          message_text: finalReply,
          message_type: "text",
          conversation_step: updates.conversation_step || stepBefore,
        });
      }
    }

    // 🔓 Libera o lock antes de retornar + limpa marker de fila pendente.
    try { await supabase.rpc("release_customer_processing_lock", { _customer_id: customer.id }); } catch (_) {}
    try { await supabase.rpc("clear_pending_inbound", { _customer_id: customer.id }); } catch (_) {}

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Whapi webhook error:", err);
    captureError(err, { tags: { function: "whapi-webhook" } });
    // best-effort: tenta liberar lock se foi adquirido
    try {
      // @ts-ignore — customer/lockAcquired podem não estar no escopo
      if (typeof customer !== "undefined" && customer?.id && typeof lockAcquired !== "undefined" && lockAcquired) {
        // @ts-ignore
        await supabase.rpc("release_customer_processing_lock", { _customer_id: customer.id });
      }
    } catch (_) {}
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

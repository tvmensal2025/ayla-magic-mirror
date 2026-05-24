// Edge: flow-simulate-run
// Executa o motor REAL de produção (runConversationalFlow / runBotFlow)
// para um customer sandbox (is_sandbox=true), capturando todas as saídas
// (texto, botões, mídia, presence) num buffer e devolvendo pra UI.
//
// Garantias:
//   • Nada é enviado pelo WhatsApp (sender substituído por buffer).
//   • Tabelas críticas (crm_deals, alertas, pending_outbound_media, FB CAPI,
//     conversations, outbound_message_log, ai_usage_log) têm trigger
//     que ignora INSERT quando customer.is_sandbox=true.
//   • notifyNewLead / notifyHandoff retornam early quando lead.is_sandbox.
//
// Body:
//   { consultant_id, user_message?, button_id?, attach: {url, kind}? , variant?: "A"|"B"|"C"|"D" }
// Retorno:
//   { events: [...], current_step }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { runBotFlow } from "../whapi-webhook/handlers/bot-flow.ts";
import { runConversationalFlow } from "../whapi-webhook/handlers/conversational/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";

type EvKind = "text" | "buttons" | "audio" | "image" | "video" | "document" | "presence";
interface Event {
  kind: EvKind;
  text?: string;
  buttons?: { id: string; title: string }[];
  url?: string;
  caption?: string;
  state?: string;
  duration_ms?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const consultantId = String(body?.consultant_id || user.id);

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authz
    if (consultantId !== user.id) {
      const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) =>
        ["admin", "super_admin", "superadmin"].includes(String(r.role)),
      );
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    const userMessage = String(body?.user_message || "").trim();
    const buttonId = body?.button_id ? String(body.button_id) : null;
    const attach: { url?: string; kind?: "image" | "document" | "audio" | "video" } = body?.attach || {};
    const variant = String(body?.variant || "").toUpperCase();

    // ── 1) Garante customer sandbox para este consultor ──
    const fakePhone = `999${String(consultantId).replace(/\D/g, "").slice(0, 8).padStart(8, "0")}`;
    const remoteJid = `${fakePhone}@s.whatsapp.net`;

    let { data: customer } = await svc
      .from("customers")
      .select("*")
      .eq("consultant_id", consultantId)
      .eq("is_sandbox", true)
      .eq("phone_whatsapp", fakePhone)
      .maybeSingle();

    if (!customer) {
      const { data: created, error: createErr } = await svc
        .from("customers")
        .insert({
          consultant_id: consultantId,
          phone_whatsapp: fakePhone,
          name: "João Sandbox",
          is_sandbox: true,
          customer_origin: "sandbox",
          flow_variant: variant || null,
        })
        .select("*")
        .single();
      if (createErr) return json({ error: "create_customer_failed", detail: createErr.message }, 500);
      customer = created;
    }
    if (variant && customer.flow_variant !== variant) {
      await svc.from("customers").update({ flow_variant: variant }).eq("id", customer.id);
      customer.flow_variant = variant;
    }

    // ── 2) Capturing sender ──
    const events: Event[] = [];
    const sender = {
      sendText: async (_jid: string, text: string) => {
        events.push({ kind: "text", text: String(text || "") });
        return true;
      },
      sendButtons: async (_jid: string, prompt: string, btns: any[]) => {
        events.push({
          kind: "buttons",
          text: String(prompt || ""),
          buttons: (Array.isArray(btns) ? btns : []).map((b: any) => ({
            id: String(b?.id || b?.buttonId || ""),
            title: String(b?.title || b?.text || b?.label || ""),
          })),
        });
        return true;
      },
      sendMedia: async (_jid: string, url: string, caption: string, type: string, _dur?: number) => {
        const kind = (type === "audio" || type === "video" || type === "image" || type === "document")
          ? type as EvKind
          : "image";
        events.push({ kind, url: String(url || ""), caption: String(caption || "") });
        return true;
      },
      sendPresence: async (_jid: string, kind: string, ms: number) => {
        events.push({ kind: "presence", state: String(kind), duration_ms: Number(ms) || 0 });
        return true;
      },
      downloadMedia: async () => null,
    };

    // ── 3) Consultor + roteamento de engine ──
    const { data: consultant } = await svc
      .from("consultants")
      .select("id, name, conversational_flow_enabled")
      .eq("id", consultantId)
      .maybeSingle();
    const nomeRepresentante = (consultant as any)?.name || "Consultor";

    // ── 4) Inbound fake (texto, botão ou mídia anexada) ──
    const hasImage = attach.kind === "image";
    const hasDocument = attach.kind === "document";
    const hasAudio = attach.kind === "audio";
    const hasVideo = attach.kind === "video";
    const isFile = hasImage || hasDocument || hasAudio || hasVideo;
    const fileUrl = attach.url || null;

    const ctx: any = {
      supabase: svc,
      sender,
      customer,
      consultorId: consultantId,
      nomeRepresentante,
      remoteJid,
      phone: fakePhone,
      messageText: userMessage,
      buttonId,
      isFile,
      isButton: !!buttonId,
      hasImage,
      hasDocument,
      imageMessage: hasImage ? { url: fileUrl } : null,
      documentMessage: hasDocument ? { url: fileUrl } : null,
      message: { text: userMessage, attach },
      key: { id: `sim_${Date.now()}`, fromMe: false, remoteJid },
      messageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      instanceName: "whapi-sandbox",
      fileUrl,
      fileBase64: null,
      geminiApiKey: GEMINI_API_KEY,
    };

    // ── 5) Decide engine (mesma regra do whapi-webhook) ──
    let useFlow = false;
    try {
      const { data: activeFlow } = await svc
        .from("bot_flows")
        .select("id")
        .eq("consultant_id", consultantId)
        .eq("is_active", true)
        .eq("variant", customer.flow_variant || variant || "A")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (activeFlow?.id) {
        const { count } = await svc
          .from("bot_flow_steps")
          .select("id", { count: "exact", head: true })
          .eq("flow_id", (activeFlow as any).id)
          .eq("is_active", true);
        useFlow = (count || 0) > 0;
      }
    } catch (e) {
      console.warn("[sim] router check failed:", (e as Error).message);
    }

    try {
      if (useFlow) {
        await runConversationalFlow(ctx);
      } else {
        await runBotFlow(ctx);
      }
    } catch (e) {
      events.push({ kind: "text", text: `⚠️ Engine error: ${(e as Error).message}` });
    }

    // ── 6) Releitura do estado pra UI ──
    const { data: cnow } = await svc
      .from("customers")
      .select("conversation_step, flow_variant, name, valor_conta, capture_mode")
      .eq("id", customer.id)
      .maybeSingle();

    return json({ events, customer_state: cnow || null });
  } catch (e) {
    return json({ error: "internal", detail: String((e as Error)?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

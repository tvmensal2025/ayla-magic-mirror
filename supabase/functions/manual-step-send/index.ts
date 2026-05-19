// Manual step sender: human takes over a conversation and triggers individual
// pieces (audio / image / video / text) of a configured flow step, on-demand.
// By default it does NOT advance conversation_step or unpause the bot. When
// continueFlow=true, it resumes the custom flow after the selected step.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createWhapiSender } from "../_shared/whapi-api.ts";

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
      return json({ error: "missing_fields" }, 400);
    }
    // Allow if same consultant OR has super_admin role
    if (userId !== body.consultantId) {
      const { data: isAdmin } = await supabase.rpc("is_super_admin", { _user_id: userId });
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    // Resolve customer + phone
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone_whatsapp, consultant_id, electricity_bill_value")
      .eq("id", body.customerId)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found" }, 404);

    const phoneDigits = String(customer.phone_whatsapp || "").replace(/\D/g, "");
    if (!phoneDigits) return json({ error: "customer_no_phone" }, 400);
    const remoteJid = `${phoneDigits}@s.whatsapp.net`;

    // Resolve step
    let stepQuery = supabase
      .from("bot_flow_steps")
      .select("id, step_key, slot_key, message_text, media_order, flow_id, step_type, position, transitions, captures")
      .eq("is_active", true);
    if (body.stepId) stepQuery = stepQuery.eq("id", body.stepId);
    else if (body.stepKey) {
      const { data: flow } = await supabase
        .from("bot_flows")
        .select("id")
        .eq("consultant_id", body.consultantId)
        .eq("is_active", true)
        .maybeSingle();
      if (!flow?.id) return json({ error: "no_active_flow" }, 404);
      stepQuery = stepQuery.eq("flow_id", flow.id).eq("step_key", body.stepKey);
    } else return json({ error: "missing_step" }, 400);

    const { data: step } = await stepQuery.maybeSingle();
    if (!step) return json({ error: "step_not_found" }, 404);

    const slotKey = (step as any).slot_key || (step as any).step_key;

    // Resolve medias for slot
    const { data: mediaRows } = await supabase
      .from("ai_media_library")
      .select("id, kind, url, slot_key, send_order, duration_sec")
      .eq("consultant_id", body.consultantId)
      .eq("slot_key", slotKey)
      .eq("active", true)
      .eq("is_draft", false)
      .order("send_order", { ascending: true });
    const medias = ((mediaRows as any[]) || []).filter((m) => !!m?.url);

    // Whapi token
    const { data: settingsRows } = await supabase.from("settings").select("key,value");
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((s: any) => { settings[s.key] = s.value; });
    const whapiToken = settings.whapi_token || Deno.env.get("WHAPI_TOKEN") || "";
    if (!whapiToken) return json({ error: "whapi_token_missing" }, 500);

    const sender = createWhapiSender(whapiToken);

    // Build variables for text rendering
    const firstName = String((customer as any).name || "").trim().split(/\s+/)[0] || "";
    const vars: Record<string, string> = {
      "{nome}": firstName,
      "{{nome}}": firstName,
      "{nome_completo}": String((customer as any).name || ""),
      "{{nome_completo}}": String((customer as any).name || ""),
    };
    const applyVars = (s: string) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), s);
    const renderedText = (step as any).message_text ? applyVars(String((step as any).message_text)) : "";

    // Build items list per part request
    type Item = { kind: string; text?: string; media?: any };
    const allItems: Item[] = [];
    medias.forEach((m) => allItems.push({ kind: String(m.kind || "document").toLowerCase(), media: m }));
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

    if (toSend.length === 0) return json({ ok: false, error: "nothing_to_send" }, 400);

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

    return json({ ok: true, sent: sentLog });
  } catch (e) {
    console.error("[manual-step-send] error", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

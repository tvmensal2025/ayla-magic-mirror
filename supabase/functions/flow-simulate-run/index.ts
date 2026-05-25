// Edge: flow-simulate-run
// Roda o MOTOR REAL de produção (whapi-webhook + bot-flow + conversational)
// reaproveitando a infraestrutura testMode existente.
//
// Garantias de paridade com o WhatsApp real:
//   • Customer sandbox SEMPRE pertence ao settings.superadmin_consultant_id
//     (mesmo consultor que o webhook real usa).
//   • capture_mode='auto' é forçado PÓS-insert para bypassar o trigger
//     trg_customers_default_capture_mode que setaria 'manual' e travaria o
//     fluxo no [manual-capture-stop].
//   • bot_paused/assigned_human_id/do_not_contact sempre limpos antes do turno.
//   • conversation_step não é resetado fora da ação "Zerar" (mantém continuidade).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

type EvKind = "text" | "buttons" | "audio" | "image" | "video" | "document" | "presence";
interface UiEvent {
  kind: EvKind;
  text?: string;
  buttons?: { id: string; title: string }[];
  url?: string;
  caption?: string;
}

// Deriva phone determinístico no range de teste (5500000xxxxxxx) a partir do consultantId.
function testPhoneFor(consultantId: string): string {
  let h = 0;
  for (const ch of consultantId) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  const suffix = String(Math.abs(h)).padStart(8, "0").slice(0, 8);
  return `5500000${suffix}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 🔑 Sempre rodar contra o consultor real do webhook (settings.superadmin_consultant_id).
    // Isso garante que o motor carregue o fluxo/variant ativo correto.
    const { data: sRow } = await svc
      .from("settings")
      .select("value")
      .eq("key", "superadmin_consultant_id")
      .maybeSingle();
    const realSuperAdminId = String((sRow as any)?.value || "").trim();
    if (!realSuperAdminId) return json({ error: "superadmin_consultant_id_missing" }, 500);

    const requestedConsultantId = String(body?.consultant_id || user.id);
    // Authz: usuário precisa ser dono OU admin
    if (requestedConsultantId !== user.id) {
      const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) =>
        ["admin", "super_admin", "superadmin"].includes(String(r.role)),
      );
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }
    // O sandbox sempre vai para o superadmin real (não importa quem chamou).
    const consultantId = realSuperAdminId;

    const userMessage = String(body?.user_message || "").trim();
    let buttonId = body?.button_id ? String(body.button_id) : null;
    const attach: { url?: string; kind?: "image" | "document" | "audio" | "video" } = body?.attach || {};
    const variant = String(body?.variant || "").toUpperCase();
    const fresh = body?.fresh === true; // sinaliza "Zerar" → resetar step

    // ─── Modo Real: usa telefone REAL do usuário, serviços reais (OCR/Portal/OTP/facial) ──
    const realMode = body?.real_mode === true;
    const rawRealPhone = String(body?.real_phone || "").replace(/\D/g, "");
    if (realMode && (rawRealPhone.length < 12 || rawRealPhone.length > 13)) {
      return json({ error: "real_phone_invalid", detail: "Telefone real precisa ter 12 ou 13 dígitos (55 + DDD + número)" }, 400);
    }
    const phone = realMode ? rawRealPhone : testPhoneFor(consultantId);
    const chatId = `${phone}@s.whatsapp.net`;

    // ── 1) Garante customer (sandbox OU real-test) ──
    // Modo Real NUNCA pode reaproveitar um cliente real antigo do mesmo telefone:
    // ele precisa usar/criar somente registros marcados como is_test_lead=true.
    let customerQuery = svc
      .from("customers")
      .select("*")
      .eq("phone_whatsapp", phone)
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false })
      .limit(1);
    customerQuery = realMode
      ? customerQuery.eq("is_test_lead", true)
      : customerQuery.eq("is_sandbox", true);
    const { data: customerRows } = await customerQuery;
    let customer = customerRows?.[0] || null;

    if (!customer) {
      const { data: created, error: createErr } = await svc
        .from("customers")
        .insert({
          consultant_id: consultantId,
          phone_whatsapp: phone,
          name: realMode ? "Lead Teste Real" : "Simulador Sandbox",
          is_sandbox: !realMode,
          is_test_lead: realMode,
          capture_mode: "auto",
          customer_origin: "whatsapp_lead",
          flow_variant: variant || "A",
          status: "pending",
          conversation_step: "welcome",
        })
        .select("*")
        .single();
      if (createErr) return json({ error: "create_customer_failed", detail: createErr.message }, 500);
      customer = created;
    }


    // 🛡️ Force-fix do customer ANTES de chamar o webhook:
    //  • capture_mode='auto' (bypassa trigger trg_customers_default_capture_mode
    //    que seta 'manual' e faria o webhook abortar em [manual-capture-stop])
    //  • bot_paused/assigned_human_id/do_not_contact desligados
    //  • flow_variant correto
    //  • status saudável
    //  • consultant_id = superadmin real (caso sandbox antigo tenha outro)
    const patch: Record<string, any> = {
      capture_mode: "auto",
      bot_paused: false,
      bot_paused_until: null,
      bot_paused_reason: null,
      assigned_human_id: null,
      do_not_contact: false,
      is_sandbox: !realMode,
      is_test_lead: realMode,
      consultant_id: consultantId,
      status: customer.status === "complete" || customer.status === "active" ? "pending" : (customer.status || "pending"),
      updated_at: new Date().toISOString(),
    };
    if (variant) patch.flow_variant = variant;
    if (fresh) {
      patch.conversation_step = "welcome";
      patch.previous_conversation_step = null;
      patch.custom_step_retries = 0;
      patch.custom_step_retries_step = null;
      patch.last_custom_prompt_at = null;
      patch.ai_followups_count = 0;
      patch.followup_count = 0;
      patch.chat_cleared_at = new Date().toISOString();
      patch.status = "pending";
      // Limpa todos os dados coletados do lead para simular um lead novo
      patch.name = realMode ? "Lead Teste Real" : "Simulador Sandbox";
      patch.name_source = null;
      patch.cpf = null;
      patch.rg = null;
      patch.data_nascimento = null;
      patch.email = null;
      patch.phone_landline = null;
      patch.phone_contact_confirmed = false;
      patch.cep = null;
      patch.address_street = null;
      patch.address_number = null;
      patch.address_neighborhood = null;
      patch.address_city = null;
      patch.address_state = null;
      patch.distribuidora = null;
      patch.numero_instalacao = null;
      patch.electricity_bill_value = null;
      patch.electricity_bill_photo_url = null;
      patch.bill_image_url = null;
      patch.bill_base64 = null;
      patch.bill_holder_name = null;
      patch.bill_data_raw = null;
      patch.document_front_url = null;
      patch.document_back_url = null;
      patch.document_type = null;
      patch.doc_holder_name = null;
      patch.otp_code = null;
      patch.otp_received_at = null;
      patch.link_facial = null;
      patch.link_assinatura = null;
      patch.facial_confirmed_at = null;
      patch.sales_phase = null;
      patch.rescue_attempts = 0;
      patch.ocr_conta_attempts = 0;
      patch.bot_paused = false;
      patch.bot_paused_reason = null;
      patch.bot_paused_at = null;
    }
    await svc.from("customers").update(patch).eq("id", customer.id);
    Object.assign(customer as any, patch);

    if (fresh) {
      // Limpa rastros de conversas anteriores no sandbox para garantir paridade
      // com lead "novinho" (sem isso, anti-dup/anti-rep do motor podem suprimir
      // o welcome ou pular passos no segundo "Zerar").
      await svc.from("conversations").delete().eq("customer_id", customer.id).then(() => {}, () => {});
      await svc.from("ai_slot_dispatch_log").delete().eq("customer_id", customer.id).then(() => {}, () => {});
    }

    if (!buttonId && /^\s*[1-9]\s*$/.test(userMessage)) {
      buttonId = await resolveNumberedButtonId(svc, consultantId, String((customer as any).conversation_step || ""), variant || String((customer as any).flow_variant || "A"), userMessage);
    }

    // ── 2) Cria bot_test_run em curso ──
    const { data: runRow, error: runErr } = await svc
      .from("bot_test_runs")
      .insert({
        status: "running",
        customer_id: customer.id,
        consultant_id: consultantId,
        scenario: "ui_simulator",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (runErr || !runRow?.id) return json({ error: "create_run_failed", detail: runErr?.message }, 500);
    const runId = runRow.id as string;
    const turn = 1;

    // ── 3) Monta payload Whapi sintético ──
    const messageId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ts = Math.floor(Date.now() / 1000);
    let whapiMsg: any;

    if (buttonId) {
      whapiMsg = {
        id: messageId,
        from_me: false,
        type: "reply",
        chat_id: chatId,
        from: phone,
        timestamp: ts,
        from_name: customer.name || "Simulador",
        reply: {
          type: "buttons_reply",
          buttons_reply: { id: buttonId, title: userMessage || buttonId },
        },
      };
    } else if (attach.url && attach.kind === "image") {
      whapiMsg = {
        id: messageId, from_me: false, type: "image", chat_id: chatId, from: phone, timestamp: ts,
        from_name: customer.name || "Simulador",
        image: { link: attach.url, mime_type: "image/jpeg" },
        caption: userMessage || "",
      };
    } else if (attach.url && attach.kind === "document") {
      whapiMsg = {
        id: messageId, from_me: false, type: "document", chat_id: chatId, from: phone, timestamp: ts,
        from_name: customer.name || "Simulador",
        document: { link: attach.url, mime_type: "application/pdf" },
        caption: userMessage || "",
      };
    } else if (attach.url && attach.kind === "audio") {
      whapiMsg = {
        id: messageId, from_me: false, type: "voice", chat_id: chatId, from: phone, timestamp: ts,
        from_name: customer.name || "Simulador",
        voice: { link: attach.url, mime_type: "audio/ogg" },
      };
    } else {
      whapiMsg = {
        id: messageId, from_me: false, type: "text", chat_id: chatId, from: phone, timestamp: ts,
        from_name: customer.name || "Simulador",
        text: { body: userMessage || "oi" },
      };
    }

    const whapiBody = { messages: [whapiMsg], event: { type: "messages" } };

    // ── 4) POST para whapi-webhook com headers de testMode ──
    let webhookOk = true;
    let webhookErr: string | null = null;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/whapi-webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ANON}`,
          "apikey": ANON,
          "x-bot-test-run-id": runId,
          "x-bot-test-turn": String(turn),
          "x-bot-bypass-quiet-hours": "1",
          "x-bot-fast-clock": "1",
          ...(realMode ? { "x-bot-real-services": "1" } : {}),
        },
        body: JSON.stringify(whapiBody),
      });
      webhookOk = resp.ok;
      if (!resp.ok) webhookErr = `webhook_${resp.status}: ${await resp.text().catch(() => "")}`.slice(0, 500);
      else await resp.text().catch(() => "");
    } catch (e) {
      webhookOk = false;
      webhookErr = `webhook_fetch: ${(e as Error).message}`;
    }

    // ── 5) Polling de bot_test_outbound ──
    // Janela curta: encerra assim que o turno estabiliza. Botão final fecha
    // mais rápido ainda (já é a última coisa que o passo manda).
    const events: UiEvent[] = [];
    const deadline = Date.now() + 12_000; // aumentado de 8s → 12s para cold starts
    const seen = new Set<string>();
    let stableSince = 0;
    while (Date.now() < deadline) {
      await sleep(250);
      const { data: rows } = await svc
        .from("bot_test_outbound")
        .select("id, kind, content, created_at")
        .eq("run_id", runId)
        .eq("turn", turn)
        .order("created_at", { ascending: true });
      const incoming = (rows || []).filter((r: any) => !seen.has(r.id));
      if (incoming.length === 0) {
        if (events.length > 0) {
          if (!stableSince) stableSince = Date.now();
          // Janela maior: 600ms sempre (antes era 200ms com botões → fechava cedo demais)
          const stableWindow = 600;
          if (Date.now() - stableSince > stableWindow) break;
        }
        continue;
      }
      stableSince = 0;
      for (const r of incoming as any[]) {
        seen.add(r.id);
        const ev = mapOutbound(String(r.kind || ""), String(r.content || ""));
        events.push(ev);
      }
    }

    await svc.from("bot_test_runs").update({
      status: "done",
      finished_at: new Date().toISOString(),
      summary: { events: events.length, webhook_ok: webhookOk, webhook_err: webhookErr },
    }).eq("id", runId);

    const { data: cnow } = await svc
      .from("customers")
      .select("conversation_step, flow_variant, name, capture_mode, status, cpf, rg, data_nascimento, email, phone_landline, phone_contact_confirmed, cep, address_street, address_number, address_neighborhood, address_city, address_state, distribuidora, numero_instalacao, electricity_bill_value, electricity_bill_photo_url, document_front_url, document_back_url, otp_code, link_facial, link_assinatura")
      .eq("id", customer.id)
      .maybeSingle();

    if (!webhookOk && events.length === 0) {
      events.push({ kind: "text", text: `⚠️ Webhook falhou: ${webhookErr || "desconhecido"}` });
    }

    // Diagnóstico para o painel: confirma que o turno avançou de step.
    const stepBefore = String((customer as any).conversation_step || "");
    const stepAfter = String((cnow as any)?.conversation_step || "");
    const advanced = stepBefore !== stepAfter;

    return json({
      events,
      customer_state: cnow || null,
      run_id: runId,
      diagnostic: {
        step_before: stepBefore,
        step_after: stepAfter,
        advanced,
        webhook_ok: webhookOk,
        webhook_err: webhookErr,
      },
    });
  } catch (e) {
    return json({ error: "internal", detail: String((e as Error)?.message || e) }, 500);
  }
});

function mapOutbound(kind: string, content: string): UiEvent {
  if (kind === "text") return { kind: "text", text: content };
  if (kind === "buttons") {
    // Formato novo (JSON): {"text":"prompt","buttons":[{"id":"...","title":"..."}]}
    try {
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.buttons)) {
        return {
          kind: "buttons",
          text: String(parsed.text || ""),
          buttons: parsed.buttons.map((b: any, i: number) => ({
            id: String(b.id || `btn_${i}`),
            title: String(b.title || b.id || ""),
          })),
        };
      }
    } catch (_) { /* fallback legacy */ }
    // Formato legacy: "prompt\n[t1 | t2 | t3]" (sem ids reais)
    const m = content.match(/^([\s\S]*)\n\[([^\]]*)\]\s*$/);
    if (m) {
      const prompt = m[1];
      const titles = m[2].split("|").map((s) => s.trim()).filter(Boolean);
      return {
        kind: "buttons",
        text: prompt,
        buttons: titles.map((t, i) => ({ id: `btn_${i}`, title: t })),
      };
    }
    return { kind: "buttons", text: content, buttons: [] };
  }
  if (kind.startsWith("media:")) {
    const mediaKind = kind.slice("media:".length) as EvKind;
    const [url, ...rest] = content.split(" | ");
    const caption = rest.join(" | ");
    const k = (["audio", "video", "image", "document"].includes(mediaKind) ? mediaKind : "image") as EvKind;
    return { kind: k, url: url.trim(), caption: caption.trim() || undefined };
  }
  return { kind: "text", text: `[${kind}] ${content}` };
}

async function resolveNumberedButtonId(svc: any, consultantId: string, rawStep: string, variant: string, message: string): Promise<string | null> {
  const idx = Number(message.trim()) - 1;
  if (!Number.isInteger(idx) || idx < 0) return null;
  const step = rawStep.replace(/^flow:/, "") || "welcome";
  const { data: flow } = await svc.from("bot_flows").select("id").eq("consultant_id", consultantId).eq("is_active", true).eq("variant", variant || "A").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!flow?.id) return null;
  const q = svc.from("bot_flow_steps").select("captures").eq("flow_id", flow.id).limit(1);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(step)) q.eq("id", step); else q.eq("step_key", step);
  const { data: row } = await q.maybeSingle();
  const captures = Array.isArray(row?.captures) ? row.captures : [];
  const buttons = captures.find((c: any) => c?.field === "_buttons" && c?.enabled !== false && Array.isArray(c?.value))?.value || [];
  return buttons[idx]?.id ? String(buttons[idx].id) : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

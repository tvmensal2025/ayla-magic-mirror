/**
 * Bot end-to-end runner.
 *
 * POST /bot-e2e-runner
 * Cria um customer fictício no range de telefone reservado (5500000xxx),
 * dispara mensagens sintéticas no whapi-webhook e segue o fluxo do bot
 * do welcome até completar (ou travar). O webhook detecta o telefone de
 * teste, ativa AsyncLocalStorage de test-mode, zera delays de mídia,
 * mocka o OCR e troca o sender real por um que grava em bot_test_outbound.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mapeia o conversation_step atual para a próxima resposta do "lead simulado".
// Cada entrada produz UM payload de mensagem do tipo Whapi inbound.
type Reply =
  | { kind: "text"; text: string }
  | { kind: "audio"; transcript: string }
  | { kind: "image"; mime?: string }
  | { kind: "document"; mime?: string };

function nextReplyForStep(step: string | null | undefined): Reply {
  const s = String(step || "welcome").toLowerCase();
  // Início e qualificação
  if (!step || s === "welcome") return { kind: "text", text: "oi" };
  if (s === "qualificacao") return { kind: "audio", transcript: "minha conta vem em torno de 350 reais" };
  if (s === "checkin_pos_video" || s === "menu_inicial" || s === "pos_video") return { kind: "text", text: "sim, quero economizar" };
  if (s === "duvidas_pos_club" || s === "pitch_conexao_club") return { kind: "text", text: "vamos lá, pode mandar" };
  // Cadastro - conta de luz
  if (s === "cadastro" || s === "aguardando_conta") return { kind: "image", mime: "image/jpeg" };
  if (s === "confirmando_dados_conta") return { kind: "text", text: "sim, está tudo certo" };
  // Documento
  if (s === "ask_tipo_documento" || s === "coleta_doc") return { kind: "text", text: "rg" };
  if (s.startsWith("aguardando_doc") || s === "aguardando_doc_frente" || s === "aguardando_doc_verso") return { kind: "image", mime: "image/jpeg" };
  if (s === "confirmando_dados_doc") return { kind: "text", text: "sim, está correto" };
  // Email/contato
  if (s === "ask_email") return { kind: "text", text: "joao.teste@example.com" };
  if (s === "ask_phone" || s === "ask_phone_confirm") return { kind: "text", text: "sim, esse mesmo" };
  // Endereço
  if (s === "ask_number") return { kind: "text", text: "123" };
  if (s === "ask_complement") return { kind: "text", text: "apto 45" };
  if (s === "ask_cep" || s === "editing_conta_cep") return { kind: "text", text: "01310100" };
  // Edits genéricos
  if (s.startsWith("editing_")) return { kind: "text", text: "ok, pode seguir" };
  // Default: confirma
  return { kind: "text", text: "sim" };
}

function buildWhapiBody(phone: string, reply: Reply, idx: number): any {
  const id = `test_${Date.now()}_${idx}`;
  const chatId = `${phone}@s.whatsapp.net`;
  const base = { id, chat_id: chatId, from: phone, from_me: false, timestamp: Math.floor(Date.now() / 1000) };
  if (reply.kind === "text") {
    return { event: { type: "messages" }, messages: [{ ...base, type: "text", text: { body: reply.text } }] };
  }
  if (reply.kind === "audio") {
    // O webhook em test mode lê audio.transcript em vez de transcrever.
    return { event: { type: "messages" }, messages: [{ ...base, type: "voice", voice: { mime_type: "audio/ogg", transcript: reply.transcript, link: null, data: null } }] };
  }
  if (reply.kind === "image") {
    // Pixel base64 1x1 PNG (data URL inline) — OCR é mockado, conteúdo é irrelevante.
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";
    return { event: { type: "messages" }, messages: [{ ...base, type: "image", image: { mime_type: reply.mime || "image/png", data: tinyPng, link: `data:image/png;base64,${tinyPng}` } }] };
  }
  // document
  return { event: { type: "messages" }, messages: [{ ...base, type: "document", document: { mime_type: reply.mime || "application/pdf", data: "", link: "" } }] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    let body: any = {};
    try { body = await req.json(); } catch {}
    const scenario = String(body.scenario || "happy_path");
    const maxTurns = Number(body.maxTurns || 25);

    // Auth: somente admin/super_admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roleRows || []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Obtém consultant super-admin via settings
    const { data: settingsRows } = await supabase.from("settings").select("*");
    const settings: Record<string, string> = {};
    settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });
    const consultantId = settings.superadmin_consultant_id || "";
    if (!consultantId) {
      return new Response(JSON.stringify({ error: "superadmin_consultant_id ausente" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Telefone fictício único
    const suffix = Math.floor(Math.random() * 9_999_999).toString().padStart(7, "0");
    const phone = `5500000${suffix}`;

    // Cria run
    const { data: runRow, error: runErr } = await supabase
      .from("bot_test_runs")
      .insert({ scenario, status: "running", consultant_id: consultantId, created_by: userId })
      .select().single();
    if (runErr) throw runErr;
    const runId = runRow.id;

    // Cria customer fictício
    const { data: customer, error: cErr } = await supabase.from("customers").insert({
      phone_whatsapp: phone, consultant_id: consultantId, status: "pending",
      conversation_step: "welcome", name: "Joao Silva Teste",
    }).select().single();
    if (cErr) throw cErr;
    await supabase.from("bot_test_runs").update({ customer_id: customer.id }).eq("id", runId);

    const turns: any[] = [];
    let lastStep: string | null = null;
    let stuckCount = 0;
    let finalStatus = "running";

    for (let turn = 1; turn <= maxTurns; turn++) {
      // Lê step atual
      const { data: cur } = await supabase.from("customers").select("conversation_step,status").eq("id", customer.id).maybeSingle();
      const stepBefore = cur?.conversation_step || null;
      if (stepBefore && /complete|portal_submit/.test(String(stepBefore))) { finalStatus = "completed"; break; }

      // Decide próximo input
      const reply = nextReplyForStep(stepBefore);
      const payload = buildWhapiBody(phone, reply, turn);

      // Atualiza turn no run para o test-mode logTestOutbound usar o número correto
      // (o whapi-webhook abre seu próprio AsyncLocalStorage com turn=0; vamos gravar turn aqui via update)
      // -> Em vez disso registramos o input e os outputs do turno via marker:
      const startedAt = Date.now();
      await supabase.from("bot_test_outbound").insert({
        run_id: runId, turn, direction: "inbound",
        kind: reply.kind, content: reply.kind === "text" ? reply.text : reply.kind === "audio" ? `[audio] ${reply.transcript}` : `[${reply.kind}]`,
        conversation_step_before: stepBefore,
      });

      // Chama o webhook real
      let resStatus = 0;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/whapi-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
          },
          body: JSON.stringify(payload),
        });
        resStatus = res.status;
        await res.text();
      } catch (e: any) {
        await supabase.from("bot_test_outbound").insert({
          run_id: runId, turn, direction: "error", kind: "fetch_error",
          content: e?.message || String(e),
        });
        finalStatus = "error";
        break;
      }
      const latency = Date.now() - startedAt;

      // Lê step depois
      const { data: after } = await supabase.from("customers").select("conversation_step").eq("id", customer.id).maybeSingle();
      const stepAfter = after?.conversation_step || null;

      turns.push({ turn, stepBefore, stepAfter, latencyMs: latency, httpStatus: resStatus, sent: reply });

      // Atualiza step_after no marker
      // (encontramos o último inbound desse turn e atualizamos)
      await supabase
        .from("bot_test_outbound")
        .update({ conversation_step_after: stepAfter, latency_ms: latency })
        .eq("run_id", runId).eq("turn", turn).eq("direction", "inbound");

      if (stepAfter === lastStep) {
        stuckCount++;
        if (stuckCount >= 3) { finalStatus = "stuck"; break; }
      } else { stuckCount = 0; }
      lastStep = stepAfter;

      if (stepAfter && /complete|portal_submit/.test(String(stepAfter))) { finalStatus = "completed"; break; }
    }

    if (finalStatus === "running") finalStatus = "max_turns";

    await supabase.from("bot_test_runs").update({
      status: finalStatus, finished_at: new Date().toISOString(),
      summary: { turns: turns.length, lastStep },
    }).eq("id", runId);

    // Carrega outbound completo para devolver
    const { data: outbound } = await supabase
      .from("bot_test_outbound")
      .select("turn,direction,kind,content,conversation_step_before,conversation_step_after,latency_ms,created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    return new Response(JSON.stringify({ ok: true, runId, status: finalStatus, phone, turns: turns.length, lastStep, outbound }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("bot-e2e-runner error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

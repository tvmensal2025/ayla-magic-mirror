/**
 * Simulador real do bot: cria um lead de teste, envia mensagens pelo whapi-webhook
 * e valida a conversa ponta-a-ponta sem custo de WhatsApp.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAHUlEQVR4nGP8//8/A7mAiWydo5pHNY9qHtVMFc0AnKADJXYG/XsAAAAASUVORK5CYII=";

type Reply =
  | { kind: "text"; text: string }
  | { kind: "audio"; transcript: string }
  | { kind: "image"; mime?: string }
  | null;

type Scenario =
  | "happy_path"
  | "lead_indeciso"
  | "valor_baixo"
  | "lead_some"
  | "documento_cnh"
  | "recusa_conta"
  | "recusa_documento"
  | "joia_validacao";

type CustomerSnapshot = {
  status?: string | null;
  conversation_step?: string | null;
  bot_paused?: boolean | null;
  electricity_bill_value?: number | null;
  document_type?: string | null;
};

function cleanStep(step: string | null | undefined): string {
  return String(step || "welcome").replace(/^flow:/, "").toLowerCase();
}

function nextReply(
  scenario: Scenario,
  customer: CustomerSnapshot | null,
  turn: number,
  stepHits: Record<string, number>,
): Reply {
  const s = cleanStep(customer?.conversation_step);
  const hits = stepHits[s] || 0;

  if (scenario === "lead_some" && turn > 4) return null;

  if (s === "welcome") return { kind: "text", text: "oi" };

  if (s === "checkin_pos_video" || s === "menu_inicial" || s === "pos_video") {
    if (scenario === "lead_indeciso" && hits === 0) return { kind: "text", text: "é seguro mesmo? tem alguma taxa escondida?" };
    if (scenario === "valor_baixo") return { kind: "text", text: "minha conta vem uns 60 reais" };
    if (scenario === "joia_validacao") return { kind: "text", text: "👍" };
    return { kind: "text", text: "joia, quero economizar" };
  }

  if (s === "qualificacao") {
    if (scenario === "valor_baixo") return { kind: "audio", transcript: "minha conta vem uns 60 reais" };
    return { kind: "audio", transcript: "minha conta vem em torno de 350 reais" };
  }

  if (s === "valor_baixo") return null;

  if (s === "aguardando_conta" || s === "cadastro") return { kind: "image", mime: "image/png" };

  if (s === "confirmando_dados_conta") {
    if (scenario === "recusa_conta" && hits === 0) return { kind: "text", text: "não" };
    return { kind: "text", text: "sim" };
  }

  if (s === "pitch_conexao_club") return { kind: "text", text: "pode seguir" };

  if (s === "duvidas_pos_club") {
    if (scenario === "lead_indeciso" && hits === 0) return { kind: "text", text: "como cancelo se eu quiser?" };
    return { kind: "text", text: scenario === "joia_validacao" ? "👍" : "pode seguir" };
  }

  if (s === "ask_tipo_documento" || s === "coleta_doc") {
    return { kind: "text", text: scenario === "documento_cnh" ? "cnh" : "rg antigo" };
  }

  if (s === "aguardando_doc_frente" || s === "aguardando_doc_auto" || s === "ask_doc_frente_manual") {
    return { kind: "image", mime: "image/png" };
  }

  if (s === "aguardando_doc_verso" || s === "ask_doc_verso_manual") return { kind: "image", mime: "image/png" };

  if (s === "confirmando_dados_doc") {
    if (scenario === "recusa_documento" && hits === 0) return { kind: "text", text: "não" };
    return { kind: "text", text: "sim" };
  }

  if (s === "ask_phone_confirm") return { kind: "text", text: "2" };
  if (s === "ask_phone") return { kind: "text", text: "11999998888" };
  if (s === "ask_email") return { kind: "text", text: "joao.silva.teste@gmail.com" };
  if (s === "ask_name" || s === "editing_conta_nome" || s === "editing_doc_nome") return { kind: "text", text: "Joao Silva Teste" };
  if (s === "ask_cpf" || s === "editing_doc_cpf") return { kind: "text", text: "12345678909" };
  if (s === "ask_rg" || s === "editing_doc_rg") return { kind: "text", text: "123456789" };
  if (s === "ask_birth_date" || s === "editing_doc_nascimento") return { kind: "text", text: "15/05/1985" };
  if (s === "ask_cep" || s === "editing_conta_cep") return { kind: "text", text: "01310100" };
  if (s === "ask_number") return { kind: "text", text: "123" };
  if (s === "ask_complement") return { kind: "text", text: "não" };
  if (s === "ask_installation_number" || s === "editing_conta_instalacao") return { kind: "text", text: "9876543210" };
  if (s === "ask_bill_value" || s === "editing_conta_valor") return { kind: "text", text: "350" };
  if (s === "editing_conta_menu" || s === "editing_doc_menu") return { kind: "text", text: "0" };
  if (s === "ask_finalizar") return { kind: "text", text: "finalizar" };
  if (s === "portal_submitting" || s === "complete") return null;

  return { kind: "text", text: "sim" };
}

function buildWhapiBody(phone: string, reply: Reply, idx: number): any {
  if (!reply) return null;
  const id = `test_${Date.now()}_${idx}_${Math.random().toString(36).slice(2)}`;
  const chatId = `${phone}@s.whatsapp.net`;
  const base = { id, chat_id: chatId, from: phone, from_me: false, timestamp: Math.floor(Date.now() / 1000) };
  if (reply.kind === "text") {
    return { event: { type: "messages" }, messages: [{ ...base, type: "text", text: { body: reply.text } }] };
  }
  if (reply.kind === "audio") {
    return { event: { type: "messages" }, messages: [{ ...base, type: "voice", voice: { mime_type: "audio/ogg", transcript: reply.transcript, link: null, data: null } }] };
  }
  return {
    event: { type: "messages" },
    messages: [{
      ...base,
      type: "image",
      image: { mime_type: reply.mime || "image/png", data: TEST_IMAGE_BASE64, link: `data:image/png;base64,${TEST_IMAGE_BASE64}` },
    }],
  };
}

function commercialStatus(status: string, checks: Array<{ passed: boolean }>): string {
  if (status === "completed") return checks.every((c) => c.passed) ? "Pronto para vender" : "Corrigir antes de vender";
  if (status === "low_value") return "Regra de descarte validada";
  if (status === "lead_silent") return "Abandono identificado";
  return "Não colocar no mercado";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    let body: any = {};
    try { body = await req.json(); } catch {}
    const scenario = (String(body.scenario || "happy_path") as Scenario);
    const maxTurns = Math.max(4, Math.min(Number(body.maxTurns || 35), 50));

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
    if (!ANON_KEY) {
      return new Response(JSON.stringify({ error: "SUPABASE_ANON_KEY/PUBLISHABLE_KEY ausente no ambiente da função" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roleRows || []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: settingsRows } = await supabase.from("settings").select("*");
    const settings: Record<string, string> = {};
    settingsRows?.forEach((s: any) => { settings[s.key] = s.value; });
    const consultantId = settings.superadmin_consultant_id || "";
    if (!consultantId) {
      return new Response(JSON.stringify({ error: "superadmin_consultant_id ausente: o webhook real precisa desse consultor para rodar" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const suffix = Math.floor(Math.random() * 9_999_999).toString().padStart(7, "0");
    const phone = `5500000${suffix}`;

    const { data: runRow, error: runErr } = await supabase
      .from("bot_test_runs")
      .insert({ scenario, status: "running", consultant_id: consultantId, created_by: userId })
      .select().single();
    if (runErr) throw runErr;
    const runId = runRow.id;

    const { data: customer, error: cErr } = await supabase.from("customers").insert({
      phone_whatsapp: phone,
      consultant_id: consultantId,
      status: "pending",
      conversation_step: "welcome",
      name: "Joao Silva Teste",
      name_source: "self_introduced",
    }).select().single();
    if (cErr) throw cErr;
    await supabase.from("bot_test_runs").update({ customer_id: customer.id }).eq("id", runId);

    const turns: any[] = [];
    const stepHits: Record<string, number> = {};
    const visitedSteps = new Set<string>();
    let lastStep: string | null = null;
    let repeatedMediaCount = 0;
    let stuckCount = 0;
    let finalStatus = "running";
    let stopReason = "max_turns";

    for (let turn = 1; turn <= maxTurns; turn++) {
      const { data: cur } = await supabase
        .from("customers")
        .select("conversation_step,status,bot_paused,electricity_bill_value,document_type")
        .eq("id", customer.id)
        .maybeSingle();
      const stepBefore = cur?.conversation_step || null;
      const stepKey = cleanStep(stepBefore);
      visitedSteps.add(stepKey);

      if (stepKey === "complete" || stepKey === "portal_submitting") { finalStatus = "completed"; stopReason = "conversion_step_reached"; break; }
      if (stepKey === "valor_baixo" || cur?.status === "rejected" || cur?.bot_paused === true) { finalStatus = scenario === "valor_baixo" ? "low_value" : "paused_or_rejected"; stopReason = "lead_disqualified_or_paused"; break; }

      const reply = nextReply(scenario, cur, turn, stepHits);
      if (!reply) { finalStatus = scenario === "lead_some" ? "lead_silent" : finalStatus; stopReason = scenario === "lead_some" ? "lead_stopped_replying" : "no_more_scripted_replies"; break; }

      stepHits[stepKey] = (stepHits[stepKey] || 0) + 1;
      const payload = buildWhapiBody(phone, reply, turn);
      const startedAt = Date.now();
      await supabase.from("bot_test_outbound").insert({
        run_id: runId,
        turn,
        direction: "inbound",
        kind: reply.kind,
        content: reply.kind === "text" ? reply.text : reply.kind === "audio" ? `[áudio] ${reply.transcript}` : "[imagem fictícia]",
        conversation_step_before: stepBefore,
      });

      let resStatus = 0;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/whapi-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
            "x-bot-test-run-id": runId,
            "x-bot-test-turn": String(turn),
          },
          body: JSON.stringify(payload),
        });
        resStatus = res.status;
        await res.text();
      } catch (e: any) {
        await supabase.from("bot_test_outbound").insert({ run_id: runId, turn, direction: "error", kind: "fetch_error", content: e?.message || String(e) });
        finalStatus = "error";
        stopReason = "webhook_fetch_error";
        break;
      }

      const latency = Date.now() - startedAt;
      const { data: after } = await supabase.from("customers").select("conversation_step,status,bot_paused").eq("id", customer.id).maybeSingle();
      const stepAfter = after?.conversation_step || null;
      const afterKey = cleanStep(stepAfter);
      visitedSteps.add(afterKey);

      await supabase.from("bot_test_outbound").update({ conversation_step_after: stepAfter, latency_ms: latency })
        .eq("run_id", runId).eq("turn", turn).eq("direction", "inbound");

      turns.push({ turn, action: reply.kind === "text" ? reply.text : reply.kind, stepBefore, stepAfter, latencyMs: latency, httpStatus: resStatus });

      const { data: recentBot } = await supabase
        .from("bot_test_outbound")
        .select("kind,content")
        .eq("run_id", runId)
        .eq("turn", turn)
        .eq("direction", "outbound");
      const mediaKinds = (recentBot || []).filter((o: any) => String(o.kind || "").startsWith("media:")).map((o: any) => `${o.kind}:${String(o.content || "").split("|")[0]}`);
      if (mediaKinds.length >= 2 && stepKey === "checkin_pos_video") repeatedMediaCount += mediaKinds.length;

      if (afterKey === cleanStep(lastStep)) {
        stuckCount++;
        if (stuckCount >= 4) { finalStatus = "stuck"; stopReason = `stuck_on_${afterKey}`; break; }
      } else {
        stuckCount = 0;
      }
      lastStep = stepAfter;

      if (afterKey === "complete" || afterKey === "portal_submitting") { finalStatus = "completed"; stopReason = "conversion_step_reached"; break; }
      if (afterKey === "valor_baixo" || after?.status === "rejected" || after?.bot_paused === true) { finalStatus = scenario === "valor_baixo" ? "low_value" : "paused_or_rejected"; stopReason = "lead_disqualified_or_paused"; break; }
    }

    if (finalStatus === "running") finalStatus = "max_turns";

    const { data: outboundAll } = await supabase
      .from("bot_test_outbound")
      .select("turn,direction,kind,content,conversation_step_before,conversation_step_after,latency_ms,created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    const { data: finalCustomer } = await supabase
      .from("customers")
      .select("status,bot_paused,conversation_step,electricity_bill_value,document_type,email,phone_contact_confirmed")
      .eq("id", customer.id)
      .maybeSingle();

    const botMsgs = (outboundAll || []).filter((o: any) => o.direction === "outbound");
    const inboundMsgs = (outboundAll || []).filter((o: any) => o.direction === "inbound");
    const fetchErrors = (outboundAll || []).filter((o: any) => o.kind === "fetch_error");
    const placeholderRegex = /\{\{\s*\w+\s*\}\}/;
    const withPlaceholder = botMsgs.filter((o: any) => placeholderRegex.test(String(o.content || "")));
    const repeatedOpeningMedia = botMsgs.filter((o: any) => String(o.kind || "").startsWith("media:") && /como_funciona|Green_Energy/i.test(String(o.content || ""))).length;
    const visited = Array.from(visitedSteps).filter(Boolean);

    const checks: Array<{ name: string; passed: boolean; detail?: string }> = [
      { name: "Webhook respondeu sem erro", passed: fetchErrors.length === 0, detail: fetchErrors.length ? `${fetchErrors.length} erro(s)` : undefined },
      { name: "Sem placeholders não substituídos", passed: withPlaceholder.length === 0, detail: withPlaceholder.length ? `${withPlaceholder.length} mensagem(ns)` : undefined },
      { name: "Saiu do check-in inicial", passed: visited.includes("qualificacao") || visited.includes("aguardando_conta") || finalStatus === "low_value", detail: `steps=${visited.join(" → ")}` },
      { name: "Não repetiu mídia em loop", passed: repeatedOpeningMedia <= 2 && repeatedMediaCount === 0, detail: `midias_repetidas=${repeatedOpeningMedia}` },
      { name: "Registrou conversa USER/BOT", passed: inboundMsgs.length > 0 && botMsgs.length > 0, detail: `${inboundMsgs.length} user / ${botMsgs.length} bot` },
    ];

    if (["happy_path", "joia_validacao", "documento_cnh", "recusa_conta", "recusa_documento", "lead_indeciso"].includes(scenario)) {
      checks.push({ name: "Chegou em estado de conversão", passed: finalStatus === "completed", detail: `status=${finalStatus}, step=${finalCustomer?.conversation_step}` });
      checks.push({ name: "Conta foi validada", passed: visited.includes("confirmando_dados_conta") || Number(finalCustomer?.electricity_bill_value || 0) >= 100, detail: `valor=${finalCustomer?.electricity_bill_value}` });
      checks.push({ name: "Documento foi validado", passed: visited.includes("confirmando_dados_doc") || ["complete", "portal_submitting"].includes(cleanStep(finalCustomer?.conversation_step)), detail: `doc=${finalCustomer?.document_type || "∅"}` });
    }
    if (scenario === "valor_baixo") checks.push({ name: "Valor baixo não seguiu para venda", passed: finalStatus === "low_value", detail: `status=${finalCustomer?.status}, step=${finalCustomer?.conversation_step}` });
    if (scenario === "lead_some") checks.push({ name: "Lead silencioso detectado", passed: finalStatus === "lead_silent", detail: `status=${finalStatus}` });
    if (scenario === "lead_indeciso") checks.push({ name: "Dúvida foi tratada sem travar", passed: visited.includes("qualificacao") && finalStatus === "completed", detail: `steps=${visited.join(" → ")}` });
    if (scenario === "recusa_conta") checks.push({ name: "Recusa da conta recuperou o fluxo", passed: visited.filter((s) => s === "aguardando_conta").length >= 1 && finalStatus === "completed", detail: `steps=${visited.join(" → ")}` });
    if (scenario === "documento_cnh") checks.push({ name: "CNH não exigiu verso", passed: finalCustomer?.document_type === "cnh" && !visited.includes("aguardando_doc_verso"), detail: `doc=${finalCustomer?.document_type}, steps=${visited.join(" → ")}` });

    const checksPassed = checks.filter((c) => c.passed).length;
    const marketReadiness = commercialStatus(finalStatus, checks);
    const recommendation = checks.every((c) => c.passed)
      ? "Fluxo validado para este cenário. Rodar os demais cenários antes de escalar."
      : `Corrigir: ${checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`;

    await supabase.from("bot_test_runs").update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      summary: {
        turns: turns.length,
        lastStep,
        stopReason,
        visitedSteps: visited,
        checks,
        checksPassed,
        checksTotal: checks.length,
        finalStatus: finalCustomer?.status || null,
        marketReadiness,
        recommendation,
      },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true,
      runId,
      status: finalStatus,
      phone,
      turns: turns.length,
      lastStep,
      stopReason,
      visitedSteps: visited,
      outbound: outboundAll,
      checks,
      checksPassed,
      checksTotal: checks.length,
      customerId: customer.id,
      finalCustomerStatus: finalCustomer?.status || null,
      marketReadiness,
      recommendation,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("bot-e2e-runner error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

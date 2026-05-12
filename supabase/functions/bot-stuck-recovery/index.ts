// Bot Stuck Recovery — cron a cada 5 min.
// Sistema de 3 estágios de resgate progressivo:
//   Estágio 1 (5min):  re-pergunta gentil
//   Estágio 2 (2h):    re-pergunta com urgência + opção PULAR
//   Estágio 3 (24h):   marca abandoned + alerta admin
// Não toca em leads que já estão em fases finais (worker/portal/OTP/facial/complete).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEvolutionSender } from "../_shared/evolution-api.ts";
import { getReplyForStep } from "../_shared/conversation-helpers.ts";
import { captureError } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAGE1_MIN = 5;       // 5 min — primeira tentativa
const STAGE2_MIN = 120;     // 2h — segunda tentativa com urgência
const STAGE3_MIN = 24 * 60; // 24h — abandono
const MAX_RESCUES_PER_RUN = 50;
const RESCUE_THROTTLE_MIN = 30; // anti-spam: mínimo 30 min entre dois rescues no mesmo lead
const MAX_ATTEMPTS_BEFORE_STUCK = 3; // após 3 sem resposta → marca como stuck_*

// Steps que viram stuck_finalizar quando esgotam tentativas
const FINALIZAR_STEPS = new Set(["ask_finalizar", "finalizando"]);
// Steps que viram stuck_contact (faltando telefone/email)
const CONTACT_STEPS = new Set(["ask_phone_confirm", "ask_phone", "ask_email"]);

// Steps onde faz sentido re-perguntar. Steps técnicos (portal/otp/facial) NÃO entram.
const RESCUABLE_STEPS = new Set([
  "welcome", "menu_inicial", "pos_video",
  "aguardando_conta", "confirmando_dados_conta",
  "ask_tipo_documento", "aguardando_doc_frente", "aguardando_doc_verso",
  "confirmando_dados_doc",
  "ask_name", "ask_cpf", "ask_rg", "ask_birth_date",
  "ask_phone_confirm", "ask_phone", "ask_email",
  "ask_cep", "ask_number", "ask_complement",
  "ask_installation_number", "ask_bill_value",
  "ask_doc_frente_manual", "ask_doc_verso_manual",
  "ask_finalizar",
  "editing_conta_menu", "editing_conta_nome", "editing_conta_endereco",
  "editing_conta_cep", "editing_conta_distribuidora", "editing_conta_instalacao",
  "editing_conta_valor",
  "editing_doc_menu", "editing_doc_nome", "editing_doc_cpf",
  "editing_doc_rg", "editing_doc_nascimento",
]);

// Steps onde podemos sugerir "PULAR" (campos opcionais)
// ⚠️ ask_email NÃO é skippable — email é obrigatório no portal iGreen
const SKIPPABLE_STEPS = new Set(["ask_complement"]);

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const stats = { scanned: 0, stage1: 0, stage2: 0, stage3_abandoned: 0, skipped: 0, errors: 0 };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cutoff = new Date(Date.now() - STAGE1_MIN * 60_000).toISOString();

    // Aceita customer_ids opcional no body para resgate seletivo via UI
    let customerIds: string[] | null = null;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (Array.isArray(body?.customer_ids) && body.customer_ids.length > 0) {
          customerIds = body.customer_ids.filter((x: any) => typeof x === "string");
        }
      }
    } catch {
      // ignore — sem body é cron normal
    }

    // Busca leads parados — APENAS leads iniciados pela instância
    // (têm conversation_step preenchido em fase de coleta).
    // Leads importados/cadastrados manualmente (sem step ou em fases finais) ficam fora.
    let query = supabase
      .from("customers")
      .select("id, phone_whatsapp, consultant_id, conversation_step, last_bot_reply_at, name, rescue_attempts, last_rescue_at, status");

    if (customerIds && customerIds.length > 0) {
      // Modo seletivo: ignora cutoff/status filters — admin escolheu manualmente
      query = query.in("id", customerIds);
    } else {
      query = query
        .lt("last_bot_reply_at", cutoff)
        .in("conversation_step", Array.from(RESCUABLE_STEPS))
        .not("status", "in", "(complete,cadastro_concluido,portal_submitting,registered_igreen,approved,awaiting_signature,automation_failed)")
        .neq("status", "abandoned")
        .order("last_bot_reply_at", { ascending: true })
        .limit(MAX_RESCUES_PER_RUN);
    }

    const { data: stuck, error } = await query;

    if (error) {
      captureError(error as any, { tags: { function: "bot-stuck-recovery", kind: "query_failed" } });
      throw error;
    }

    stats.scanned = stuck?.length || 0;
    console.log(`🔍 ${stats.scanned} leads candidatos a rescue (cutoff: ${cutoff})`);

    // Mapa: consultant_id -> instance_name (cache)
    const instanceCache = new Map<string, string>();
    async function getInstanceName(consultantId: string): Promise<string | null> {
      if (instanceCache.has(consultantId)) return instanceCache.get(consultantId)!;
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("consultant_id", consultantId)
        .maybeSingle();
      const name = data?.instance_name || null;
      if (name) instanceCache.set(consultantId, name);
      return name;
    }

    for (const lead of stuck || []) {
      const step = lead.conversation_step || "";
      if (!RESCUABLE_STEPS.has(step)) {
        stats.skipped++;
        continue;
      }
      if (!lead.consultant_id) {
        stats.skipped++;
        continue;
      }

      // Determina qual estágio aplicar baseado no tempo desde o último reply do bot
      const idleMinutes = (Date.now() - new Date(lead.last_bot_reply_at).getTime()) / 60_000;
      const attempts = lead.rescue_attempts || 0;

      // Anti-spam: não enviar dois rescues seguidos no mesmo lead se o último foi < 30 min atrás
      // TAMBÉM usar last_bot_reply_at como fallback se last_rescue_at for null
      const lastRescueTime = lead.last_rescue_at || lead.last_bot_reply_at;
      if (lastRescueTime) {
        const sinceLastRescue = (Date.now() - new Date(lastRescueTime).getTime()) / 60_000;
        if (sinceLastRescue < RESCUE_THROTTLE_MIN) {
          stats.skipped++;
          continue;
        }
      }

      // ── Após N tentativas sem resposta → mover para fila de ação manual ──
      if (attempts >= MAX_ATTEMPTS_BEFORE_STUCK) {
        let newStatus: string | null = null;
        if (FINALIZAR_STEPS.has(step)) newStatus = "stuck_finalizar";
        else if (CONTACT_STEPS.has(step)) newStatus = "stuck_contact";
        if (newStatus) {
          await supabase
            .from("customers")
            .update({
              status: newStatus,
              error_message: `Lead travado em ${step} após ${attempts} tentativas de resgate sem resposta`,
            })
            .eq("id", lead.id);
          stats.skipped++;
          console.log(`🟡 ${newStatus} ${lead.id} (step: ${step}, attempts: ${attempts})`);
          continue;
        }
      }

      // ── ESTÁGIO 3: 24h+ → abandonar
      if (idleMinutes >= STAGE3_MIN) {
        await supabase
          .from("customers")
          .update({ status: "abandoned", error_message: `Lead abandonado após 24h sem resposta no step ${step}` })
          .eq("id", lead.id);
        stats.stage3_abandoned++;
        console.log(`🔴 Stage3 ABANDONED ${lead.id} (step: ${step}, idle: ${Math.round(idleMinutes)}min)`);
        continue;
      }

      try {
        const instanceName = await getInstanceName(lead.consultant_id);
        if (!instanceName) {
          stats.skipped++;
          continue;
        }

        const sender = createEvolutionSender(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName);
        const remoteJid = `${lead.phone_whatsapp}@s.whatsapp.net`;

        // Buscar dados completos do customer para gerar reply correto
        const { data: full } = await supabase
          .from("customers")
          .select("*")
          .eq("id", lead.id)
          .single();

        const baseReply = getReplyForStep(step, full || lead);
        const firstName = lead.name ? `, ${String(lead.name).split(" ")[0]}` : "";
        let rescueMsg: string;
        let stageUsed: 1 | 2;

        // ── ESTÁGIO 2: 2h+ → urgência + dica de PULAR
        if (idleMinutes >= STAGE2_MIN) {
          stageUsed = 2;
          const skipHint = SKIPPABLE_STEPS.has(step)
            ? "\n\n💡 *Dica:* Se preferir, digite *PULAR* para esse campo."
            : "";
          rescueMsg = `⏰ Olá${firstName}! Para finalizarmos seu cadastro com a iGreen, preciso só desta informação:\n\n${baseReply}${skipHint}\n\n_Caso não queira mais continuar, é só ignorar esta mensagem._`;
        } else {
          // ── ESTÁGIO 1: 5min — gentil
          stageUsed = 1;
          rescueMsg = `👋 Oi${firstName}! Ainda está aí? Vamos continuar de onde paramos:\n\n${baseReply}`;
        }

        const sent = await sender.sendText(remoteJid, rescueMsg);
        if (sent) {
          if (stageUsed === 1) stats.stage1++;
          else stats.stage2++;
          await supabase
            .from("customers")
            .update({
              last_bot_reply_at: new Date().toISOString(),
              last_rescue_at: new Date().toISOString(),
              rescue_attempts: attempts + 1,
            })
            .eq("id", lead.id);
          await supabase.from("conversations").insert({
            customer_id: lead.id,
            message_direction: "outbound",
            message_text: rescueMsg,
            message_type: "text",
            conversation_step: step,
          });
          console.log(`✅ Stage${stageUsed} rescued ${lead.id} (step: ${step}, idle: ${Math.round(idleMinutes)}min, attempts: ${attempts + 1})`);
        } else {
          stats.errors++;
        }
      } catch (e: any) {
        stats.errors++;
        console.error(`❌ Rescue failed for ${lead.id}:`, e?.message);
        captureError(e, {
          tags: { function: "bot-stuck-recovery", kind: "rescue_failed" },
          extra: { customer_id: lead.id, step },
        });
      }
    }

    const duration = Date.now() - startedAt;
    console.log(`📊 Rescue done in ${duration}ms:`, stats);
    return new Response(
      JSON.stringify({ ok: true, duration_ms: duration, ...stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Bot rescue error:", err);
    captureError(err, { tags: { function: "bot-stuck-recovery" } });
    return new Response(JSON.stringify({ error: String(err?.message || err), stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
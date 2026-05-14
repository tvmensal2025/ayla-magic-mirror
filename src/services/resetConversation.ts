import { supabase } from "@/integrations/supabase/client";

/**
 * Reseta a conversa de um lead para o estado inicial (pra você testar o bot do zero):
 * - Apaga mensagens locais (`conversations`)
 * - Apaga logs de áudio da Camila (`ai_slot_dispatch_log`)
 * - Apaga decisões da IA (`ai_decisions`, `ai_agent_logs`, `bot_step_transitions`)
 * - Zera estado do customer (step, OCR attempts, bot_paused, fases, etc.)
 *
 * Não apaga o customer em si nem deals do CRM — só limpa o histórico de bot.
 */
export async function resetLeadConversation(opts: {
  consultantId: string;
  remoteJid?: string | null;
  customerId?: string | null;
}): Promise<{ ok: true; customerId: string | null } | { ok: false; error: string }> {
  try {
    let customerId = opts.customerId || null;
    if (!customerId && opts.remoteJid) {
      const phone = opts.remoteJid.split("@")[0];
      const { data: c } = await supabase
        .from("customers")
        .select("id")
        .eq("consultant_id", opts.consultantId)
        .eq("phone_whatsapp", phone)
        .maybeSingle();
      customerId = c?.id || null;
    }

    if (customerId) {
      const remoteJid = opts.remoteJid || null;

      await Promise.all([
        supabase.from("conversations").delete().eq("customer_id", customerId),
        supabase.from("ai_slot_dispatch_log").delete().eq("customer_id", customerId),
        supabase.from("ai_decisions").delete().eq("customer_id", customerId),
        supabase.from("ai_agent_logs").delete().eq("customer_id", customerId),
        supabase.from("bot_step_transitions").delete().eq("customer_id", customerId),
        supabase.from("customer_memory").delete().eq("customer_id", customerId),
        supabase.from("ai_usage_log").delete().eq("customer_id", customerId),
        supabase.from("worker_phase_logs").delete().eq("customer_id", customerId),
      ]);

      if (remoteJid) {
        await Promise.all([
          supabase.from("scheduled_messages").delete().eq("remote_jid", remoteJid),
          supabase.from("crm_auto_message_log").delete().eq("remote_jid", remoteJid),
          supabase.from("customer_tags").delete().eq("remote_jid", remoteJid),
        ]);
      }

      // Lead vira do zero: zera identidade, OCR, fases e qualquer "memória" que a IA pudesse usar
      await supabase
        .from("customers")
        .update({
          name: null,
          name_source: "unknown",
          cpf: null,
          rg: null,
          data_nascimento: null,
          email: null,
          cep: null,
          address_street: null,
          address_number: null,
          address_complement: null,
          address_neighborhood: null,
          address_city: null,
          address_state: null,
          distribuidora: null,
          numero_instalacao: null,
          electricity_bill_value: null,
          electricity_bill_photo_url: null,
          bill_base64: null,
          bill_message_id: null,
          bill_requested_at: null,
          document_front_url: null,
          document_back_url: null,
          document_front_base64: null,
          document_type: null,
          media_message_id: null,
          conversation_step: null,
          conversation_summary: null,
          summary_updated_at: null,
          sales_phase: null,
          qualification_score: null,
          intent_signals: null,
          pain_point: null,
          next_followup_at: null,
          ocr_done: false,
          ocr_conta_attempts: 0,
          ocr_doc_attempts: 0,
          ocr_confianca: null,
          rescue_attempts: 0,
          last_rescue_at: null,
          ai_rescue_count: 0,
          ai_last_rescue_at: null,
          next_rescue_allowed_at: null,
          last_bot_reply_at: null,
          phone_contact_confirmed: false,
          facial_confirmed_at: null,
          link_facial: null,
          portal_submitted_at: null,
          otp_code: null,
          otp_received_at: null,
          error_message: null,
          bot_paused: false,
          bot_paused_reason: null,
          bot_paused_at: null,
          assigned_human_id: null,
          status: "pending",
        })
        .eq("id", customerId);
    }

    return { ok: true, customerId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falha ao resetar" };
  }
}

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
      await supabase.from("conversations").delete().eq("customer_id", customerId);
      await supabase.from("ai_slot_dispatch_log").delete().eq("customer_id", customerId);
      await supabase.from("ai_decisions").delete().eq("customer_id", customerId);
      await supabase.from("ai_agent_logs").delete().eq("customer_id", customerId);
      await supabase.from("bot_step_transitions").delete().eq("customer_id", customerId);
      await supabase
        .from("customers")
        .update({
          conversation_step: null,
          bot_paused: false,
          bot_paused_reason: null,
          bot_paused_at: null,
          ocr_conta_attempts: 0,
          ocr_doc_attempts: 0,
          rescue_attempts: 0,
          last_rescue_at: null,
          last_bot_reply_at: null,
          sales_phase: null,
          qualification_score: null,
          intent_signals: null,
          pain_point: null,
          assigned_human_id: null,
          error_message: null,
        })
        .eq("id", customerId);
    }

    return { ok: true, customerId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falha ao resetar" };
  }
}

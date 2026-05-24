// Lead source tagging (Phase E Task 27 do whatsapp-flow-architecture-v3).
//
// Mantém os 3 métodos atuais (CTWA mapping, initial_message exata, regex
// de "vi seu anúncio"). Roda fire-and-forget via `queueMicrotask` no
// webhook — falha de tagging NUNCA trava o turno do bot.
//
// Move o bloco `5.5 Auto-tag lead source` que vivia inline em
// `evolution-webhook/index.ts:341-460` para módulo dedicado, sem mudar
// a lógica de match.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonLog } from "../audit.ts";

export interface TagLeadSourceInput {
  customer: {
    id: string;
    consultant_id: string;
    source_campaign_id?: string | null;
    lead_source?: string | null;
  };
  /** Texto da primeira mensagem (para match de initial_message ou regex). */
  messageText: string | null;
  /** Payload bruto do webhook (para extrair externalAdReply / ctwaClid). */
  rawWebhookBody: unknown;
  /** True quando inbound é mídia (regex ads não dispara em mídia). */
  isFile: boolean;
}

const ADS_REGEX = /(tenho interesse.*mais informa[çc][õo]es|gostaria de saber mais|quero saber mais|vi seu an[uú]ncio|vim do an[uú]ncio|do an[uú]ncio|pelo an[uú]ncio|vi o an[uú]ncio|facebook|instagram|\bfb ads?\b|\bmeta ads?\b|patrocinad|reels|stories|sponsored)/i;

/**
 * Roda detecção de origem do lead. NUNCA lança — todo erro vira `jsonLog`.
 *
 * Idempotente: se `customer.source_campaign_id` ou `customer.lead_source`
 * já estão setados, retorna imediatamente.
 */
export async function tagLeadSource(
  supabase: SupabaseClient,
  input: TagLeadSourceInput,
): Promise<void> {
  try {
    if (input.customer.source_campaign_id || input.customer.lead_source) {
      return; // já tageado
    }
    const body = input.rawWebhookBody as any;
    const msgData = body?.data?.message ?? body?.messages?.[0] ?? {};
    const ctxInfo =
      msgData?.extendedTextMessage?.contextInfo ||
      msgData?.imageMessage?.contextInfo ||
      msgData?.documentMessage?.contextInfo ||
      msgData?.videoMessage?.contextInfo ||
      msgData?.audioMessage?.contextInfo ||
      null;
    const externalAdReply = ctxInfo?.externalAdReply || null;
    const ctwaClid = body?.data?.ctwaClid || externalAdReply?.ctwaClid || null;
    const hasReferral = !!(externalAdReply || ctwaClid);

    const referralPayload = externalAdReply
      ? {
          title: externalAdReply.title,
          body: externalAdReply.body,
          source_url: externalAdReply.sourceUrl,
          media_url: externalAdReply.thumbnailUrl,
          ctwa_clid: ctwaClid,
        }
      : ctwaClid
      ? { ctwa_clid: ctwaClid }
      : null;

    let sourceCampaignId: string | null = null;
    let matchMethod: "ctwa_clid" | "exact_message" | "tsvector" | "unmatched" = "unmatched";

    // 1) Match por ctwa_clid (sinal forte do Meta)
    if (ctwaClid) {
      try {
        const { data: mapping } = await supabase
          .from("ctwa_clid_mapping")
          .select("campaign_id")
          .eq("ctwa_clid", ctwaClid)
          .maybeSingle();
        if ((mapping as any)?.campaign_id) {
          sourceCampaignId = (mapping as any).campaign_id;
          matchMethod = "ctwa_clid";
        }
      } catch (e: any) {
        console.warn("[lead-source] ctwa_clid lookup falhou:", e?.message);
      }
    }

    // 2) Match por initial_message exata
    if (!sourceCampaignId && input.messageText && input.messageText.trim().length > 5) {
      try {
        const normalizedMsg = input.messageText.trim().toLowerCase().replace(/\s+/g, " ");
        const { data: campaigns } = await supabase
          .from("facebook_campaigns")
          .select("id, initial_message")
          .eq("consultant_id", input.customer.consultant_id)
          .not("initial_message", "is", null)
          .limit(50);
        if (campaigns && campaigns.length > 0) {
          const matched = (campaigns as any[]).find((c) => {
            const im = String(c.initial_message || "").trim().toLowerCase().replace(/\s+/g, " ");
            return im.length > 5 && normalizedMsg.startsWith(im.slice(0, Math.min(im.length, 60)));
          });
          if (matched) {
            sourceCampaignId = matched.id;
            matchMethod = "exact_message";
          }
        }
      } catch (e: any) {
        console.warn("[lead-source] initial_message match falhou:", e?.message);
      }
    }

    // 3) Regex fallback de frases típicas de anúncio
    const textMatch = !input.isFile && input.messageText && ADS_REGEX.test(input.messageText);

    if (hasReferral || textMatch || sourceCampaignId) {
      const patch: Record<string, unknown> = { lead_source: "meta_ads" };
      if (sourceCampaignId) patch.source_campaign_id = sourceCampaignId;
      if (ctwaClid) patch.source_ctwa_clid = ctwaClid;
      if (referralPayload) patch.source_referral = referralPayload;

      try {
        await supabase.from("customers").update(patch).eq("id", input.customer.id);
      } catch (e: any) {
        jsonLog("warn", "lead_source_tag_failed", {
          customer_id: input.customer.id,
          stage: "update_customers",
          message: e?.message,
        });
        return;
      }

      jsonLog("info", "lead_source_tagged", {
        customer_id: input.customer.id,
        consultant_id: input.customer.consultant_id,
        source_campaign_id: sourceCampaignId,
        ctwa_clid: ctwaClid,
        match_method: matchMethod,
      });
    }

    // Auditoria de match (best-effort, fail-open)
    try {
      await supabase.from("campaign_match_log").insert({
        customer_id: input.customer.id,
        campaign_id: sourceCampaignId,
        method: matchMethod,
        message_sample: input.messageText ? String(input.messageText).slice(0, 200) : null,
      });
    } catch (e: any) {
      console.warn("[campaign-match-log] insert falhou:", e?.message);
    }
  } catch (e: any) {
    // Captura final — tagging não pode quebrar o turno.
    jsonLog("warn", "lead_source_tag_failed", {
      customer_id: input.customer.id,
      stage: "outer_exception",
      message: e?.message ?? String(e),
    });
  }
}

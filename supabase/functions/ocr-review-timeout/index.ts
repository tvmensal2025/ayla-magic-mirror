// Cron: libera leads que estão pendurados em ocr_review_pending por mais
// de 5 minutos. Chama o pipeline de confirmação ao cliente (caminho normal).
//
// Roda a cada 1 minuto. Se o consultor não decidir no painel, o lead segue
// pelo fluxo automático: bot manda dados pro cliente confirmar via WhatsApp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TIMEOUT_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - TIMEOUT_MS).toISOString();

    // Pega todos os leads que passaram do prazo de review.
    const { data: stale, error } = await supabase
      .from("customers")
      .select("id, consultant_id, ocr_review_pending, ocr_review_started_at, name")
      .not("ocr_review_pending", "is", null)
      .lt("ocr_review_started_at", cutoff)
      .limit(100);

    if (error) {
      console.error("[ocr-review-timeout] query failed", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (stale as any[]) || [];
    let released = 0;

    for (const c of items) {
      try {
        const kind = c.ocr_review_pending as "bill" | "doc";
        const nextStep = kind === "bill" ? "confirmando_dados_conta" : "confirmando_dados_doc";

        // Marca como "auto-timeout" (pra rastreabilidade).
        await supabase.from("customers").update({
          ocr_review_pending: null,
          ocr_review_decided_at: new Date().toISOString(),
          ocr_review_decided_by: "auto_timeout",
          [kind === "bill" ? "bill_data_confirmation_by" : "doc_data_confirmation_by"]: "awaiting_client",
          conversation_step: nextStep,
        }).eq("id", c.id);

        // Dispara o passo de confirmação pelo bot.
        try {
          await supabase.functions.invoke("manual-step-send", {
            body: {
              consultantId: c.consultant_id,
              customerId: c.id,
              stepKey: nextStep,
              part: "all",
              continueFlow: false,
              skipNameGuard: true,
            },
          });
        } catch (sendErr) {
          console.warn(`[ocr-review-timeout] dispatch failed for customer=${c.id}:`, (sendErr as Error)?.message);
        }

        released++;
        console.log(`[ocr-review-timeout] released customer=${c.id} kind=${kind} (consultor não decidiu em 5min)`);
      } catch (e) {
        console.error(`[ocr-review-timeout] failed to release customer=${c.id}`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, scanned: items.length, released }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ocr-review-timeout] crashed", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

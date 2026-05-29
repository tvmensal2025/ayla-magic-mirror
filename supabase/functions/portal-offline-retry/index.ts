// portal-offline-retry: cron 1×/min que reprocessa leads parados em worker_offline.
// Estratégia: chama dispatchPortalWorker para cada lead candidato (até MAX_PER_RUN).
// Após N tentativas sem sucesso (MAX_RETRIES), marca como automation_failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchPortalWorker } from "../_shared/portal-worker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_RUN = 10;
const MAX_RETRIES = 30;          // 30 min de tentativas (1/min)
const LOOKBACK_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

  const { data: leads, error } = await supabase
    .from("customers")
    .select("id, name, portal_retry_count, finalized_at, portal_last_retry_at")
    .eq("status", "worker_offline")
    .gte("finalized_at", cutoff)
    .order("portal_last_retry_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("[portal-offline-retry] query error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const lead of leads || []) {
    const tries = (lead.portal_retry_count || 0) + 1;

    if (tries > MAX_RETRIES) {
      await supabase.from("customers").update({
        status: "automation_failed",
        error_message: `Worker offline após ${MAX_RETRIES} tentativas — intervenção manual necessária`,
      }).eq("id", lead.id);
      results.push({ id: lead.id, action: "abandoned", tries });
      continue;
    }

    const dispatch = await dispatchPortalWorker(supabase, lead.id);
    await supabase.from("customers").update({
      portal_retry_count: tries,
      portal_last_retry_at: new Date().toISOString(),
      ...(dispatch.ok ? { status: "portal_submitting" } : {}),
    }).eq("id", lead.id);

    results.push({
      id: lead.id,
      name: lead.name,
      tries,
      ok: dispatch.ok,
      mode: dispatch.mode,
      error: dispatch.error,
    });
  }

  console.log(`[portal-offline-retry] processed=${results.length}`, JSON.stringify(results));

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

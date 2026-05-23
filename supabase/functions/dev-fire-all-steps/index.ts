// DEV ONLY — dispara todos os passos de um fluxo (variante A/B/C) sequencialmente
// para o cliente de teste 5511971254913. Travado por número para evitar abuso.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TEST_PHONE = "5511971254913";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const customerId: string | undefined = body?.customerId;
    const variant: "A" | "B" | "C" = (body?.variant || "A").toUpperCase();
    if (!customerId) return json({ ok: false, error: "missing customerId" }, 400);

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone_whatsapp, consultant_id, flow_variant, conversation_step, bot_paused")
      .eq("id", customerId)
      .maybeSingle();
    if (!customer) return json({ ok: false, error: "customer_not_found" }, 404);

    const phoneDigits = String(customer.phone_whatsapp || "").replace(/\D/g, "");
    if (phoneDigits !== TEST_PHONE) {
      return json({ ok: false, error: "blocked", message: `Apenas ${TEST_PHONE} é permitido (recebido: ${phoneDigits})` }, 403);
    }

    // Pega o fluxo do consultor na variante pedida
    const { data: flow } = await supabase
      .from("bot_flows")
      .select("id, variant")
      .eq("consultant_id", customer.consultant_id)
      .eq("variant", variant)
      .maybeSingle();
    if (!flow) return json({ ok: false, error: "flow_not_found", consultant: customer.consultant_id, variant }, 404);

    const { data: steps } = await supabase
      .from("bot_flow_steps")
      .select("id, step_key, position, step_type, message_text, title")
      .eq("flow_id", flow.id)
      .eq("is_active", true)
      .order("position", { ascending: true });

    const allSteps = steps || [];
    const messageSteps = allSteps.filter((s: any) => s.step_type === "message");
    const captureSteps = allSteps.filter((s: any) => String(s.step_type).startsWith("capture_") || s.step_type === "finalizar_cadastro");

    // Reset opcional: vira o cliente em "virgem" para testar end-to-end completo
    const reset = !!body?.reset;
    const resetPayload: Record<string, unknown> = {
      bot_paused: false,
      last_custom_prompt_at: null,
    };
    if (reset) {
      Object.assign(resetPayload, {
        conversation_step: null,
        bill_data_confirmed_at: null,
        doc_data_confirmed_at: null,
        bill_holder_name: null,
        doc_holder_name: null,
        bill_requested_at: null,
        electricity_bill_value: null,
        electricity_bill_photo_url: null,
        document_front_url: null,
        document_back_url: null,
        document_type: null,
        document_front_base64: null,
        bill_base64: null,
        bill_message_id: null,
        name_mismatch_flag: false,
        name_mismatch_reason: null,
        name_mismatch_acknowledged_at: null,
        facial_confirmed_at: null,
        ocr_doc_attempts: 0,
        assigned_human_id: null,
        flow_variant: variant,
      });
    }
    await supabase.from("customers").update(resetPayload).eq("id", customerId);

    const FN_URL = `${SUPABASE_URL}/functions/v1/manual-step-send`;
    const runId = crypto.randomUUID();

    // PLANO: 1 disparo de mensagem com chain ON (chega até último message)
    //        + N disparos de capture sequenciais (cada um pede o input)
    const firstMessage = messageSteps[0];
    const sequence: Array<{ step: any; continueFlow: boolean; waitAfterMs: number }> = [];
    if (firstMessage) {
      // estima tempo de cadeia: ~12s por message step
      sequence.push({ step: firstMessage, continueFlow: true, waitAfterMs: Math.max(messageSteps.length * 12_000, 30_000) });
    }
    for (const cap of captureSteps) {
      sequence.push({ step: cap, continueFlow: false, waitAfterMs: 8_000 });
    }

    const plan = sequence.map((s) => ({
      position: s.step.position,
      step_type: s.step.step_type,
      step_key: s.step.step_key,
      step_id: s.step.id,
      continue_flow: s.continueFlow,
      wait_after_ms: s.waitAfterMs,
      text_preview: String(s.step.message_text || s.step.title || "").slice(0, 60),
    }));

    const fireAll = async () => {
      for (const item of sequence) {
        const t0 = Date.now();
        const payload = {
          consultantId: customer.consultant_id,
          customerId,
          stepId: item.step.id,
          stepKey: item.step.step_key,
          part: "all",
          continueFlow: item.continueFlow,
          variant,
          force: true,
          skipNameGuard: true,
        };
        let result: any;
        let httpStatus = 0;
        try {
          const r = await fetch(FN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify(payload),
          });
          httpStatus = r.status;
          const text = await r.text();
          try { result = JSON.parse(text); } catch { result = { raw: text.slice(0, 200) }; }
        } catch (e) {
          result = { error: String((e as Error).message || e) };
        }
        const dt = Date.now() - t0;
        console.log(`[dev-fire-all-steps] run=${runId} pos=${item.step.position} type=${item.step.step_type} chain=${item.continueFlow} status=${httpStatus} elapsed=${dt}ms result=${JSON.stringify(result).slice(0,200)}`);
        // limpa debounce antes do próximo capture
        await supabase.from("customers").update({ last_custom_prompt_at: null, bot_paused: false }).eq("id", customerId);
        await new Promise((res) => setTimeout(res, item.waitAfterMs));
      }
      console.log(`[dev-fire-all-steps] run=${runId} DONE`);
    };

    // @ts-ignore EdgeRuntime
    (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(fireAll()) : fireAll();

    return json({
      ok: true,
      run_id: runId,
      customer: { id: customer.id, phone: phoneDigits, name: customer.name },
      flow: { id: flow.id, variant },
      total: plan.length,
      strategy: "1 message with chain + N captures individuais (zero duplicação)",
      plan,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});

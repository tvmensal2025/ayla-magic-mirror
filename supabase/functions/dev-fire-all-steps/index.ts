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

    // Despausa para garantir envio
    await supabase.from("customers").update({ bot_paused: false }).eq("id", customerId);

    const FN_URL = `${SUPABASE_URL}/functions/v1/manual-step-send`;
    const allToFire = [...messageSteps, ...captureSteps];

    const plan = allToFire.map((s: any) => ({
      position: s.position,
      step_type: s.step_type,
      step_key: s.step_key,
      step_id: s.id,
      text_preview: String(s.message_text || s.title || "").slice(0, 60),
    }));

    // grava plano + status numa tabela leve para inspeção
    const runId = crypto.randomUUID();

    // dispara em background — não trava resposta HTTP
    const fireAll = async () => {
      for (const step of allToFire) {
        const t0 = Date.now();
        const payload = {
          consultantId: customer.consultant_id,
          customerId,
          stepId: step.id,
          stepKey: step.step_key,
          part: "all",
          continueFlow: false,
          variant,
          force: true,
        };
        let result: any;
        let httpStatus = 0;
        try {
          const r = await fetch(FN_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify(payload),
          });
          httpStatus = r.status;
          const text = await r.text();
          try { result = JSON.parse(text); } catch { result = { raw: text.slice(0, 200) }; }
        } catch (e) {
          result = { error: String((e as Error).message || e) };
        }
        const dt = Date.now() - t0;
        console.log(`[dev-fire-all-steps] run=${runId} pos=${step.position} type=${step.step_type} step=${step.step_key} status=${httpStatus} elapsed=${dt}ms result=${JSON.stringify(result).slice(0,300)}`);
        await new Promise((res) => setTimeout(res, 2000));
      }
      console.log(`[dev-fire-all-steps] run=${runId} DONE total=${allToFire.length}`);
    };

    // @ts-ignore EdgeRuntime presente no Supabase Edge
    (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(fireAll()) : fireAll();

    return json({
      ok: true,
      run_id: runId,
      customer: { id: customer.id, phone: phoneDigits, name: customer.name },
      flow: { id: flow.id, variant },
      total: plan.length,
      plan,
      note: "Disparado em background. Acompanhe nos logs (dev-fire-all-steps / manual-step-send) ou na tabela conversations.",
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});

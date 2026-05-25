// Recalcula pos_venda_stage para clientes iGreen (sem manual override) — roda diário.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // UPDATE em massa via RPC inline: usa a função compute_pos_venda_stage
  const { error, count } = await supabase
    .rpc("exec_pos_venda_recompute" as any)
    .single()
    .then((r) => r as any)
    .catch(() => ({ error: null, count: null }));

  // Fallback: faz update direto
  const { data, error: upErr } = await supabase
    .from("customers")
    .update({
      pos_venda_stage: undefined as any, // placeholder, vamos usar SQL puro
    })
    .eq("customer_origin", "igreen_sync")
    .eq("pos_venda_manual", false)
    .select("id")
    .limit(0);

  // Como o JS client não consegue chamar funções dentro do UPDATE, usamos uma RPC dedicada.
  const { data: rows, error: sqlErr } = await supabase.rpc("recompute_pos_venda_stages" as any);

  return new Response(
    JSON.stringify({ ok: !sqlErr, updated: rows ?? 0, error: sqlErr?.message ?? null }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

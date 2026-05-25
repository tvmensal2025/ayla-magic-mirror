import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("recompute_pos_venda_stages" as any);

  return new Response(
    JSON.stringify({ ok: !error, updated: data ?? 0, error: error?.message ?? null }),
    { status: error ? 500 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// DEPRECATED — mesclado em bot-stuck-recovery (que agora usa ai-sales-agent mode:"rescue").
// Mantido como no-op para não quebrar invocações antigas.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ ok: true, deprecated: true, replaced_by: "bot-stuck-recovery" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

/**
 * instance-health-cron
 * Roda a cada 10 min. Verifica instâncias WhatsApp e notifica quando
 * uma instância de consultor ativo está desconectada há mais de 15 min.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const startedAt = Date.now();
  const alerts: any[] = [];
  const errors: any[] = [];

  try {
    const { data: instances } = await supabase
      .from("whatsapp_instances")
      .select("id, consultant_id, instance_name, status, last_health_check_at, updated_at");

    const cutoff = Date.now() - 15 * 60 * 1000;

    for (const inst of (instances || []) as any[]) {
      const lastSeen = new Date(inst.last_health_check_at || inst.updated_at || 0).getTime();
      const disconnected = inst.status !== "connected";
      const stale = lastSeen < cutoff;
      if (!disconnected && !stale) continue;

      // Pega notification_phone do consultor
      const { data: c } = await supabase
        .from("consultants")
        .select("name, notification_phone, approved")
        .eq("id", inst.consultant_id)
        .maybeSingle();

      if (!c?.approved) continue;

      // Throttle: 1 alerta por instância a cada 60 min
      const since60 = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("production_health_snapshot")
        .select("id")
        .eq("consultant_id", inst.consultant_id)
        .gte("captured_at", since60)
        .contains("errors", [{ kind: "instance_down" }])
        .limit(1);

      if (recent && recent.length > 0) continue;

      // Registra snapshot de alerta
      await supabase.from("production_health_snapshot").insert({
        consultant_id: inst.consultant_id,
        captured_at: new Date().toISOString(),
        instance_status: inst.status || "unknown",
        instance_last_seen: inst.last_health_check_at || inst.updated_at,
        pixel_ok: false,
        capi_ok: false,
        flows_ok: false,
        flows_missing: [],
        active_variants: [],
        notification_phone_ok: !!c?.notification_phone,
        last_lead_at: null,
        leads_24h: 0,
        errors: [{ kind: "instance_down", instance_name: inst.instance_name, status: inst.status }],
      });

      alerts.push({ consultant_id: inst.consultant_id, name: c?.name, status: inst.status });
    }

    return new Response(
      JSON.stringify({ ok: true, alerts, errors, duration_ms: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

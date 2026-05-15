// Bot-flow audit runner.
// mode=fake → 20 cenários sintéticos sem tocar o DB.
// mode=real → consulta o DB (read-only) e roda lint_bot_flow_consistency().

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const FLOW_PREFIX = "flow:";
const FAKE_UUID = "6226f6f3-1234-4abc-9def-1234567890ab";
const FAKE_PASSO = "passo_1715794512345";

type Engine = "sys" | "flow";

function stripPrefix(raw: string | null | undefined): string {
  if (!raw) return "welcome";
  if (raw.startsWith(FLOW_PREFIX)) return raw.slice(FLOW_PREFIX.length);
  return raw;
}
function isFlowStep(raw: string | null | undefined): boolean {
  return !!raw && raw.startsWith(FLOW_PREFIX);
}
function routeEngine(raw: string | null | undefined): Engine {
  if (!raw) return "sys";
  if (raw.startsWith(FLOW_PREFIX)) return "flow";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return "flow";
  if (raw.startsWith("passo_")) return "flow";
  return "sys";
}
function normalizeOutgoing(raw: string | null | undefined, engine: Engine): string | null {
  if (!raw) return null;
  if (engine === "sys") return stripPrefix(raw);
  if (raw.startsWith(FLOW_PREFIX)) return raw;
  const looksFlow =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ||
    raw.startsWith("passo_");
  return looksFlow ? FLOW_PREFIX + raw : raw;
}

type Result = { id: number; name: string; passed: boolean; expected: unknown; got: unknown; detail?: string };

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function runFake(): Result[] {
  const r: Result[] = [];
  const t = (id: number, name: string, expected: unknown, got: unknown, detail?: string) =>
    r.push({ id, name, passed: eq(expected, got), expected, got, detail });

  // 1
  t(1, "Cliente novo (null) → sys/welcome",
    { engine: "sys", step: "welcome" },
    { engine: routeEngine(null), step: stripPrefix(null) });
  // 2
  t(2, "welcome cru → sys, normalizeOutgoing preserva",
    { engine: "sys", out: "welcome" },
    { engine: routeEngine("welcome"), out: normalizeOutgoing("welcome", "sys") });
  // 3
  t(3, "qualificacao cru → sys", "sys", routeEngine("qualificacao"));
  // 4
  t(4, "aguardando_conta → sys, sem prefixo",
    { engine: "sys", out: "aguardando_conta" },
    { engine: routeEngine("aguardando_conta"), out: normalizeOutgoing("aguardando_conta", "sys") });
  // 5
  t(5, "UUID legacy bare → flow + prefixa na saída",
    { engine: "flow", out: `flow:${FAKE_UUID}` },
    { engine: routeEngine(FAKE_UUID), out: normalizeOutgoing(FAKE_UUID, "flow") });
  // 6
  t(6, "passo_<ts> legacy → flow", "flow", routeEngine(FAKE_PASSO));
  // 7
  t(7, "flow:<uuid> idempotente",
    { engine: "flow", out: `flow:${FAKE_UUID}`, strip: FAKE_UUID, isFlow: true },
    {
      engine: routeEngine(`flow:${FAKE_UUID}`),
      out: normalizeOutgoing(`flow:${FAKE_UUID}`, "flow"),
      strip: stripPrefix(`flow:${FAKE_UUID}`),
      isFlow: isFlowStep(`flow:${FAKE_UUID}`),
    });
  // 8
  t(8, "flow handler devolve canônico → mantém cru, próxima volta sys",
    { out: "aguardando_conta", nextEngine: "sys" },
    { out: normalizeOutgoing("aguardando_conta", "flow"), nextEngine: routeEngine("aguardando_conta") });
  // 9
  t(9, "normalizeOutgoing(null) sempre null",
    { sys: null, flow: null },
    { sys: normalizeOutgoing(null, "sys"), flow: normalizeOutgoing(null, "flow") });
  // 10
  t(10, "string vazia → sys/welcome",
    { engine: "sys", strip: "welcome" },
    { engine: routeEngine(""), strip: stripPrefix("") });
  // 11
  t(11, "UUID maiúsculo é reconhecido como flow", "flow", routeEngine(FAKE_UUID.toUpperCase()));
  // 12
  t(12, "editing_conta_valor → sys", "sys", routeEngine("editing_conta_valor"));
  // 13
  t(13, "editing_doc_menu → sys", "sys", routeEngine("editing_doc_menu"));
  // 14
  t(14, "complete → sys", "sys", routeEngine("complete"));
  // 15
  t(15, "string com hífens não-UUID → sys", "sys",
    routeEngine("abcdefg-1234-4abc-9def-1234567890ab"));
  // 16
  t(16, "'flow:' sem id → flow + strip vazio",
    { engine: "flow", strip: "" },
    { engine: routeEngine("flow:"), strip: stripPrefix("flow:") });
  // 17 — Jornada PAULO completa
  let s: string | null = null;
  const journey: string[] = [];
  journey.push(routeEngine(s));
  s = normalizeOutgoing("welcome", "sys"); journey.push(`step:${s}`);
  s = normalizeOutgoing(FAKE_UUID, "flow"); journey.push(`step:${s}`);
  journey.push(routeEngine(s));
  s = normalizeOutgoing("aguardando_conta", "flow"); journey.push(`step:${s}`);
  journey.push(routeEngine(s));
  s = normalizeOutgoing("editing_doc_menu", "sys"); journey.push(`step:${s}`);
  s = normalizeOutgoing("complete", "sys"); journey.push(`step:${s}`);
  t(17, "Jornada PAULO welcome→flow→cadastro→complete sem loop",
    ["sys", "step:welcome", `step:flow:${FAKE_UUID}`, "flow", "step:aguardando_conta", "sys", "step:editing_doc_menu", "step:complete"],
    journey);
  // 18 — flow→sys→flow ping-pong
  let p: string | null = `flow:${FAKE_UUID}`;
  const ping = [routeEngine(p)];
  p = normalizeOutgoing("cadastro_pedir_conta", "flow"); ping.push(routeEngine(p));
  p = normalizeOutgoing(FAKE_UUID, "sys"); ping.push(routeEngine(p));
  t(18, "Ping-pong flow→sys→flow não corrompe estado",
    ["flow", "sys", "flow"], ping);
  // 19 — Reset
  let rs: string | null = `flow:${FAKE_UUID}`;
  rs = null;
  t(19, "Reset → null → próxima msg sys/welcome",
    { engine: "sys", strip: "welcome" },
    { engine: routeEngine(rs), strip: stripPrefix(rs) });
  // 20 — Hostis
  t(20, "Valores hostis (injection, espaços) → sys",
    { sql: "sys", spaces: "sys" },
    { sql: routeEngine("welcome; DROP TABLE customers;"), spaces: routeEngine("  welcome  ") });

  return r;
}

async function runReal(supabase: ReturnType<typeof createClient>) {
  const out: Record<string, unknown> = {};

  // Lint
  const { data: lint, error: lintErr } = await supabase.rpc("lint_bot_flow_consistency");
  out.lint = lintErr ? { error: lintErr.message } : (lint ?? []);

  // Distribuição por tipo de step
  const { data: customers } = await supabase
    .from("customers")
    .select("conversation_step")
    .limit(10000);
  const buckets: Record<string, number> = {
    NULL: 0,
    "flow:prefixed": 0,
    "UUID-bare(legacy)": 0,
    "passo_bare(legacy)": 0,
    "sys-bare(canonical)": 0,
  };
  for (const c of customers ?? []) {
    const v = (c as { conversation_step: string | null }).conversation_step;
    if (!v) buckets.NULL++;
    else if (v.startsWith("flow:")) buckets["flow:prefixed"]++;
    else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
      buckets["UUID-bare(legacy)"]++;
    else if (v.startsWith("passo_")) buckets["passo_bare(legacy)"]++;
    else buckets["sys-bare(canonical)"]++;
  }
  out.distribution = buckets;

  // Últimas 20 transições
  const { data: transitions } = await supabase
    .from("bot_step_transitions")
    .select("created_at, customer_id, from_step, to_step, trigger_type")
    .order("created_at", { ascending: false })
    .limit(20);
  out.recent_transitions = transitions ?? [];

  // Bot pausado nas últimas 24h
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: pausedCount } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("bot_paused", true)
    .gte("bot_paused_at", since);
  out.bot_paused_24h = pausedCount ?? 0;

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "fake";

  try {
    if (mode === "fake") {
      const results = runFake();
      const passed = results.filter((r) => r.passed).length;
      return new Response(
        JSON.stringify({ mode, total: results.length, passed, failed: results.length - passed, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "real") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supaUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claims, error: cErr } = await supaUser.auth.getClaims(token);
      if (cErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Service-role client p/ ler tudo (RLS off)
      const supaSvc = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // Verifica super_admin OU admin
      const userId = claims.claims.sub as string;
      const { data: roles } = await supaSvc
        .from("user_roles").select("role").eq("user_id", userId);
      const isAdmin = (roles ?? []).some((r: { role: string }) =>
        r.role === "admin" || r.role === "super_admin");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await runReal(supaSvc);
      return new Response(JSON.stringify({ mode, ...data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "invalid mode" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

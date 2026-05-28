// Guard contra regressão recorrente: edge functions que recebem webhooks
// EXTERNOS (Whapi, Evolution, Facebook, Stripe, etc.) PRECISAM ter
// `verify_jwt = false` em supabase/config.toml. Sem isso, o serviço externo
// recebe 401 Unauthorized e o webhook é silenciosamente perdido — bug que
// tirou o bot do ar para todos os leads do Rodrigo super admin no dia
// 2026-05-28 quando a função foi redeployada via CLI sem entrada no config.
//
// Esta verificação roda no CI (deno test). Se um dia adicionarem uma nova
// função `*-webhook` ou similar e esquecerem do verify_jwt, o teste quebra
// ANTES de chegar em produção.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const CONFIG_PATH = new URL("../../../config.toml", import.meta.url);

/**
 * Funções que recebem webhooks externos. Padrões:
 *   - `*-webhook` (Whapi, Evolution, Stripe, etc.)
 *   - `facebook-capi`, `facebook-oauth-callback` (Meta CAPI / OAuth callback)
 *   - `facebook-sync-metrics` (chamado por cron Meta)
 *   - `qr-redirect`, `ctwa-status` (links externos diretos)
 *
 * Esses recebem requisições de provedores que NÃO mandam JWT do Supabase.
 * Se `verify_jwt=true`, o gateway responde 401 e o webhook é perdido.
 *
 * IMPORTANTE: a lista é construída dinamicamente — qualquer função nova com
 * sufixo `-webhook` é incluída automaticamente.
 */
const EXPLICIT_EXTERNAL_WEBHOOKS = new Set([
  "facebook-capi",
  "facebook-oauth-callback",
  "facebook-sync-metrics",
  "facebook-token-refresh",
  "facebook-balance-reconcile",
  "facebook-campaign-healthcheck",
  "facebook-campaign-status",
  "facebook-auto-pause",
  "facebook-cbo-to-abo",
  "qr-redirect",
  "ctwa-status",
  "upload-documents-minio", // upload direto do front sem JWT
  "recover-stuck-otp",
]);

async function listFunctionsDir(): Promise<string[]> {
  const dir = new URL("../../", import.meta.url);
  const fns: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
      fns.push(entry.name);
    }
  }
  return fns;
}

function buildExpectedNoJwtList(allFns: string[]): Set<string> {
  const out = new Set<string>(EXPLICIT_EXTERNAL_WEBHOOKS);
  for (const fn of allFns) {
    if (fn.endsWith("-webhook")) out.add(fn);
  }
  return out;
}

function parseFunctionFlags(toml: string): Map<string, { verify_jwt: boolean | null }> {
  // Parser bem simples — só queremos as seções [functions.NAME] e o flag
  // verify_jwt. Nada de TOML completo pra evitar dependência.
  const out = new Map<string, { verify_jwt: boolean | null }>();
  const sectionRx = /^\[functions\.([a-z0-9_-]+)\]\s*$/i;
  const verifyRx = /^\s*verify_jwt\s*=\s*(true|false)\s*$/i;
  let current: string | null = null;
  for (const line of toml.split("\n")) {
    const sm = line.match(sectionRx);
    if (sm) {
      current = sm[1];
      if (!out.has(current)) out.set(current, { verify_jwt: null });
      continue;
    }
    // Sai da seção quando bate em outra header [.*]
    if (/^\[/.test(line.trim()) && current) {
      current = null;
    }
    if (current) {
      const vm = line.match(verifyRx);
      if (vm) {
        out.get(current)!.verify_jwt = vm[1].toLowerCase() === "true";
      }
    }
  }
  return out;
}

Deno.test("config.toml: webhooks externos têm verify_jwt=false declarado", async () => {
  const toml = await Deno.readTextFile(CONFIG_PATH);
  const flags = parseFunctionFlags(toml);
  const allFns = await listFunctionsDir();
  const expected = buildExpectedNoJwtList(allFns);

  const missing: string[] = [];
  const wrong: { fn: string; got: boolean }[] = [];

  for (const fn of expected) {
    // Função não existe no disco? Pula (lista pode estar desatualizada).
    if (!allFns.includes(fn)) continue;
    const cfg = flags.get(fn);
    if (!cfg || cfg.verify_jwt === null) {
      missing.push(fn);
    } else if (cfg.verify_jwt === true) {
      wrong.push({ fn, got: cfg.verify_jwt });
    }
  }

  if (missing.length > 0 || wrong.length > 0) {
    const msg = [
      "config.toml está faltando entradas de verify_jwt=false para webhooks externos.",
      "",
      missing.length > 0 ? `❌ FALTAM declaradas:\n  - ${missing.join("\n  - ")}` : "",
      wrong.length > 0 ? `❌ ERRADAS (verify_jwt=true):\n  - ${wrong.map(w => `${w.fn}`).join("\n  - ")}` : "",
      "",
      "Adicione/corrija em supabase/config.toml:",
      "",
      missing.concat(wrong.map(w => w.fn)).map(fn =>
        `[functions.${fn}]\nverify_jwt = false\n`).join("\n"),
    ].filter(Boolean).join("\n");
    throw new Error(msg);
  }
});

Deno.test("config.toml: parser reconhece seções [functions.*]", () => {
  const sample = `
project_id = "test"

[functions.evolution-webhook]
verify_jwt = false

[functions.foo-bar]
verify_jwt = true
`.trim();
  const flags = parseFunctionFlags(sample);
  assertEquals(flags.size, 2);
  assertEquals(flags.get("evolution-webhook")?.verify_jwt, false);
  assertEquals(flags.get("foo-bar")?.verify_jwt, true);
});

Deno.test("buildExpectedNoJwtList inclui funções com sufixo -webhook automaticamente", () => {
  const allFns = ["evolution-webhook", "whapi-webhook", "wallet-stripe-webhook", "ai-followup-cron"];
  const expected = buildExpectedNoJwtList(allFns);
  assert(expected.has("evolution-webhook"));
  assert(expected.has("whapi-webhook"));
  assert(expected.has("wallet-stripe-webhook"));
  assert(!expected.has("ai-followup-cron")); // cron não é webhook externo
});

// Validate migration 20260601000000_add_layout_to_bot_flow_steps.sql against
// a snapshot of the dev schema using PGlite (embedded Postgres).
//
// This script:
//   1. Spins up a fresh in-memory Postgres instance.
//   2. Recreates the relevant `bot_flows` + `bot_flow_steps` schema as it
//      exists in the live dev database (including RLS, policies, the
//      seed_default_camila_flow function, and 4 pre-existing rows).
//   3. Runs the migration `20260601000000_add_layout_to_bot_flow_steps.sql`.
//   4. Asserts:
//      (a) `layout` column exists as `jsonb` with `DEFAULT NULL` and is
//          nullable.
//      (b) Pre-existing rows have `layout = NULL`.
//      (c) `seed_default_camila_flow` continues to work without any
//          modification (creates a flow + 6 steps with `layout = NULL`).
//      (d) RLS is enabled and policies on `bot_flow_steps` are unchanged.

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MIGRATION_PATH = path.join(
  REPO_ROOT,
  "supabase/migrations/20260601000000_add_layout_to_bot_flow_steps.sql"
);

const ok = (label) => console.log(`  \x1b[32mOK\x1b[0m ${label}`);
const fail = (label, err) => {
  console.error(`  \x1b[31mFAIL\x1b[0m ${label}: ${err}`);
  process.exitCode = 1;
};

const assert = (cond, label, detail = "") => {
  if (cond) ok(label);
  else fail(label, detail || "expected true");
};

const eq = (actual, expected, label) =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    label,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );

console.log("== Validate add_layout_to_bot_flow_steps migration on dev snapshot ==\n");

const db = new PGlite();
await db.waitReady;

// 0. Setup: create stub auth schema/functions used by RLS, then bot_flows /
//    bot_flow_steps as they exist in the live dev database.
console.log("Step 0: build snapshot schema (auth stubs, bot_flows, bot_flow_steps, RLS, seed function)");

await db.exec(`
  -- Stub auth schema (Supabase populates this in real dev; for the snapshot
  -- we only need auth.uid() so RLS policies compile). PGlite doesn't ship
  -- the "authenticated" role, so we create it before any DDL that references it.
  CREATE ROLE authenticated NOINHERIT;

  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT current_setting('request.jwt.claim.sub', true)::uuid
  $$;

  CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE AS $$ SELECT false $$;

  CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$;

  -- bot_flows (parent table referenced by FK in bot_flow_steps).
  CREATE TABLE public.bot_flows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id uuid NOT NULL,
    name text NOT NULL DEFAULT 'Fluxo sem nome',
    is_active boolean NOT NULL DEFAULT false,
    strict_mode boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    variant text NOT NULL DEFAULT 'A' CHECK (variant = ANY (ARRAY['A','B','C','D','E']))
  );

  -- bot_flow_steps (matches live dev schema as captured by pg_get_tabledef).
  CREATE TABLE public.bot_flow_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id uuid NOT NULL REFERENCES public.bot_flows(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    step_type text NOT NULL CHECK (step_type = ANY (ARRAY['audio_slot','message','question','media_request','cadastro','capture_conta','capture_documento','capture_email','confirm_phone','finalizar_cadastro'])),
    slot_key text,
    message_text text,
    wait_for text NOT NULL DEFAULT 'none' CHECK (wait_for = ANY (ARRAY['none','reply','media','timer'])),
    wait_seconds integer NOT NULL DEFAULT 0,
    condition_text text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    title text,
    summary text,
    icon text NOT NULL DEFAULT 'msg',
    is_active boolean NOT NULL DEFAULT true,
    step_key text,
    media_order jsonb NOT NULL DEFAULT '["audio", "image", "video", "text"]'::jsonb,
    transitions jsonb NOT NULL DEFAULT '[]'::jsonb,
    captures jsonb NOT NULL DEFAULT '[]'::jsonb,
    fallback jsonb NOT NULL DEFAULT '{"mode": "repeat"}'::jsonb,
    transitions_backup_pre_v2 jsonb,
    text_delay_ms integer NOT NULL DEFAULT 1500,
    auto_detect_doc_type boolean NOT NULL DEFAULT true,
    persuasive_text text
  );

  -- RLS + policies (matches the policies pulled from pg_policy in dev).
  ALTER TABLE public.bot_flow_steps ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Owner manages own flow steps" ON public.bot_flow_steps
    AS PERMISSIVE FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM bot_flows f WHERE f.id = bot_flow_steps.flow_id AND f.consultant_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM bot_flows f WHERE f.id = bot_flow_steps.flow_id AND f.consultant_id = auth.uid()));

  CREATE POLICY "Super admin manages all flow steps" ON public.bot_flow_steps
    AS PERMISSIVE FOR ALL TO authenticated
    USING (is_super_admin(auth.uid()))
    WITH CHECK (is_super_admin(auth.uid()));
`);

// PGlite doesn't ship the "authenticated" role by default; the role was
// already created above before the policies that reference it.

await db.exec(`
  -- seed_default_camila_flow (verbatim from production via pg_get_functiondef).
  CREATE OR REPLACE FUNCTION public.seed_default_camila_flow(_consultant_id uuid)
   RETURNS uuid
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path TO 'public'
  AS $function$
  DECLARE
    v_flow_id uuid;
    v_step_count int;
    s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid;
  BEGIN
    SELECT id INTO v_flow_id
      FROM public.bot_flows
     WHERE consultant_id = _consultant_id AND is_active = true
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_flow_id IS NULL THEN
      INSERT INTO public.bot_flows (consultant_id, name, is_active, strict_mode)
      VALUES (_consultant_id, 'Fluxo da Camila', true, false)
      RETURNING id INTO v_flow_id;
    END IF;

    SELECT count(*) INTO v_step_count FROM public.bot_flow_steps WHERE flow_id = v_flow_id;
    IF v_step_count > 0 THEN RETURN v_flow_id; END IF;

    s1 := gen_random_uuid(); s2 := gen_random_uuid(); s3 := gen_random_uuid();
    s4 := gen_random_uuid(); s5 := gen_random_uuid(); s6 := gen_random_uuid();

    INSERT INTO public.bot_flow_steps
      (id, flow_id, position, step_type, step_key, title, summary, icon,
       message_text, slot_key, transitions, is_active)
    VALUES
      (s1, v_flow_id, 1, 'message', 'welcome', 'Boas-vindas', 'Primeira mensagem', 'sparkle',
       'Oi {{nome}}', 'boas_vindas',
       jsonb_build_array(
         jsonb_build_object('trigger_intent','afirmacao','trigger_phrases',jsonb_build_array('sim'),'goto_step_id', s2,'goto_special',null)
       ), true),
      (s2, v_flow_id, 2, 'message', 'qualificacao', 'Qualif', 'Manda video', 'video',
       'Qual a conta?', 'explainer',
       jsonb_build_array(
         jsonb_build_object('trigger_intent','default','trigger_phrases',jsonb_build_array(),'goto_step_id', s2,'goto_special','repeat')
       ), true),
      (s3, v_flow_id, 3, 'message', 'checkin_pos_video', 'Check-in', 'Confere video', 'msg',
       'Que otimo {{nome}}', 'checkin', '[]'::jsonb, true),
      (s4, v_flow_id, 4, 'message', 'pitch_conexao_club', 'Pitch', 'Cashback', 'video',
       'Olha so', 'club', '[]'::jsonb, true),
      (s5, v_flow_id, 5, 'message', 'duvidas_pos_club', 'Duvidas', 'Final', 'msg',
       'Pode perguntar', 'duvidas', '[]'::jsonb, true),
      (s6, v_flow_id, 6, 'message', 'cadastro', 'Cadastro', 'Pedir conta', 'file',
       'Foto da conta', 'cadastro_pedir_conta', '[]'::jsonb, true);

    RETURN v_flow_id;
  END;
  $function$;
`);

// Insert pre-existing rows BEFORE applying the migration (mirrors live dev).
const preExistingConsultantId = "11111111-1111-1111-1111-111111111111";
const { rows: preFlow } = await db.query(
  `INSERT INTO public.bot_flows (consultant_id, name, is_active) VALUES ($1, 'Pre-existing flow', false) RETURNING id;`,
  [preExistingConsultantId]
);
const preFlowId = preFlow[0].id;

await db.query(
  `INSERT INTO public.bot_flow_steps (flow_id, position, step_type, step_key, title)
   VALUES ($1, 1, 'message', 'pre1', 'Pre-existing 1'),
          ($1, 2, 'message', 'pre2', 'Pre-existing 2'),
          ($1, 3, 'message', 'pre3', 'Pre-existing 3'),
          ($1, 4, 'message', 'pre4', 'Pre-existing 4');`,
  [preFlowId]
);

// Capture baseline (before migration).
const baselinePolicies = (await db.query(
  `SELECT polname FROM pg_policy WHERE polrelid='public.bot_flow_steps'::regclass ORDER BY polname;`
)).rows.map((r) => r.polname);
const baselineRowsec = (await db.query(
  `SELECT relrowsecurity FROM pg_class WHERE relname='bot_flow_steps' AND relnamespace='public'::regnamespace;`
)).rows[0].relrowsecurity;
const baselineSeedDef = (await db.query(
  `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='seed_default_camila_flow' AND n.nspname='public';`
)).rows[0].def;
const baselinePreCount = (await db.query(
  `SELECT count(*)::int AS n FROM public.bot_flow_steps WHERE flow_id=$1;`,
  [preFlowId]
)).rows[0].n;

console.log(`  baseline: ${baselinePreCount} pre-existing rows, RLS=${baselineRowsec}, ${baselinePolicies.length} policies\n`);

// 1. Apply the migration.
console.log("Step 1: apply migration 20260601000000_add_layout_to_bot_flow_steps.sql");
const migrationSql = fs.readFileSync(MIGRATION_PATH, "utf-8");
await db.exec(migrationSql);
ok("migration applied without error");

// Idempotency: run it twice to confirm ADD COLUMN IF NOT EXISTS is a no-op.
await db.exec(migrationSql);
ok("migration is idempotent (second run no-op)");

console.log("");

// 2. Run the assertions.

// (a) Column exists as jsonb DEFAULT NULL, nullable.
console.log("Step 2: assertions");
const colInfo = (await db.query(
  `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bot_flow_steps' AND column_name='layout';`
)).rows;
assert(colInfo.length === 1, "(a) layout column exists");
if (colInfo.length === 1) {
  const c = colInfo[0];
  eq(c.data_type, "jsonb", "(a) layout.data_type = jsonb");
  // PG renders DEFAULT NULL as a NULL column_default (i.e. no explicit default
  // clause persisted). This still satisfies "DEFAULT NULL".
  assert(
    c.column_default === null || /^\s*null\s*$/i.test(String(c.column_default)),
    "(a) layout DEFAULT NULL (no explicit default literal)",
    `column_default = ${JSON.stringify(c.column_default)}`
  );
  eq(c.is_nullable, "YES", "(a) layout is nullable");
}

// (b) Pre-existing rows have layout = NULL.
const layoutRows = (await db.query(
  `SELECT count(*)::int AS total, count(layout)::int AS not_null FROM public.bot_flow_steps WHERE flow_id = $1;`,
  [preFlowId]
)).rows[0];
eq(layoutRows.total, baselinePreCount, "(b) pre-existing row count preserved");
eq(layoutRows.not_null, 0, "(b) pre-existing rows have layout = NULL");

// (c) seed_default_camila_flow still works unchanged.
const seedDefAfter = (await db.query(
  `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='seed_default_camila_flow' AND n.nspname='public';`
)).rows[0].def;
assert(
  seedDefAfter === baselineSeedDef,
  "(c) seed_default_camila_flow body byte-identical pre/post migration"
);

const newConsultantId = "22222222-2222-2222-2222-222222222222";
const seedResult = await db.query(
  `SELECT public.seed_default_camila_flow($1) AS flow_id;`,
  [newConsultantId]
);
const seededFlowId = seedResult.rows[0].flow_id;
assert(typeof seededFlowId === "string" && seededFlowId.length > 0, "(c) seed_default_camila_flow returns flow_id");

const seededRows = (await db.query(
  `SELECT count(*)::int AS total, count(layout)::int AS layout_not_null FROM public.bot_flow_steps WHERE flow_id = $1;`,
  [seededFlowId]
)).rows[0];
eq(seededRows.total, 6, "(c) seed_default_camila_flow inserts 6 steps (unchanged behaviour)");
eq(seededRows.layout_not_null, 0, "(c) freshly seeded steps default to layout = NULL");

// Calling seed twice for the same consultant must remain idempotent (R17.3).
const seedAgain = await db.query(
  `SELECT public.seed_default_camila_flow($1) AS flow_id;`,
  [newConsultantId]
);
eq(seedAgain.rows[0].flow_id, seededFlowId, "(c) seed_default_camila_flow remains idempotent (same flow_id on re-call)");
const seededRowsAfter = (await db.query(
  `SELECT count(*)::int AS total FROM public.bot_flow_steps WHERE flow_id = $1;`,
  [seededFlowId]
)).rows[0];
eq(seededRowsAfter.total, 6, "(c) re-call did not insert duplicate steps");

// (d) RLS still enabled and policies unchanged.
const rowsecAfter = (await db.query(
  `SELECT relrowsecurity FROM pg_class WHERE relname='bot_flow_steps' AND relnamespace='public'::regnamespace;`
)).rows[0].relrowsecurity;
assert(rowsecAfter === true, "(d) RLS still enabled on bot_flow_steps");

const policiesAfter = (await db.query(
  `SELECT polname FROM pg_policy WHERE polrelid='public.bot_flow_steps'::regclass ORDER BY polname;`
)).rows.map((r) => r.polname);
eq(policiesAfter, baselinePolicies, "(d) policies on bot_flow_steps unchanged after migration");
eq(
  policiesAfter,
  ["Owner manages own flow steps", "Super admin manages all flow steps"],
  "(d) expected 2 policies still present"
);

// 3. Rollback validation: dropping the column must succeed and leave the
//    rest of the table intact (proves rollback in tasks.md is safe).
console.log("\nStep 3: rollback (ALTER TABLE ... DROP COLUMN layout)");
await db.exec(`ALTER TABLE public.bot_flow_steps DROP COLUMN layout;`);
const colAfterDrop = (await db.query(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bot_flow_steps' AND column_name='layout';`
)).rows;
eq(colAfterDrop.length, 0, "rollback: layout column dropped");
const totalAfterDrop = (await db.query(
  `SELECT count(*)::int AS total FROM public.bot_flow_steps;`
)).rows[0].total;
assert(totalAfterDrop > 0, "rollback: data rows preserved (drop is safe)", `total=${totalAfterDrop}`);
const rowsecAfterDrop = (await db.query(
  `SELECT relrowsecurity FROM pg_class WHERE relname='bot_flow_steps' AND relnamespace='public'::regnamespace;`
)).rows[0].relrowsecurity;
assert(rowsecAfterDrop === true, "rollback: RLS still enabled");

// Re-apply migration after rollback to confirm cycle is repeatable.
await db.exec(migrationSql);
const colAfterReapply = (await db.query(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bot_flow_steps' AND column_name='layout';`
)).rows;
eq(colAfterReapply.length, 1, "rollback + re-apply cycle is repeatable");

console.log("\n== validation complete ==");
if (process.exitCode === 1) {
  console.error("\nVALIDATION FAILED");
} else {
  console.log("\nALL ASSERTIONS PASSED");
}

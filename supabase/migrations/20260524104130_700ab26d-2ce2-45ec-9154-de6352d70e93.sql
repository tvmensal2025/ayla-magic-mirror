
-- ─── rollout_audit ──────────────────────────────────────────────
create table if not exists public.rollout_audit (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references public.consultants(id) on delete cascade,
  flag_kind text not null,
  from_state text,
  to_state text not null,
  reason text,
  metrics_snapshot jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rollout_audit_consultant_idx on public.rollout_audit (consultant_id, created_at desc);
alter table public.rollout_audit enable row level security;
drop policy if exists "rollout_audit super_admin read" on public.rollout_audit;
create policy "rollout_audit super_admin read"
  on public.rollout_audit for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

-- ─── rollout_alerts ─────────────────────────────────────────────
create table if not exists public.rollout_alerts (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid references public.consultants(id) on delete cascade,
  level text not null default 'warning',
  title text not null,
  body text not null,
  acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists rollout_alerts_open_idx on public.rollout_alerts (acknowledged, created_at desc);
alter table public.rollout_alerts enable row level security;
drop policy if exists "rollout_alerts super_admin read" on public.rollout_alerts;
create policy "rollout_alerts super_admin read"
  on public.rollout_alerts for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));
drop policy if exists "rollout_alerts super_admin update" on public.rollout_alerts;
create policy "rollout_alerts super_admin update"
  on public.rollout_alerts for update to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- ─── rollout_config (singleton) ─────────────────────────────────
create table if not exists public.rollout_config (
  id boolean primary key default true,
  autopilot_enabled boolean not null default true,
  alert_consultant_id uuid references public.consultants(id),
  canary_percent int not null default 5,
  dark_min_hours int not null default 48,
  canary_min_hours int not null default 168,
  green_max_paused_ratio numeric not null default 0.20,
  green_max_delegated_ratio numeric not null default 0.20,
  green_min_turns_24h int not null default 20,
  notes text,
  updated_at timestamptz not null default now(),
  constraint rollout_config_singleton check (id = true)
);
alter table public.rollout_config enable row level security;
drop policy if exists "rollout_config super_admin read" on public.rollout_config;
create policy "rollout_config super_admin read"
  on public.rollout_config for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));
drop policy if exists "rollout_config super_admin write" on public.rollout_config;
create policy "rollout_config super_admin write"
  on public.rollout_config for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

insert into public.rollout_config (id, alert_consultant_id)
values (true, '0c2711ad-4836-41e6-afba-edd94f698ae3')
on conflict (id) do update set alert_consultant_id = coalesce(public.rollout_config.alert_consultant_id, excluded.alert_consultant_id);

-- ─── pg_cron schedule ───────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamentos antigos com o mesmo nome
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'flow-engine-rollout-tick' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'flow-engine-rollout-tick',
  '0 */6 * * *',
  $cron$
  select net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/flow-engine-rollout-cron',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo'
    ),
    body := jsonb_build_object('source','pg_cron','at', now())
  );
  $cron$
);

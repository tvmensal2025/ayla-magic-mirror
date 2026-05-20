
-- Captação manual: modo, scoreboard, conquistas, eventos de campo
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS capture_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS capture_started_at timestamptz;

CREATE TABLE IF NOT EXISTS public.capture_scoreboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  registrations integer NOT NULL DEFAULT 0,
  avg_minutes numeric NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultant_id, date)
);

CREATE TABLE IF NOT EXISTS public.capture_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (consultant_id, badge_key)
);

CREATE TABLE IF NOT EXISTS public.capture_field_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  field text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_capture_field_events_consultant_date
  ON public.capture_field_events (consultant_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_capture_field_events_customer
  ON public.capture_field_events (customer_id);

ALTER TABLE public.capture_scoreboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_field_events ENABLE ROW LEVEL SECURITY;

-- Scoreboard: dono lê/escreve; gestor lê via can_view_consultant; super admin tudo
CREATE POLICY "Owner manages own scoreboard" ON public.capture_scoreboard
  FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "Manager reads scoreboard" ON public.capture_scoreboard
  FOR SELECT TO authenticated
  USING (can_view_consultant(auth.uid(), consultant_id));
CREATE POLICY "Super admin manages scoreboard" ON public.capture_scoreboard
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Owner manages own achievements" ON public.capture_achievements
  FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "Manager reads achievements" ON public.capture_achievements
  FOR SELECT TO authenticated
  USING (can_view_consultant(auth.uid(), consultant_id));
CREATE POLICY "Super admin manages achievements" ON public.capture_achievements
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Owner manages own field events" ON public.capture_field_events
  FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "Manager reads field events" ON public.capture_field_events
  FOR SELECT TO authenticated
  USING (can_view_consultant(auth.uid(), consultant_id));
CREATE POLICY "Super admin manages field events" ON public.capture_field_events
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_customers_capture_mode
  ON public.customers (consultant_id, capture_mode)
  WHERE capture_mode = 'manual';

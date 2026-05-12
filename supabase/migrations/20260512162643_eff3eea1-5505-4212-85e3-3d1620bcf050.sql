
-- 1) customers: pausa do bot
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bot_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_paused_reason text,
  ADD COLUMN IF NOT EXISTS bot_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_human_id uuid;

CREATE INDEX IF NOT EXISTS idx_customers_bot_paused ON public.customers(bot_paused) WHERE bot_paused = true;

-- 2) ai_media_library
CREATE TABLE IF NOT EXISTS public.ai_media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('audio','video','image','document','text')),
  label text NOT NULL,
  step_tags text[] NOT NULL DEFAULT '{}',
  intent_tags text[] NOT NULL DEFAULT '{}',
  url text,
  storage_path text,
  transcript text,
  text_content text,
  duration_sec int,
  priority int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_media_library_consultant ON public.ai_media_library(consultant_id);
CREATE INDEX IF NOT EXISTS idx_ai_media_library_step_tags ON public.ai_media_library USING GIN (step_tags);

ALTER TABLE public.ai_media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own ai media"
  ON public.ai_media_library FOR ALL
  TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all ai media"
  ON public.ai_media_library FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_ai_media_library_updated_at
  BEFORE UPDATE ON public.ai_media_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) ai_agent_config
CREATE TABLE IF NOT EXISTS public.ai_agent_config (
  consultant_id uuid PRIMARY KEY,
  persona_name text NOT NULL DEFAULT 'Camila',
  tone text NOT NULL DEFAULT 'humano, breve, cordial, sem soar robótico',
  system_prompt text,
  step_prompts jsonb NOT NULL DEFAULT '{}'::jsonb,
  handoff_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  typing_min_ms int NOT NULL DEFAULT 1200,
  typing_max_ms int NOT NULL DEFAULT 3500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own agent config"
  ON public.ai_agent_config FOR ALL
  TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Admins read all agent config"
  ON public.ai_agent_config FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_ai_agent_config_updated_at
  BEFORE UPDATE ON public.ai_agent_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) ai_agent_logs
CREATE TABLE IF NOT EXISTS public.ai_agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  customer_id uuid,
  phone text,
  step_before text,
  step_after text,
  user_input text,
  user_input_kind text,
  llm_output jsonb,
  media_sent_id uuid,
  handoff boolean NOT NULL DEFAULT false,
  handoff_reason text,
  latency_ms int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_consultant ON public.ai_agent_logs(consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_customer ON public.ai_agent_logs(customer_id, created_at DESC);

ALTER TABLE public.ai_agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own agent logs"
  ON public.ai_agent_logs FOR SELECT
  TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Admins read all agent logs"
  ON public.ai_agent_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

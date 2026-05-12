
-- 1. Create stage_auto_messages table
CREATE TABLE public.stage_auto_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage_id UUID NOT NULL REFERENCES public.kanban_stages(id) ON DELETE CASCADE,
  consultant_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  message_type TEXT NOT NULL DEFAULT 'text',
  message_text TEXT,
  media_url TEXT,
  image_url TEXT,
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.stage_auto_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stage auto messages"
  ON public.stage_auto_messages
  FOR ALL
  TO authenticated
  USING (consultant_id = (auth.uid())::text)
  WITH CHECK (consultant_id = (auth.uid())::text);

-- 3. rejected_at on crm_deals
ALTER TABLE public.crm_deals ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

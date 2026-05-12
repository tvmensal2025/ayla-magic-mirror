
-- ai_media_library: pública vs privada
ALTER TABLE public.ai_media_library 
  ALTER COLUMN consultant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_media_library_public 
  ON public.ai_media_library (is_public) WHERE is_public = true;

DROP POLICY IF EXISTS "Authenticated read public ai media" ON public.ai_media_library;
CREATE POLICY "Authenticated read public ai media"
  ON public.ai_media_library FOR SELECT TO authenticated USING (is_public = true);

DROP POLICY IF EXISTS "Super admin manages public ai media" ON public.ai_media_library;
CREATE POLICY "Super admin manages public ai media"
  ON public.ai_media_library FOR ALL TO authenticated
  USING (is_public = true AND is_super_admin(auth.uid()))
  WITH CHECK (is_public = true AND is_super_admin(auth.uid()));

-- ai_agent_config: trocar PK consultant_id por id surrogate
ALTER TABLE public.ai_agent_config DROP CONSTRAINT IF EXISTS ai_agent_config_pkey;
ALTER TABLE public.ai_agent_config ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.ai_agent_config ADD CONSTRAINT ai_agent_config_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_config ALTER COLUMN consultant_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_config_consultant 
  ON public.ai_agent_config (consultant_id) WHERE consultant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_config_global 
  ON public.ai_agent_config ((1)) WHERE consultant_id IS NULL;

DROP POLICY IF EXISTS "Authenticated read global agent config" ON public.ai_agent_config;
CREATE POLICY "Authenticated read global agent config"
  ON public.ai_agent_config FOR SELECT TO authenticated USING (consultant_id IS NULL);

DROP POLICY IF EXISTS "Super admin manages global agent config" ON public.ai_agent_config;
CREATE POLICY "Super admin manages global agent config"
  ON public.ai_agent_config FOR ALL TO authenticated
  USING (consultant_id IS NULL AND is_super_admin(auth.uid()))
  WITH CHECK (consultant_id IS NULL AND is_super_admin(auth.uid()));

-- Seed config global "Camila"
INSERT INTO public.ai_agent_config (consultant_id, persona_name, tone, system_prompt, enabled)
SELECT NULL, 'Camila', 'humano, breve, cordial, brasileira, sem soar robótico',
'Você é Camila, atendente humana da iGreen Energy. NUNCA diga que é uma IA ou bot. Responda curto, como WhatsApp real. Use áudios sempre que disponíveis. Siga rigorosamente o passo da conversa. Se o cliente pedir falar com humano ou houver objeção forte, faça handoff.',
true
WHERE NOT EXISTS (SELECT 1 FROM public.ai_agent_config WHERE consultant_id IS NULL);

-- Bucket áudios/vídeos do agente
INSERT INTO storage.buckets (id, name, public) VALUES ('ai-agent-media', 'ai-agent-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read ai-agent-media" ON storage.objects;
CREATE POLICY "Public read ai-agent-media" ON storage.objects FOR SELECT
  USING (bucket_id = 'ai-agent-media');

DROP POLICY IF EXISTS "Auth upload ai-agent-media" ON storage.objects;
CREATE POLICY "Auth upload ai-agent-media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ai-agent-media');

DROP POLICY IF EXISTS "Owner update ai-agent-media" ON storage.objects;
CREATE POLICY "Owner update ai-agent-media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ai-agent-media' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_super_admin(auth.uid())));

DROP POLICY IF EXISTS "Owner delete ai-agent-media" ON storage.objects;
CREATE POLICY "Owner delete ai-agent-media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ai-agent-media' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_super_admin(auth.uid())));

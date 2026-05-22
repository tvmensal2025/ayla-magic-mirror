
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.voice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  name text NOT NULL,
  shortcut text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX voice_templates_shortcut_uniq ON public.voice_templates(consultant_id, lower(shortcut)) WHERE shortcut IS NOT NULL;
CREATE INDEX voice_templates_consultant_idx ON public.voice_templates(consultant_id);
ALTER TABLE public.voice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_templates_select_own" ON public.voice_templates FOR SELECT USING (consultant_id = auth.uid());
CREATE POLICY "voice_templates_insert_own" ON public.voice_templates FOR INSERT WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "voice_templates_update_own" ON public.voice_templates FOR UPDATE USING (consultant_id = auth.uid()) WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "voice_templates_delete_own" ON public.voice_templates FOR DELETE USING (consultant_id = auth.uid());

CREATE TABLE public.voice_template_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.voice_templates(id) ON DELETE CASCADE,
  position int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fixed_audio','name_slot','variable_slot')),
  audio_url text,
  variable_key text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_template_blocks_template_idx ON public.voice_template_blocks(template_id, position);
ALTER TABLE public.voice_template_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_template_blocks_select_own" ON public.voice_template_blocks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()));
CREATE POLICY "voice_template_blocks_insert_own" ON public.voice_template_blocks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()));
CREATE POLICY "voice_template_blocks_update_own" ON public.voice_template_blocks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()));
CREATE POLICY "voice_template_blocks_delete_own" ON public.voice_template_blocks FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()));

CREATE TABLE public.voice_name_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  name_normalized text NOT NULL,
  name_display text NOT NULL,
  audio_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX voice_name_clips_consultant_name_uniq ON public.voice_name_clips(consultant_id, name_normalized);
CREATE INDEX voice_name_clips_consultant_idx ON public.voice_name_clips(consultant_id);
ALTER TABLE public.voice_name_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_name_clips_select_own" ON public.voice_name_clips FOR SELECT USING (consultant_id = auth.uid());
CREATE POLICY "voice_name_clips_insert_own" ON public.voice_name_clips FOR INSERT WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "voice_name_clips_update_own" ON public.voice_name_clips FOR UPDATE USING (consultant_id = auth.uid()) WITH CHECK (consultant_id = auth.uid());
CREATE POLICY "voice_name_clips_delete_own" ON public.voice_name_clips FOR DELETE USING (consultant_id = auth.uid());

CREATE TABLE public.voice_template_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.voice_templates(id) ON DELETE CASCADE,
  name_normalized text NOT NULL,
  final_audio_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX voice_template_renders_uniq ON public.voice_template_renders(template_id, name_normalized);
ALTER TABLE public.voice_template_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_template_renders_select_own" ON public.voice_template_renders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()));
CREATE POLICY "voice_template_renders_insert_own" ON public.voice_template_renders FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()));
CREATE POLICY "voice_template_renders_delete_own" ON public.voice_template_renders FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.voice_templates t WHERE t.id = template_id AND t.consultant_id = auth.uid()));

CREATE TRIGGER voice_templates_set_updated_at BEFORE UPDATE ON public.voice_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER voice_name_clips_set_updated_at BEFORE UPDATE ON public.voice_name_clips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Public read audio templates"
ON public.message_templates
FOR SELECT
TO anon
USING (media_type = 'audio' AND media_url IS NOT NULL);
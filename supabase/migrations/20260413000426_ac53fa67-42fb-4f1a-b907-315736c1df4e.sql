
-- Add connected_phone column to whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN connected_phone text;

-- Allow public read of whatsapp_instances (only connected_phone is needed publicly)
CREATE POLICY "Public read connected phone"
ON public.whatsapp_instances
FOR SELECT
TO anon
USING (true);

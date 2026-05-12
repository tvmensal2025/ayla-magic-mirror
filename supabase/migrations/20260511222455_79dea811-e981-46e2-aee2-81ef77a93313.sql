ALTER TABLE public.facebook_connections
  ADD COLUMN IF NOT EXISTS whatsapp_destination_number text;

UPDATE public.facebook_connections
   SET whatsapp_destination_number = '5511971254913'
 WHERE whatsapp_destination_number IS NULL;
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS media_message_id text,
  ADD COLUMN IF NOT EXISTS bill_message_id text,
  ADD COLUMN IF NOT EXISTS bill_base64 text,
  ADD COLUMN IF NOT EXISTS media_storage text DEFAULT 'minio';

COMMENT ON COLUMN public.customers.media_message_id IS 'Evolution API message ID do documento (frente). Usado como fallback se MinIO falhar.';
COMMENT ON COLUMN public.customers.bill_message_id IS 'Evolution API message ID da conta de luz. Usado como fallback se MinIO falhar.';
COMMENT ON COLUMN public.customers.bill_base64 IS 'Base64 da conta de luz quando MinIO está offline (fallback temporário).';
COMMENT ON COLUMN public.customers.media_storage IS 'Onde a mídia está: minio | inline | evolution';
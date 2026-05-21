alter table public.customers
  add column if not exists last_inbound_media_url text,
  add column if not exists last_inbound_media_mime text,
  add column if not exists last_inbound_media_kind text,
  add column if not exists last_inbound_media_message_id text,
  add column if not exists last_inbound_media_at timestamptz;
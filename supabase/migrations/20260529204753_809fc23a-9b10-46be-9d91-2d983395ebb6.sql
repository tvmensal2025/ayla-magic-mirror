
UPDATE public.settings
   SET value = 'https://igreen-portal-worker-2.d9v63q.easypanel.host'
 WHERE key = 'portal2_worker_url';

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS portal_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portal_last_retry_at timestamptz;

UPDATE public.customers
   SET status = 'data_complete',
       error_message = NULL,
       portal_retry_count = 0
 WHERE id = '482c0262-e5e0-4716-82f1-f3f4528b2e79';

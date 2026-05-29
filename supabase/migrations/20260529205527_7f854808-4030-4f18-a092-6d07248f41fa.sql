
UPDATE public.customers
   SET status = 'data_complete',
       conversation_step = 'data_complete',
       error_message = NULL,
       portal_retry_count = 0,
       finalized_at = NULL
 WHERE id = '482c0262-e5e0-4716-82f1-f3f4528b2e79';

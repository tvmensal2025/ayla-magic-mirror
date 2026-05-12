UPDATE public.customers
SET status = 'pending',
    conversation_step = 'ask_finalizar',
    error_message = NULL,
    portal_submitted_at = NULL
WHERE id = '4586e30b-f0fa-4ac7-a5e3-c4056496a7ba';
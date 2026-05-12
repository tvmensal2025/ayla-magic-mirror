-- Desbloqueia Judite Pereira: reseta status, limpa rescue counters e reenvia o prompt do email correto.
UPDATE public.customers
SET status = 'pending',
    error_message = NULL,
    rescue_attempts = 0,
    last_rescue_at = NULL,
    conversation_step = 'ask_email'
WHERE id = '78ba50f3-9232-4478-bbeb-3320e5b7a0cb';
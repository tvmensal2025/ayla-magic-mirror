UPDATE public.customers
SET conversation_step = NULL,
    capture_mode = 'auto',
    custom_step_retries = 0,
    custom_step_retries_step = NULL,
    last_custom_prompt_at = NULL,
    ai_followups_count = 0,
    previous_conversation_step = conversation_step,
    updated_at = now()
WHERE id = '55d3c89f-2557-4864-988d-91ee48e643f8';
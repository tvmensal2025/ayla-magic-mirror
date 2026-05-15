ALTER TABLE public.bot_flow_steps DROP CONSTRAINT IF EXISTS bot_flow_steps_step_type_check;
ALTER TABLE public.bot_flow_steps ADD CONSTRAINT bot_flow_steps_step_type_check
  CHECK (step_type = ANY (ARRAY[
    'audio_slot'::text,
    'message'::text,
    'question'::text,
    'media_request'::text,
    'cadastro'::text,
    'capture_conta'::text,
    'capture_documento'::text,
    'capture_email'::text,
    'confirm_phone'::text,
    'finalizar_cadastro'::text
  ]));
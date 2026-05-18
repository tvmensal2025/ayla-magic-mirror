update public.customers
set
  name = 'APARECIDO DONIZETE DE OLIVEIRA',
  name_source = 'user_confirmed',
  link_facial = null,
  link_assinatura = null,
  facial_link_sent_at = null,
  facial_confirmed_at = null,
  conversation_step = 'aguardando_otp',
  status = 'awaiting_otp',
  error_message = null,
  otp_code = '732320',
  otp_received_at = now(),
  updated_at = now()
where id = 'e894eb36-a843-4f15-afcb-2babb6f4e2b6';
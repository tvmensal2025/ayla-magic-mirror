-- 1) Adicionar nova coluna para marcar telefone confirmado pelo cliente
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_contact_confirmed boolean NOT NULL DEFAULT false;

-- 2) Atualizar a constraint de status para incluir os novos estados
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_status_check CHECK (
  status = ANY (ARRAY[
    'pending'::text,
    'data_complete'::text,
    'registered_igreen'::text,
    'contract_sent'::text,
    'approved'::text,
    'rejected'::text,
    'lead'::text,
    'awaiting_signature'::text,
    'devolutiva'::text,
    'portal_submitting'::text,
    'awaiting_otp'::text,
    'validating_otp'::text,
    'automation_failed'::text,
    'complete'::text,
    'abandoned'::text,
    'cadastro_concluido'::text,
    -- novos estados de "lead travado" precisando atenção manual
    'stuck_finalizar'::text,
    'stuck_contact'::text,
    'email_pendente_revisao'::text,
    'contato_incompleto'::text
  ])
);
ALTER TABLE public.consultants ADD COLUMN IF NOT EXISTS conversational_flow_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.customers   ADD COLUMN IF NOT EXISTS conversational_flow_enabled boolean;
COMMENT ON COLUMN public.consultants.conversational_flow_enabled IS 'Feature flag: roteia mensagens pós-cadastro pelo novo motor conversacional (state machine + intent classifier).';
COMMENT ON COLUMN public.customers.conversational_flow_enabled   IS 'Override por cliente do flag do consultor. NULL = herda do consultor.';
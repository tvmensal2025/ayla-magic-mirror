ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS resolver_strict_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_settings.resolver_strict_mode IS
  'F2 — quando true, o bot-flow resolver NÃO reseta para aguardando_conta quando custom step não tem mapeamento; mantém step atual e loga warn.';
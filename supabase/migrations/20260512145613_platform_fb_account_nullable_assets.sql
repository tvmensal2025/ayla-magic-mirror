-- Permite salvar a conta Facebook da plataforma logo após o OAuth, antes do super
-- admin escolher qual ad_account/page usar (quando há mais de uma disponível).
ALTER TABLE public.platform_facebook_account ALTER COLUMN ad_account_id DROP NOT NULL;
ALTER TABLE public.platform_facebook_account ALTER COLUMN page_id DROP NOT NULL;

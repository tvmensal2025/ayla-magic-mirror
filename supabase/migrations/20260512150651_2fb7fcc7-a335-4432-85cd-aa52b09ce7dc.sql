ALTER TABLE public.platform_facebook_account
  ALTER COLUMN ad_account_id DROP NOT NULL,
  ALTER COLUMN page_id DROP NOT NULL;
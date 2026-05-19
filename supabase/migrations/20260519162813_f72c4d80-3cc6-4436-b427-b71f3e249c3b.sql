DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.settings'::regclass
      AND conname = 'settings_key_unique'
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_key_unique UNIQUE (key);
  END IF;
END $$;
ALTER TABLE public.network_members
  ADD COLUMN IF NOT EXISTS graduacao text,
  ADD COLUMN IF NOT EXISTS graduacao_expansao text,
  ADD COLUMN IF NOT EXISTS data_nascimento text,
  ADD COLUMN IF NOT EXISTS gp_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gi_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonificavel numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS green_points numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gp_mes numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gi_mes numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS green_points_mes numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diretos_ativos integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pro text;
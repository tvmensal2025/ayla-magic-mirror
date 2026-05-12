CREATE TABLE public.network_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL,
  igreen_id integer NOT NULL,
  name text NOT NULL,
  phone text,
  sponsor_id integer,
  nivel integer DEFAULT 0,
  data_ativo text,
  cidade text,
  uf text,
  clientes_ativos integer DEFAULT 0,
  gp numeric DEFAULT 0,
  gi numeric DEFAULT 0,
  qtde_diretos integer DEFAULT 0,
  inicio_rapido text,
  diretos_inicio_rapido integer DEFAULT 0,
  diretos_mes integer DEFAULT 0,
  total_pontos numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(consultant_id, igreen_id)
);

ALTER TABLE public.network_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read network" ON public.network_members
  FOR SELECT TO authenticated
  USING (consultant_id = auth.uid());

CREATE POLICY "Service upsert network" ON public.network_members
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);
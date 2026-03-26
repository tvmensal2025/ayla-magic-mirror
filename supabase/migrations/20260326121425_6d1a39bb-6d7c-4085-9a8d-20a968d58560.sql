
CREATE TABLE public.consultants (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  license text UNIQUE NOT NULL,
  phone text NOT NULL,
  cadastro_url text NOT NULL,
  photo_url text,
  igreen_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.consultants FOR SELECT USING (true);
CREATE POLICY "Owner update" ON public.consultants FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Owner insert" ON public.consultants FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

INSERT INTO storage.buckets (id, name, public) VALUES ('consultant-photos', 'consultant-photos', true);

CREATE POLICY "Public read photos" ON storage.objects FOR SELECT USING (bucket_id = 'consultant-photos');
CREATE POLICY "Auth upload photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'consultant-photos');
CREATE POLICY "Owner update photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'consultant-photos');
CREATE POLICY "Owner delete photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'consultant-photos');

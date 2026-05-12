
-- Atualizar "Cadastro aprovado" com novas mídias do Supabase Storage
UPDATE public.message_templates
SET media_url = 'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/da519d24-9f7d-4925-b0e0-6db3bc82501b-1775039682227.ogg',
    media_type = 'audio',
    image_url = 'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/d216a66e-5d14-4351-b779-4ab67542903a-1775039694345.jpg'
WHERE id = '5650477b-c14e-4a7d-9141-57590b8657f9';

-- Atualizar "Cadastrado reprovado" com novas mídias
UPDATE public.message_templates
SET media_url = 'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/3fda5c66-fc5d-4ce7-ad04-84ee884c04b4-1775039729243.ogg',
    media_type = 'audio',
    image_url = 'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/ea601b57-14a3-4ff4-8cd1-e5f335ac45eb-1775039718803.jpg'
WHERE id = 'dcc15feb-7a0a-42e3-ac2a-bf3438153e55';

-- Criar template "30 Dias"
INSERT INTO public.message_templates (consultant_id, name, content, media_url, media_type, image_url)
VALUES (
  '0c2711ad-4836-41e6-afba-edd94f698ae3',
  '30 Dias',
  'Mensagem de 30 dias',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/18e096f2-014d-4a4e-adb8-233f654becac-1775039755723.ogg',
  'audio',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/dbb0498e-c1ea-4416-9d1a-1fdf111c1dd5-1775039746890.jpg'
);

-- Criar template "60 Dias"
INSERT INTO public.message_templates (consultant_id, name, content, media_url, media_type, image_url)
VALUES (
  '0c2711ad-4836-41e6-afba-edd94f698ae3',
  '60 Dias',
  'Mensagem de 60 dias',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/dff62f30-5eee-4e30-92b2-927f4f1c8ef6-1775039767695.ogg',
  'audio',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/98027fea-340b-4e8a-ad0e-92c85d765651-1775039775315.jpg'
);

-- Criar template "90 Dias"
INSERT INTO public.message_templates (consultant_id, name, content, media_url, media_type, image_url)
VALUES (
  '0c2711ad-4836-41e6-afba-edd94f698ae3',
  '90 Dias',
  'Mensagem de 90 dias',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/ee837361-76a2-48d0-88d3-d49d3fddf916-1775039813769.ogg',
  'audio',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/37ed4d27-d30a-4105-8c65-7b86ea3dc0c2-1775039825057.jpg'
);

-- Criar template "120 Dias"
INSERT INTO public.message_templates (consultant_id, name, content, media_url, media_type, image_url)
VALUES (
  '0c2711ad-4836-41e6-afba-edd94f698ae3',
  '120 Dias',
  'Mensagem de 120 dias',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/87124273-e34f-4dce-b71a-e2e2b550cf6a-1775039859817.ogg',
  'audio',
  'https://zlzasfhcxcznaprrragl.supabase.co/storage/v1/object/public/whatsapp-media/edda79a0-9497-4c94-99c4-6dfa7a2f7338-1775039849700.jpg'
);

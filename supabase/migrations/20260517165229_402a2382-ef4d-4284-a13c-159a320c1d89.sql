-- Revert: Nome do cliente deve ser o primeiro passo (pode ser pulado se já tiver nome)
-- Boas Vindas vem em seguida
UPDATE public.bot_flow_steps SET position = 9999
  WHERE id = '6226f6f3-e655-4cc9-af20-d8c28c998160';
UPDATE public.bot_flow_steps SET position = 2
  WHERE id = '33be68c1-44b6-4de1-8a1c-aa3758c4cdfa';
UPDATE public.bot_flow_steps SET position = 3
  WHERE id = '6226f6f3-e655-4cc9-af20-d8c28c998160';
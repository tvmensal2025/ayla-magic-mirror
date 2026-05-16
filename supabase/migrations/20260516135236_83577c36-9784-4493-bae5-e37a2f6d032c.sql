UPDATE public.ai_media_library
SET url = CASE
    WHEN id = 'bb478335-3c0c-4ac0-b9ae-99d240a85541' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/personal_como_funciona_1778939286726.ogg'
    WHEN slot_key = 'boas_vindas' OR url ILIKE '%boas_vindas.webm%' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/boas_vindas_1778939275257.ogg'
    WHEN slot_key = 'fazenda_solar' AND url ILIKE '%como_funciona.webm%' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/como_funciona_1778939276859.ogg'
    WHEN slot_key = 'como_funciona' OR url ILIKE '%como_funciona.webm%' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/como_funciona_1778939276859.ogg'
    WHEN slot_key = 'fazenda_solar' OR url ILIKE '%fazenda_solar.webm%' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/fazenda_solar_1778939279397.ogg'
    WHEN slot_key = 'objecao_preco' OR url ILIKE '%objecao_preco.webm%' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/objecao_preco_1778939281327.ogg'
    WHEN slot_key = 'objecao_distribuidora' OR url ILIKE '%objecao_distribuidora.webm%' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/objecao_distribuidora_1778939283327.ogg'
    WHEN slot_key = 'prova_social' OR url ILIKE '%prova_social.webm%' THEN 'https://igreen-minio.d9v63q.easypanel.host/igreen/public/media/prova_social_1778939285151.ogg'
    ELSE url
  END,
  storage_path = CASE
    WHEN id = 'bb478335-3c0c-4ac0-b9ae-99d240a85541' THEN 'public/media/personal_como_funciona_1778939286726.ogg'
    WHEN slot_key = 'boas_vindas' OR url ILIKE '%boas_vindas.webm%' THEN 'public/media/boas_vindas_1778939275257.ogg'
    WHEN slot_key = 'fazenda_solar' AND url ILIKE '%como_funciona.webm%' THEN 'public/media/como_funciona_1778939276859.ogg'
    WHEN slot_key = 'como_funciona' OR url ILIKE '%como_funciona.webm%' THEN 'public/media/como_funciona_1778939276859.ogg'
    WHEN slot_key = 'fazenda_solar' OR url ILIKE '%fazenda_solar.webm%' THEN 'public/media/fazenda_solar_1778939279397.ogg'
    WHEN slot_key = 'objecao_preco' OR url ILIKE '%objecao_preco.webm%' THEN 'public/media/objecao_preco_1778939281327.ogg'
    WHEN slot_key = 'objecao_distribuidora' OR url ILIKE '%objecao_distribuidora.webm%' THEN 'public/media/objecao_distribuidora_1778939283327.ogg'
    WHEN slot_key = 'prova_social' OR url ILIKE '%prova_social.webm%' THEN 'public/media/prova_social_1778939285151.ogg'
    ELSE storage_path
  END,
  active = true,
  updated_at = now()
WHERE kind = 'audio'
  AND url ILIKE '%.webm%';
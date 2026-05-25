-- Variante D: trocar fallback de captura para retry seguro (não avança sem dado válido)
UPDATE public.bot_flow_steps
SET fallback = jsonb_build_object(
  'mode', 'retry',
  'max_retries', 2,
  'then', 'humano',
  'retry_text', '😕 Não consegui ler sua *conta de luz*. Pode tirar outra foto?\n\n📸 Dicas:\n• Fatura *inteira* visível\n• Boa *iluminação*, sem reflexo\n• Sem cortar as bordas'
)
WHERE flow_id = '320bf22c-e383-4f53-a3c0-b88b89b02558'
  AND step_key = 'd_pedir_conta';

UPDATE public.bot_flow_steps
SET fallback = jsonb_build_object(
  'mode', 'retry',
  'max_retries', 2,
  'then', 'humano',
  'retry_text', '😕 Não consegui identificar seu *documento*. Pode mandar de novo?\n\n🪪 *RG* (frente e verso) ou *CNH* (frente)\n📸 Foto *nítida*, sem cortes, com boa luz'
)
WHERE flow_id = '320bf22c-e383-4f53-a3c0-b88b89b02558'
  AND step_key = 'd_pedir_documento';
-- Add 5 intermediate stages between novo_lead and aprovado for every consultant.
-- Reorders existing stages: aprovado=6, reprovado=7, 30=8, 60=9, 90=10, 120=11.

-- 1) Shift existing positions to make room (only stages we know).
UPDATE public.kanban_stages SET position = 11 WHERE stage_key = '120_dias';
UPDATE public.kanban_stages SET position = 10 WHERE stage_key = '90_dias';
UPDATE public.kanban_stages SET position = 9  WHERE stage_key = '60_dias';
UPDATE public.kanban_stages SET position = 8  WHERE stage_key = '30_dias';
UPDATE public.kanban_stages SET position = 7  WHERE stage_key = 'reprovado';
UPDATE public.kanban_stages SET position = 6  WHERE stage_key = 'aprovado';
UPDATE public.kanban_stages SET position = 0  WHERE stage_key = 'novo_lead';

-- 2) Insert the 5 new intermediate stages for every consultant that does NOT already have them.
INSERT INTO public.kanban_stages (consultant_id, stage_key, label, color, position, auto_message_enabled, auto_message_type)
SELECT DISTINCT ks.consultant_id, v.stage_key, v.label, v.color, v.position, false, 'text'
FROM public.kanban_stages ks
CROSS JOIN (VALUES
  ('qualificando',  'Em qualificação',     'bg-indigo-500/20 text-indigo-400', 1),
  ('valor_conta',   'Valor da conta',      'bg-teal-500/20 text-teal-400',     2),
  ('conta_enviada', 'Conta enviada',       'bg-cyan-500/20 text-cyan-400',     3),
  ('doc_enviado',   'Documento enviado',   'bg-blue-500/20 text-blue-400',     4),
  ('finalizando',   'Finalizando cadastro','bg-pink-500/20 text-pink-400',     5)
) AS v(stage_key, label, color, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_stages ks2
  WHERE ks2.consultant_id = ks.consultant_id AND ks2.stage_key = v.stage_key
);
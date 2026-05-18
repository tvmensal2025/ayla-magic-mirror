
ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_consultant_slot_key;

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_slot_check;

ALTER TABLE public.whatsapp_instances
  DROP COLUMN IF EXISTS slot;

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_consultant_id_key;

ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_consultant_id_key UNIQUE (consultant_id);

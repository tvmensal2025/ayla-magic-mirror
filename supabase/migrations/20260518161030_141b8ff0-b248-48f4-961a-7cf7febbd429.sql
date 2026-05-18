
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS slot smallint NOT NULL DEFAULT 1;

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_consultant_id_key;

ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_consultant_slot_key UNIQUE (consultant_id, slot);

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_slot_check;
ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_slot_check CHECK (slot IN (1, 2));

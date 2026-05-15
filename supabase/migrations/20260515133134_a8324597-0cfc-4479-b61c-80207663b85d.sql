
ALTER TABLE public.bot_flow_steps
  ADD COLUMN IF NOT EXISTS transitions_backup_pre_v2 jsonb;

-- Backup uma vez só
UPDATE public.bot_flow_steps
SET transitions_backup_pre_v2 = transitions
WHERE transitions_backup_pre_v2 IS NULL;

-- Converte transições "default" em fallback
DO $$
DECLARE
  r record;
  def jsonb;
  new_trans jsonb;
  new_fb jsonb;
BEGIN
  FOR r IN
    SELECT id, transitions, fallback
    FROM public.bot_flow_steps
    WHERE jsonb_typeof(transitions) = 'array'
  LOOP
    SELECT t INTO def
    FROM jsonb_array_elements(r.transitions) t
    WHERE t->>'trigger_intent' = 'default'
    LIMIT 1;

    IF def IS NULL THEN
      CONTINUE;
    END IF;

    new_trans := COALESCE(
      (SELECT jsonb_agg(t) FROM jsonb_array_elements(r.transitions) t WHERE t->>'trigger_intent' <> 'default'),
      '[]'::jsonb
    );

    IF def->>'goto_step_id' IS NOT NULL THEN
      new_fb := jsonb_build_object('mode','goto','goto_step_id', def->>'goto_step_id');
    ELSE
      new_fb := jsonb_build_object('mode','repeat');
    END IF;

    UPDATE public.bot_flow_steps
    SET transitions = new_trans,
        fallback = CASE
          WHEN r.fallback IS NULL OR r.fallback = '{"mode": "repeat"}'::jsonb OR r.fallback = '{}'::jsonb
            THEN new_fb
          ELSE r.fallback
        END
    WHERE id = r.id;
  END LOOP;
END $$;

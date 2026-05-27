-- Feature: flow-business-hours
--
-- 1) Adiciona colunas em `bot_flow_steps` para controle de horário/dia.
-- 2) Adiciona `source_step_id` em `scheduled_messages` para o cron saber
--    qual passo gerou a mensagem e aplicar as regras certas.
-- 3) Cria tabela `holidays` com RLS + índice por (consultant_id, date).
--
-- Características:
--   * Todas as colunas novas em `bot_flow_steps` são nullable ou têm
--     default que mantém comportamento anterior (todas `false` = engine
--     intocado).
--   * `source_step_id` em `scheduled_messages` é nullable + ON DELETE SET
--     NULL para que mensagens órfãs continuem sendo processadas pelo cron
--     com o comportamento padrão (só quiet-hours global).
--   * `holidays.consultant_id` é nullable; NULL representa feriado global
--     legível por qualquer consultor autenticado.
--
-- Idempotência: todos os DDLs usam `IF NOT EXISTS`/`OR REPLACE` quando
-- possível para permitir re-execução em ambientes de dev.

-- =====================================================================
-- 1) bot_flow_steps — flags por passo
-- =====================================================================

ALTER TABLE public.bot_flow_steps
  ADD COLUMN IF NOT EXISTS respect_business_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_on_weekend boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_on_holiday boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_hour_start text,
  ADD COLUMN IF NOT EXISTS business_hour_end text;

COMMENT ON COLUMN public.bot_flow_steps.respect_business_hours IS
  'Quando true, mensagens agendadas a partir deste passo só disparam '
  'dentro da janela [business_hour_start, business_hour_end] em fuso BRT. '
  'Avaliação acontece no cron send-scheduled-messages, não no engine de runtime.';

COMMENT ON COLUMN public.bot_flow_steps.pause_on_weekend IS
  'Quando true, mensagens agendadas a partir deste passo são adiadas '
  'para a próxima segunda quando agendadas para sábado ou domingo (BRT).';

COMMENT ON COLUMN public.bot_flow_steps.pause_on_holiday IS
  'Quando true, mensagens agendadas a partir deste passo são adiadas para '
  'o próximo dia útil quando agendadas para uma data presente em `holidays` '
  'do consultor dono ou marcada como global (consultant_id IS NULL).';

COMMENT ON COLUMN public.bot_flow_steps.business_hour_start IS
  'Início da janela de envio em formato "HH:MM" (BRT). NULL/vazio cai no '
  'default global do sistema (09:00). Só é considerado quando '
  'respect_business_hours = true.';

COMMENT ON COLUMN public.bot_flow_steps.business_hour_end IS
  'Fim da janela de envio em formato "HH:MM" (BRT). NULL/vazio cai no '
  'default global do sistema (18:00). Só é considerado quando '
  'respect_business_hours = true.';

-- CHECK: formato HH:MM (00-23 horas, 00-59 minutos) ou NULL.
ALTER TABLE public.bot_flow_steps
  DROP CONSTRAINT IF EXISTS bot_flow_steps_business_hour_start_format;
ALTER TABLE public.bot_flow_steps
  ADD CONSTRAINT bot_flow_steps_business_hour_start_format
  CHECK (
    business_hour_start IS NULL
    OR business_hour_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

ALTER TABLE public.bot_flow_steps
  DROP CONSTRAINT IF EXISTS bot_flow_steps_business_hour_end_format;
ALTER TABLE public.bot_flow_steps
  ADD CONSTRAINT bot_flow_steps_business_hour_end_format
  CHECK (
    business_hour_end IS NULL
    OR business_hour_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

-- =====================================================================
-- 2) scheduled_messages — referência ao passo de origem
-- =====================================================================

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS source_step_id uuid
    REFERENCES public.bot_flow_steps(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.scheduled_messages.source_step_id IS
  'Passo do bot_flow_steps que originou esta mensagem agendada. NULL '
  'mantém o comportamento histórico (só quiet-hours global aplicado). '
  'Usado pelo cron send-scheduled-messages para aplicar regras de '
  'horário comercial / fim de semana / feriado configuradas no passo.';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_source_step
  ON public.scheduled_messages(source_step_id)
  WHERE source_step_id IS NOT NULL;

-- =====================================================================
-- 3) holidays — calendário por consultor
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.holidays IS
  'Calendário de feriados por consultor. consultant_id IS NULL = feriado '
  'global (Brasil), aplicável a todos os consultores. Consumido pelo cron '
  'send-scheduled-messages quando o passo de origem tem pause_on_holiday=true.';

-- Um consultor não duplica feriados na mesma data, mas global pode coexistir.
CREATE UNIQUE INDEX IF NOT EXISTS holidays_consultant_date_unique
  ON public.holidays(consultant_id, date)
  WHERE consultant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS holidays_global_date_unique
  ON public.holidays(date)
  WHERE consultant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(date);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consultor manages own holidays" ON public.holidays;
CREATE POLICY "Consultor manages own holidays" ON public.holidays
  FOR ALL TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated reads global holidays" ON public.holidays;
CREATE POLICY "Authenticated reads global holidays" ON public.holidays
  FOR SELECT TO authenticated
  USING (consultant_id IS NULL);

DROP POLICY IF EXISTS "Super admin manages all holidays" ON public.holidays;
CREATE POLICY "Super admin manages all holidays" ON public.holidays
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Rollback (manual — não executado automaticamente):
--   ALTER TABLE public.bot_flow_steps
--     DROP COLUMN IF EXISTS respect_business_hours,
--     DROP COLUMN IF EXISTS pause_on_weekend,
--     DROP COLUMN IF EXISTS pause_on_holiday,
--     DROP COLUMN IF EXISTS business_hour_start,
--     DROP COLUMN IF EXISTS business_hour_end;
--   ALTER TABLE public.scheduled_messages DROP COLUMN IF EXISTS source_step_id;
--   DROP TABLE IF EXISTS public.holidays;


-- Função helper para chamar a edge function CAPI via pg_net
CREATE OR REPLACE FUNCTION public.fb_emit_capi(
  _consultant_id UUID,
  _event_name TEXT,
  _customer_id UUID DEFAULT NULL,
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL,
  _value NUMERIC DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_pixel BOOLEAN;
  _url TEXT := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/facebook-capi';
  _anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo';
BEGIN
  SELECT pixel_id IS NOT NULL INTO _has_pixel
  FROM public.facebook_connections WHERE consultant_id = _consultant_id;
  IF NOT COALESCE(_has_pixel, FALSE) THEN RETURN; END IF;
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', _anon),
    body := jsonb_build_object(
      'consultant_id', _consultant_id,
      'event_name', _event_name,
      'customer_id', _customer_id,
      'email', _email,
      'phone', _phone,
      'value', _value
    )
  );
END;
$$;

-- Trigger: Lead quando customer é criado com consultant_id
CREATE OR REPLACE FUNCTION public.fb_trigger_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.consultant_id IS NOT NULL THEN
    PERFORM public.fb_emit_capi(
      NEW.consultant_id, 'Lead', NEW.id, NEW.email, NEW.phone_whatsapp, NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fb_lead ON public.customers;
CREATE TRIGGER trg_fb_lead
AFTER INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.fb_trigger_lead();

-- Trigger: Purchase quando status muda para 'active'
CREATE OR REPLACE FUNCTION public.fb_trigger_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.consultant_id IS NOT NULL
     AND NEW.status = 'active'
     AND COALESCE(OLD.status, '') <> 'active' THEN
    PERFORM public.fb_emit_capi(
      NEW.consultant_id, 'Purchase', NEW.id,
      NEW.email, NEW.phone_whatsapp,
      COALESCE(NEW.electricity_bill_value, 100)::NUMERIC
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fb_purchase ON public.customers;
CREATE TRIGGER trg_fb_purchase
AFTER UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.fb_trigger_purchase();

-- Cron: sync de métricas a cada 30 minutos
SELECT cron.unschedule('fb-sync-metrics') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fb-sync-metrics');
SELECT cron.schedule(
  'fb-sync-metrics',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/facebook-sync-metrics',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo'),
    body := jsonb_build_object('cron', true)
  );
  $$
);

-- Cron: refresh de tokens diariamente às 03:00
SELECT cron.unschedule('fb-token-refresh') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fb-token-refresh');
SELECT cron.schedule(
  'fb-token-refresh',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/facebook-token-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NzAsImV4cCI6MjA4Njg1MDU3MH0.OJzRdi_Z_1TFZjQXmK8rJofBeHVZc27VSo2vMMw9Spo'),
    body := jsonb_build_object('cron', true)
  );
  $$
);

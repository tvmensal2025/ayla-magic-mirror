UPDATE public.app_settings
SET super_admin_instance_name = 'Consutor-alertas',
    minio_alert_threshold_pct = COALESCE(minio_alert_threshold_pct, 85),
    resolver_strict_mode = COALESCE(resolver_strict_mode, false)
WHERE id = 'global';

INSERT INTO public.app_settings (id, super_admin_instance_name, minio_alert_threshold_pct, resolver_strict_mode)
SELECT 'global', 'Consutor-alertas', 85, false
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = 'global');
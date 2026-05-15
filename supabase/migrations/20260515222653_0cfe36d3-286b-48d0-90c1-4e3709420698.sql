UPDATE public.whatsapp_instances
   SET status = 'connected',
       last_health_check_at = now(),
       updated_at = now()
 WHERE instance_name = 'igreen-0c2711ad4836';
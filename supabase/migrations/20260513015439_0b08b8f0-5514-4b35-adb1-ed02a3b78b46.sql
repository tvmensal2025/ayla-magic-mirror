
-- 1) Apagar leads-fantasma do Excel (sem celular real, sem mensagens)
DELETE FROM public.customers
WHERE phone_whatsapp LIKE 'sem_celular_%'
  AND conversation_step IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.customer_id = customers.id);

-- 2) RPC para super-admin religar o bot que está em manual_global_pause
CREATE OR REPLACE FUNCTION public.admin_unpause_global_bot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super-admin pode religar o bot global';
  END IF;

  UPDATE public.customers
     SET bot_paused = false,
         bot_paused_reason = NULL,
         bot_paused_at = NULL,
         updated_at = now()
   WHERE bot_paused = true
     AND bot_paused_reason = 'manual_global_pause';

  GET DIAGNOSTICS _affected = ROW_COUNT;

  PERFORM public.log_admin_action(
    'global_bot_unpause',
    'customers',
    NULL,
    jsonb_build_object('affected', _affected)
  );

  RETURN _affected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unpause_global_bot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unpause_global_bot() TO authenticated;

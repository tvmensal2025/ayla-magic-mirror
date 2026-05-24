-- Task 34 (whatsapp-flow-reliability-fix Phase 7): sweeper de reservas órfãs.
-- Libera reservas em ai_slot_dispatch_log que ficaram em 'reserved' >30s sem
-- confirm. Chamado pelo outbound-media-flush-cron a cada 5s.

CREATE OR REPLACE FUNCTION public.sweep_orphan_media_reservations(p_max_age_seconds INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.ai_slot_dispatch_log
     SET dispatch_status = 'failed',
         confirmed_at    = now()
   WHERE dispatch_status = 'reserved'
     AND reserved_at < now() - make_interval(secs => p_max_age_seconds);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_orphan_media_reservations(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_orphan_media_reservations(INT) TO service_role;
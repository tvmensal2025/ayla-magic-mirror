
-- 1) Adiciona campos para gestão CBO→ABO
ALTER TABLE public.facebook_campaigns
  ADD COLUMN IF NOT EXISTS optimization_strategy text NOT NULL DEFAULT 'cbo',
  ADD COLUMN IF NOT EXISTS migrated_to_abo_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_campaign_id uuid REFERENCES public.facebook_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leads_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_fb_campaigns_strategy_status
  ON public.facebook_campaigns(optimization_strategy, status, started_at);

-- 2) Atualiza fb_trigger_lead para emitir InitiateCheckout junto com Lead
-- (intenção de contato no clique do WhatsApp / primeira mensagem inbound)
CREATE OR REPLACE FUNCTION public.fb_trigger_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.consultant_id IS NOT NULL THEN
    -- InitiateCheckout: usuário entrou em contato (clique no WhatsApp / primeira mensagem)
    PERFORM public.fb_emit_capi(
      NEW.consultant_id, 'InitiateCheckout', NEW.id, NEW.email, NEW.phone_whatsapp, NULL
    );
    -- Lead: contato qualificado registrado
    PERFORM public.fb_emit_capi(
      NEW.consultant_id, 'Lead', NEW.id, NEW.email, NEW.phone_whatsapp, NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;

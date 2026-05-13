UPDATE public.customers SET
  name=NULL, name_source='unknown',
  electricity_bill_photo_url=NULL, ocr_done=false,
  distribuidora=NULL, numero_instalacao=NULL,
  electricity_bill_value=NULL, address_city=NULL, address_state=NULL, address_street=NULL,
  conversation_step='welcome', sales_phase='abertura',
  qualification_score=0, bot_paused=false, bot_paused_reason=NULL,
  pain_point=NULL,
  updated_at=now()
WHERE phone_whatsapp='5511989000650';
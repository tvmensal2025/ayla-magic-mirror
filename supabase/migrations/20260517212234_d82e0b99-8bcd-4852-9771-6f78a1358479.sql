UPDATE public.customers
SET conversation_step = 'aguardando_doc_auto',
    updated_at = now()
WHERE id = '766482df-f231-4a40-b81c-cb527e10d6db'
  AND conversation_step = '33be68c1-44b6-4de1-8a1c-aa3758c4cdfa'
  AND name_source = 'user_confirmed'
  AND electricity_bill_value IS NOT NULL;
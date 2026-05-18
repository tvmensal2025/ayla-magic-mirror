UPDATE public.customers
SET lead_source = '"meta_ads"'::jsonb
WHERE lead_source IS NULL
  AND id IN (
    SELECT DISTINCT customer_id FROM public.conversations
    WHERE message_direction = 'inbound'
      AND message_text ~* 'tenho interesse.*mais informa[çc][õo]es|gostaria de saber mais|vi seu an[uú]ncio|do an[uú]ncio|pelo an[uú]ncio|facebook|instagram|patrocinad'
  );
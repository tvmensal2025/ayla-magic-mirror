UPDATE public.customers 
SET rg = NULL, 
    conversation_step = 'aguardando_doc_auto',
    previous_conversation_step = conversation_step
WHERE id = 'e894eb36-a843-4f15-afcb-2babb6f4e2b6';
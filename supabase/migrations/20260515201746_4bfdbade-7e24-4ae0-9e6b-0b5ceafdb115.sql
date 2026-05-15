-- Reverter prefixo sys: — manter só nomes canônicos crus (compat com outras funções).
-- O prefixo "flow:" continua, pois resolve o conflito UUID vs nome canônico no whapi-webhook.

UPDATE public.customers
   SET conversation_step = substring(conversation_step from 5)
 WHERE conversation_step LIKE 'sys:%';
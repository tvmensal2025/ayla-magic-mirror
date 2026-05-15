
-- Destravar Rafael Ferreira (real lead aguardando portal)
UPDATE public.customers
   SET bot_paused = false,
       bot_paused_reason = NULL,
       bot_paused_at = NULL,
       rescue_attempts = 0,
       error_message = NULL,
       updated_at = now()
 WHERE id = 'b2fcd7ca-0c82-4644-be9e-3abe3cf5d308';

-- Preencher text_response das Q&As do consultor 0c2711ad-4836 (Whapi ativo)
UPDATE public.bot_flow_qa SET text_response =
  '☀️ *Como funciona a iGreen Energy*' || E'\n\n' ||
  'Você continua recebendo a conta da sua distribuidora normalmente, só que com *desconto garantido de até 20%* todo mês.' || E'\n\n' ||
  '✅ Sem obra, sem instalação de placas' || E'\n' ||
  '✅ Sem mudar de fornecedor' || E'\n' ||
  '✅ Sem fidelidade — pode sair quando quiser' || E'\n\n' ||
  'Quer aproveitar o desconto? Me envie uma *foto da sua conta de luz* que eu já te mostro a economia 📸'
 WHERE id = 'c8581c45-0ae2-46d5-89b0-b9b8d5efd9fd';

UPDATE public.bot_flow_qa SET text_response =
  '💰 *Custa zero pra você!*' || E'\n\n' ||
  'Não tem taxa de adesão, não tem mensalidade, não tem instalação. Você só paga a *própria conta de luz já com desconto* direto pra distribuidora.' || E'\n\n' ||
  'Quer ver quanto vai economizar? Me envia a *foto da sua conta* 📸'
 WHERE id = 'b1196f35-d632-4aed-bb2e-dab87d16bfba';

UPDATE public.bot_flow_qa SET text_response =
  '⚡ *Atendemos as principais distribuidoras do Brasil*' || E'\n\n' ||
  'Enel, CPFL, Equatorial, Energisa, Cemig, Light, Coelba, Celesc, Copel, Neoenergia e muitas outras.' || E'\n\n' ||
  'Pra confirmar se a sua é compatível, me envia a *foto da sua conta de luz* que eu valido na hora 📸'
 WHERE id = 'e677775e-4a1c-433b-b9cc-d05a925458d2';

UPDATE public.bot_flow_qa SET text_response =
  '👋 Olá! Sou a Camila, assistente da iGreen Energy.' || E'\n\n' ||
  'Posso te ajudar a *economizar até 20% na conta de luz* sem instalar nada e sem fidelidade.' || E'\n\n' ||
  'Quer saber como? Me envia a *foto da sua conta de luz* e eu te mostro 📸'
 WHERE id = 'b3e96f01-61c0-4b88-8495-4919cebebbc6';

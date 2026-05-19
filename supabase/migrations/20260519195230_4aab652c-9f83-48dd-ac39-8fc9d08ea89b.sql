-- Padroniza desconto em ate 20% na base de conhecimento FAQ
UPDATE public.ai_knowledge_sections
   SET content = replace(content,
        'O desconto varia entre 10% e 20% sobre o valor da energia consumida, dependendo da sua distribuidora e perfil.',
        'O desconto é de até 20% sobre o valor da energia consumida, conforme sua distribuidora e perfil.')
 WHERE id = '7073537b-3bf5-4a8b-8f86-4c1dfe1e37b8';

-- Preenche message_text padrao para passos "como_funciona" vazios (nao sobrescreve quem ja personalizou)
UPDATE public.bot_flow_steps
   SET message_text = 'Funciona assim, {{nome}}: você continua recebendo a conta da sua distribuidora normal — só que a iGreen entra com *até 20% de desconto* todo mês.

Sem obra, sem instalação, sem mudar fiação. 💚

Quer que eu já faça a simulação com o valor da sua conta?'
 WHERE slot_key = 'como_funciona'
   AND coalesce(message_text, '') = '';
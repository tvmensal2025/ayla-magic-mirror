-- Insere 8 FAQs base em todos bot_flows ativos (idempotente por intent_name).
-- Também insere as palavras-chave (triggers) de cada FAQ.

DO $$
DECLARE
  faq_data jsonb := '[
    {
      "intent_name": "É seguro / é golpe",
      "text": "Pode ficar tranquilo(a) 🙏 A iGreen é uma empresa autorizada pela ANEEL e atua há anos no Brasil. Você continua com a mesma distribuidora (Enel, CPFL, etc.) e o desconto vem direto na sua conta de luz — sem instalar nada e sem fidelidade que te prenda.",
      "triggers": ["é seguro","seguro","é golpe","golpe","confiável","confiavel","desconfio","desconfiada","tenho medo","é confiavel","é confiável","é furada","furada"]
    },
    {
      "intent_name": "Preciso trocar de empresa",
      "text": "Não precisa trocar de empresa! 😊 Sua distribuidora continua a mesma (Enel, CPFL, Light, etc.). A iGreen só entra como sua geradora de energia limpa e te dá o desconto na fatura — você não troca de empresa, não troca de medidor, nada.",
      "triggers": ["trocar de empresa","mudar de empresa","trocar distribuidora","mudar distribuidora","trocar de luz","sair da enel","sair da cpfl"]
    },
    {
      "intent_name": "Quanto tempo pra ativar",
      "text": "Depois que você manda os documentos, leva em média de *30 a 60 dias* pra começar a aparecer o desconto na sua conta de luz. Esse prazo é da própria distribuidora processar a troca — a gente acompanha tudo pra você 🙌",
      "triggers": ["quanto tempo","quando começa","quando começa o desconto","prazo","demora","leva quanto tempo","quanto tempo demora","quando ativa","quando ativar"]
    },
    {
      "intent_name": "Posso cancelar / multa",
      "text": "Pode cancelar quando quiser, sem multa nem fidelidade. 🤝 É só avisar com 30 dias de antecedência. A iGreen confia no resultado — se você não estiver satisfeito(a), tá liberado pra sair.",
      "triggers": ["cancelar","cancelo","cancelamento","multa","fidelidade","carencia","carência","tem multa","tem fidelidade","posso sair","quero sair"]
    },
    {
      "intent_name": "Continuo recebendo conta da concessionária",
      "text": "Sim! 📄 Você continua recebendo a fatura da sua distribuidora normalmente — só que agora com o desconto da iGreen aplicado. É a mesma conta de sempre, no mesmo prazo, no mesmo lugar.",
      "triggers": ["continuo recebendo conta","recebo a conta","vai vir conta","vou receber conta","como vou pagar","onde pago","pagar a conta","fatura"]
    },
    {
      "intent_name": "Qual o desconto exato",
      "text": "O desconto é de até *20%* sobre o valor da sua conta de luz, todo mês. 💚 Quanto maior sua conta, maior o desconto em reais. Posso te calcular agora mesmo se você me mandar uma foto da sua conta 📸",
      "triggers": ["quanto de desconto","qual o desconto","desconto exato","quantos por cento","quantos %","porcentagem","quanto vou economizar","economia"]
    },
    {
      "intent_name": "Atende minha cidade",
      "text": "A iGreen atende todo o Brasil onde há mercado livre de energia. ✅ Pra eu confirmar 100% que atende a sua cidade, me passa o nome da sua distribuidora (Enel, CPFL, Light, Cemig, Coelba…) ou o seu CEP que eu confirmo na hora 🙏",
      "triggers": ["atende minha cidade","atende aqui","funciona aqui","funciona na minha cidade","atende meu estado","tem na minha região","minha região"]
    },
    {
      "intent_name": "Preciso instalar placa",
      "text": "Não precisa instalar *nada*! 🙌 Sem placa solar, sem obra, sem técnico na sua casa. A energia limpa é gerada nas usinas da iGreen e o desconto chega direto na sua conta de luz. Zero mexida no seu imóvel.",
      "triggers": ["preciso instalar","instalar placa","placa solar","obra","mexer na casa","instalação","instalacao","instalar alguma coisa","painel solar"]
    }
  ]'::jsonb;
  flow_row RECORD;
  faq jsonb;
  max_pos int;
  new_qa_id uuid;
  trig text;
BEGIN
  FOR flow_row IN SELECT id FROM public.bot_flows WHERE is_active = true LOOP
    FOR faq IN SELECT * FROM jsonb_array_elements(faq_data) LOOP
      -- Pula se já existe FAQ com o mesmo intent_name nesse flow
      IF EXISTS (
        SELECT 1 FROM public.bot_flow_qa
        WHERE flow_id = flow_row.id
          AND intent_name = (faq->>'intent_name')
          AND NOT is_opening AND NOT is_closing
      ) THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(MAX(position), -1) + 1 INTO max_pos
      FROM public.bot_flow_qa WHERE flow_id = flow_row.id;

      INSERT INTO public.bot_flow_qa (flow_id, position, intent_name, is_opening, is_closing, text_response)
      VALUES (flow_row.id, max_pos, faq->>'intent_name', false, false, faq->>'text')
      RETURNING id INTO new_qa_id;

      FOR trig IN SELECT jsonb_array_elements_text(faq->'triggers') LOOP
        INSERT INTO public.bot_flow_qa_triggers (qa_id, phrase) VALUES (new_qa_id, trig);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
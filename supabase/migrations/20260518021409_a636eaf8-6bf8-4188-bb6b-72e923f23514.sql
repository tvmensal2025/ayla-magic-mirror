
-- 1) Novos campos
ALTER TABLE public.ai_knowledge_sections
  ADD COLUMN IF NOT EXISTS persona text NOT NULL DEFAULT 'ambos',
  ADD COLUMN IF NOT EXISTS is_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_sections_persona ON public.ai_knowledge_sections(persona);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_sections_keywords ON public.ai_knowledge_sections USING GIN(keywords);

-- 2) 8 novas seções de FAQ (positions 100-107) — formato P: ... R: ...
INSERT INTO public.ai_knowledge_sections (title, position, is_active, persona, is_critical, keywords, content) VALUES

('FAQ 1 — CONTA DE LUZ E ELEGIBILIDADE', 100, true, 'cliente', true,
ARRAY['conta','luz','elegível','elegibilidade','distribuidora','baixa tensão','média tensão','valor mínimo','rural','condomínio','aluguel','inquilino','medidor','bandeira','iluminação','cosip'],
$$P: Qual o valor mínimo de conta para entrar na iGreen?
R: A partir de R$ 200/mês na conta de luz já é possível economizar com a iGreen.

P: Minha distribuidora atende?
R: Atendemos as principais distribuidoras do Brasil (Enel, CPFL, Light, Cemig, Coelba, Celpe, Cosern, Equatorial, Energisa, EDP, Neoenergia entre outras). Me passa seu CEP e a cidade que eu confirmo na hora.

P: Sou de baixa tensão ou média tensão?
R: A maioria das casas e pequenos comércios é baixa tensão (B1/B3). Média tensão (A4) é para indústrias e grandes comércios — também atendemos, mas o cálculo muda. Me manda a conta que eu te digo.

P: Conta rural entra?
R: Sim, conta rural (B2) entra normalmente, com o mesmo desconto.

P: Tenho conta de aluguel/inquilino, posso aderir?
R: Pode sim! O contrato é vinculado ao titular da conta de luz. Se você é o titular (mesmo morando de aluguel), a adesão é normal.

P: Moro em condomínio, dá pra cadastrar a conta do meu apartamento?
R: Sim. Cada unidade com medidor próprio é uma conta individual e pode aderir.

P: Tenho mais de uma conta (casa + comércio), posso colocar todas?
R: Sim! Você pode incluir todas as contas que estiverem no seu nome ou CNPJ.

P: Conta no nome de outra pessoa (pai, esposa) posso cadastrar?
R: Não. O cadastro precisa ser feito no nome do titular da conta. Se quiser, peço para o titular fazer ou trocamos a titularidade.

P: Conta atrasada/em débito posso aderir?
R: Precisa estar adimplente (sem corte e sem dívida em aberto). Quita o débito e a adesão segue normal.

P: Conta pré-paga ou tarifa social entra?
R: Tarifa social e pré-paga não entram (já têm subsídio do governo).

P: O que muda no meu medidor?
R: NADA. O medidor continua o mesmo, a distribuidora continua a mesma. Muda só quem te cobra a energia (em vez da distribuidora, vem da iGreen com desconto).

P: A bandeira tarifária e a CIP/iluminação pública continuam?
R: A bandeira tarifária e a CIP (taxa de iluminação) continuam na conta da distribuidora — o desconto da iGreen é sobre a energia consumida.$$),

('FAQ 2 — DESCONTO E COBRANÇA', 101, true, 'cliente', true,
ARRAY['desconto','boleto','vencimento','cobrança','pagamento','débito automático','pix','fatura','cartão','reajuste','aneel','duas contas'],
$$P: Qual o desconto que vou ter?
R: O desconto varia entre 10% e 20% sobre o valor da energia consumida, dependendo da sua distribuidora e perfil. Após o cadastro a gente te manda a simulação exata.

P: Esse desconto é para sempre?
R: Sim, enquanto durar o contrato. E mesmo quando a ANEEL reajustar a tarifa, o seu desconto percentual continua valendo.

P: Como vou pagar a conta agora?
R: Você passa a receber 2 boletos:
1. Boleto da distribuidora (só com a parte fixa: taxa de disponibilidade, bandeira, iluminação pública)
2. Boleto da iGreen (a energia consumida com desconto)
A soma dos dois é menor que a conta atual.

P: Vou pagar duas contas então?
R: São dois boletos sim, mas a soma é sempre menor. É como pagar em duas partes — uma pra distribuidora (taxas) e uma pra iGreen (energia com desconto).

P: Qual a data de vencimento dos boletos?
R: O boleto da iGreen tem vencimento fixo (geralmente dia 10 ou dia 20, você escolhe). O da distribuidora segue a data normal dela.

P: Posso pagar por PIX, cartão ou débito automático?
R: Sim — boleto, PIX (no próprio boleto) e débito automático disponíveis. Cartão de crédito ainda não.

P: E se eu atrasar o boleto da iGreen?
R: Tem multa de 2% + juros, igual qualquer boleto. Se atrasar muito (90+ dias), o contrato é cancelado e você volta à conta normal da distribuidora.

P: Posso parcelar uma fatura?
R: Em casos específicos sim — o atendimento avalia. Entre em contato pelo 0800.

P: O desconto cai se eu consumir muito ou pouco?
R: Não. O percentual de desconto é fixo, independente do consumo.$$),

('FAQ 3 — PROCESSO E PRAZOS', 102, true, 'cliente', false,
ARRAY['cadastro','prazo','documentos','contrato','assinar','cancelar','rescisão','migração','quando começa','aprovação','recusado'],
$$P: Quanto tempo demora pra começar a economizar?
R: Em média 30 a 60 dias após a aprovação do cadastro. A primeira fatura com desconto chega no ciclo seguinte à migração.

P: Quais documentos preciso enviar?
R: Só 3: foto/PDF da conta de luz, CPF (ou CNPJ) e um documento com foto (RG ou CNH). Tudo pelo WhatsApp.

P: Como assino o contrato?
R: 100% digital — assinatura eletrônica por e-mail ou WhatsApp. Sem cartório, sem papel.

P: E se meu cadastro for recusado?
R: Recusa é rara — geralmente por nome restrito ou conta em débito. Se acontecer, a gente te avisa o motivo e o que fazer.

P: Posso cancelar quando quiser?
R: Sim, sem multa e sem fidelidade. Basta pedir o cancelamento e em até 60 dias você volta a receber só a conta da distribuidora.

P: Tem fidelidade ou multa?
R: NÃO. Sem fidelidade, sem multa de cancelamento, sem taxa de adesão.

P: Posso voltar pra distribuidora se quiser?
R: Sim, a qualquer momento. É só pedir o cancelamento.

P: Preciso comunicar minha distribuidora?
R: Não. A iGreen faz toda a migração com a distribuidora pra você.$$),

('FAQ 4 — SEGURANÇA E CONFIANÇA', 103, true, 'cliente', true,
ARRAY['confiança','segurança','golpe','aneel','reclame aqui','é seguro','autorizada','idoneidade','dados','lgpd','vibra','comerc'],
$$P: A iGreen é confiável? É golpe?
R: A iGreen Energy é homologada pela ANEEL como comercializadora de energia, atua em parceria com a Comerc Energia e a Vibra (antiga BR Distribuidora). Mais de 200 mil clientes ativos no Brasil.

P: Posso ver no Reclame Aqui?
R: Sim, a iGreen tem reputação Bom no Reclame Aqui, com índice de solução acima de 90%.

P: Vocês têm autorização da ANEEL?
R: Sim, a iGreen é cadastrada e autorizada pela ANEEL como comercializadora varejista no Mercado Livre de Energia (resolução 1.000/2021).

P: E se a iGreen quebrar ou sair do mercado?
R: Em qualquer cenário, sua energia NÃO é interrompida — a distribuidora local continua sendo responsável pelo fornecimento. Você só voltaria a pagar a conta integral pra ela.

P: Vocês fazem o quê com meus dados?
R: Usamos só pra cadastro junto à distribuidora e cobrança. Seguimos LGPD. Nada é vendido ou compartilhado.

P: Por que essa economia existe? De onde vem?
R: Da Lei do Mercado Livre de Energia. A iGreen compra energia de usinas solares e eólicas em larga escala (mais barata) e repassa o desconto pra você. Você passa a ser cliente da iGreen, não da distribuidora local.

P: Quem é a Comerc e a Vibra?
R: Comerc Energia é uma das maiores comercializadoras de energia do Brasil. Vibra (ex-BR Distribuidora) é gigante do setor de energia. Juntas, formam a base que garante a iGreen.$$),

('FAQ 5 — GANHOS E CARREIRA (LEAD)', 104, true, 'lead', true,
ARRAY['ganhar','renda','comissão','licença','licenciado','plano de carreira','royalty','indicação','quanto ganho','investimento','vale a pena','mlm','pirâmide','imposto'],
$$P: Quanto ganha um consultor iGreen?
R: Depende do volume. Em média: consultor iniciante R$ 1.500–3.000/mês indicando 10–20 contas; consultor ativo R$ 5.000–15.000/mês; níveis avançados R$ 30.000+/mês com equipe.

P: Como funciona a comissão?
R: Você recebe um percentual sobre a fatura de cada cliente ativo TODO MÊS, enquanto ele for cliente. É renda recorrente, não venda única.

P: Quanto custa a licença?
R: A licença tem investimento único acessível (valores promocionais a partir de R$ 297, condições variam por mês). Te passo o valor atualizado e formas de pagamento.

P: Tem mensalidade pra ser consultor?
R: NÃO. A licença é única, sem mensalidade depois.

P: Recebo comissão de quem eu indicar pra ser consultor também?
R: Sim. Tem plano de carreira com royalties por equipe (até 5 níveis). Quanto mais consultores ativos na sua rede, mais você ganha.

P: Isso é pirâmide ou MLM?
R: NÃO. Pirâmide é proibida por lei e só ganha dinheiro de cadastro. Aqui, 100% das comissões vêm da CONTA DE LUZ dos clientes (produto real e recorrente). Sem cadastro de cliente = sem comissão.

P: Quando recebo a primeira comissão?
R: Após a primeira fatura paga do cliente — em média 60–90 dias do cadastro.

P: Como recebo?
R: PIX direto no seu CPF/CNPJ, mensal, dia fixo.

P: Preciso ter CNPJ?
R: Recomendado MEI (R$ 75/mês) pra emitir nota e pagar menos imposto, mas pode começar como PF.

P: Preciso bater meta?
R: Não tem meta obrigatória, mas há bônus de qualificação por volume e tempo (ex: 5 contas em 30 dias destrava bônus de início rápido).

P: Vocês dão treinamento?
R: Sim — treinamento completo gratuito (vídeos, lives, grupo no WhatsApp, mentoria). Você não fica sozinho.

P: Preciso ter experiência em vendas?
R: Não. A maioria dos consultores começou sem experiência. O produto se vende sozinho (economia + sustentabilidade).

P: Posso fazer parcial junto com meu emprego CLT?
R: Sim, super comum. Muitos começam meio período e migram quando a renda passa do salário.

P: Quanto tempo até viver disso?
R: Em média 6–12 meses de dedicação consistente. Quem trata como negócio (não hobby) chega rápido.

P: Tem material pronto pra divulgar?
R: Sim — site pessoal, posts prontos, vídeos, panfletos, anúncios. Tudo no painel do consultor.

P: Posso anunciar no Facebook/Instagram?
R: Pode! Inclusive a plataforma tem ferramenta de criação automática de anúncios.

P: Tem como ver quanto estou ganhando em tempo real?
R: Sim — painel mostra contas ativas, comissões do mês, indicadores e ranking.

P: E se um cliente meu cancelar?
R: Você para de receber a comissão dele a partir do mês seguinte. Por isso o foco é volume e qualidade.

P: Posso indicar pessoas de outros estados?
R: Sim! Comissão chega independente da cidade/estado do cliente, desde que a distribuidora dele seja atendida.

P: Preciso comprar produto/estoque?
R: NÃO. Você não vende produto físico, vende um cadastro de economia. Zero estoque, zero entrega.$$),

('FAQ 6 — OPERAÇÃO DO PAINEL (LICENCIADO)', 105, true, 'licenciado', false,
ARRAY['painel','cadastrar cliente','simulação','link','site','crm','whatsapp','suporte','financeiro','indicar consultor','treinamento','app'],
$$P: Como cadastro um cliente novo?
R: Pelo seu painel: aba "Novo Cliente" → preenche dados básicos → envia link de assinatura pro cliente pelo WhatsApp. Ele assina digital e pronto.

P: Como acompanho o status do cliente?
R: No CRM/Kanban do painel — cada cliente aparece em uma etapa (cadastro, análise, aprovado, ativo, etc).

P: Posso simular a economia antes de cadastrar?
R: Sim — basta o CEP e o valor da conta. A simulação roda em segundos.

P: Como pego meu link de divulgação?
R: No painel → "Meus Links". Cada consultor tem URL única (ex: igreen.com.br/seu-nome) que rastreia leads automaticamente.

P: O WhatsApp do painel é meu número ou da iGreen?
R: É o seu — você conecta seu WhatsApp pessoal/comercial ao painel via QR Code. As mensagens saem do seu número.

P: Posso usar a Camila (IA) pra responder leads?
R: Sim — a IA Camila atende leads 24/7, faz pré-qualificação, envia áudios e vídeos e te avisa quando o lead está pronto pra fechar.

P: Como crio anúncios no Facebook?
R: Painel → "Anúncios" → escolhe modelo → IA gera imagem e texto → você publica direto na sua conta de Facebook Ads.

P: Onde vejo minhas comissões?
R: Painel → "Financeiro" → comissões do mês, histórico, contas ativas e previsão.

P: Como indico um novo consultor?
R: Painel → "Indicar Consultor" → manda o link de licenciamento. Quando ele se licencia, entra na sua equipe automaticamente.

P: Tem app ou só pelo navegador?
R: Funciona no navegador (PWA) — instala como app no celular. App nativo está em desenvolvimento.

P: Quem é meu suporte?
R: 1) Seu patrocinador direto, 2) Grupo de WhatsApp da equipe, 3) Suporte oficial iGreen (0800), 4) Suporte técnico da plataforma (chat dentro do painel).

P: Como funciona o treinamento?
R: Trilha completa dentro do painel + lives semanais + mentoria do patrocinador. Tudo gratuito.$$),

('FAQ 7 — PRODUTOS (GREEN, SOLAR, LIVRE, TELECOM, CLUB)', 106, true, 'ambos', false,
ARRAY['produtos','conexão green','solar','livre','telecom','club','placas','chip','internet','energia solar','mercado livre'],
$$P: Quais produtos a iGreen tem?
R: 5 principais:
1. Conexão GREEN — desconto na conta de luz (baixa tensão)
2. Conexão SOLAR — financiamento de placas solares
3. Conexão LIVRE — Mercado Livre de Energia (alta tensão / empresas)
4. Conexão TELECOM — chip e internet móvel com desconto
5. Conexão CLUB — clube de vantagens (descontos em lojas, cashback)

P: Qual a diferença entre Green e Solar?
R: Green = desconto na conta SEM instalar nada. Solar = financiamento pra instalar placas no seu telhado. No Solar, você gera sua própria energia.

P: Quem pode entrar no Livre?
R: Empresas com conta acima de R$ 5.000/mês (média/alta tensão). Economia chega a 35%.

P: Como funciona o Telecom?
R: Chip iGreen com plano de internet + minutos com preço abaixo do mercado. Funciona em qualquer celular desbloqueado.

P: O que é o Conexão Club?
R: Clube de vantagens — descontos em lojas parceiras, cashback em compras online, parcerias com farmácias, postos, restaurantes, etc.

P: Posso ter mais de um produto?
R: Sim! Inclusive recomendado. Cliente que tem Green + Club + Telecom economiza muito mais.

P: O consultor ganha comissão de todos os produtos?
R: Sim, cada produto tem sua tabela de comissão. Quanto mais produtos por cliente, mais renda recorrente.$$),

('FAQ 8 — OBJEÇÕES E COMPARATIVOS', 107, true, 'ambos', true,
ARRAY['comparar','energisol','greendays','sun mobi','órigo','dueenergia','golpe','é seguro','muito bom para ser verdade','sem confiança','preciso pensar','meu marido','minha esposa','é caro','não tenho tempo'],
$$P: Já vi outras empresas oferecendo isso (Órigo, Sun Mobi, Energisol). Qual a diferença?
R: Todas operam no mesmo modelo (Lei do Mercado Livre / GD). A iGreen se diferencia por: 1) parceria com Vibra e Comerc (gigantes do setor), 2) desconto fixo independente de geração solar (não depende do sol), 3) plano de carreira recorrente pra quem quer ganhar com indicações.

P: Parece bom demais pra ser verdade.
R: É uma sensação normal. O desconto existe porque a Lei 14.300/2022 abriu o mercado de energia. Empresas grandes (Comerc, Vibra, iGreen) compram energia mais barata em grande escala e repassam. É a mesma lógica de quem compra atacado.

P: Preciso conversar com meu marido/esposa.
R: Faz total sentido — é uma decisão da casa. Te mando agora um resumo escrito + um vídeo de 2 min explicando, você apresenta tranquilo e a gente fecha quando vocês decidirem. Pode ser?

P: Não tenho tempo agora.
R: Sem problema! Te chamo amanhã às [horário]. Em 5 minutos a gente resolve seu cadastro. Que tal?

P: É caro? Vou pagar adesão?
R: Pro cliente: ZERO de adesão, ZERO mensalidade da plataforma. Você só passa a pagar a energia com desconto. Pro consultor: licença única (a partir de R$ 297), sem mensalidade.

P: E se a distribuidora me cobrar errado?
R: A iGreen tem time de auditoria que confere todas as faturas. Qualquer divergência a gente resolve direto com a distribuidora pra você.$$);

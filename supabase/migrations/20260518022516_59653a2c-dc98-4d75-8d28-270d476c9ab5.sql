
-- Ajustes FAQ iGreen: até 15% desconto, remoção valores de licença/comissão, Cashback Sustentável, cobertura parcial

-- SEÇÃO 3 — PRODUTOS (remover comissões e valores; manter info de produto pro cliente)
UPDATE public.ai_knowledge_sections SET content = $$### PRODUTO 1: Conexão Green (Geração Distribuída)
- Créditos de energia de fazendas solares iGreen
- Zero investimento, zero obras, sem fidelidade
- Desconto: até 15% sobre a Tarifa de Energia (TE)
- Disponível em algumas distribuidoras com boleto único; nas demais, dois boletos
- Critério mínimo: 130 kWh

### PRODUTO 2: Conexão Livre (Mercado Livre)
- Solução para empresas (Grupo A), até 30% de desconto, sem placas

### PRODUTO 3: Conexão Solar
- Instalação de usina no local em regime de locação

### PRODUTO 4: Conexão Placas
- Compra e instalação de placas solares

### PRODUTO 5: Conexão Club
- Clube de benefícios e descontos. GRATUITO para clientes Green
- Versão individual e PJ

### PRODUTO 6: Conexão Telecom (MVNO iGreen)
- Rede Surf Telecom, cobertura 5G
- Planos com WhatsApp ilimitado, ligações ilimitadas e internet acumulada

### CASHBACK SUSTENTÁVEL
- Cliente Green indica amigos e recebe até 2% de cashback por indicação
- Abatido automaticamente no próprio boleto iGreen do mês seguinte
- Sem limite de indicações$$, keywords = ARRAY['produto','green','livre','solar','placas','club','telecom','desconto','cashback','indicação','15%']
WHERE position = 3;

-- SEÇÃO 4 — Substituir matemática de ganhos por mensagem genérica (sem valores)
UPDATE public.ai_knowledge_sections SET title = 'SEÇÃO 4 — CARREIRA DO CONSULTOR (LEAD)', content = $$Para quem tem interesse em se tornar consultor iGreen:
- A iGreen oferece um plano de carreira com ganhos recorrentes sobre a energia que o cliente consome
- Há bonificações por indicação de novos consultores e por crescimento de equipe
- Detalhes específicos de valores, comissões, custo de licença e premiações são apresentados pelo consultor responsável em uma conversa personalizada
- NÃO informe valores de licença, percentuais de comissão ou tabelas de carreira por aqui — direcione o lead para falar com o consultor humano$$, keywords = ARRAY['carreira','consultor','licença','ganhos','comissão','lead']
WHERE position = 4;

-- SEÇÃO 5 — Pontuação (remover, transformar em redirect)
UPDATE public.ai_knowledge_sections SET content = $$Informações detalhadas sobre pontuação, qualificação e regras de carreira são apresentadas individualmente pelo consultor responsável. Direcione o lead para a conversa com o consultor.$$, keywords = ARRAY['pontuação','qualificação','vml']
WHERE position = 5;

-- SEÇÃO 6 — Plano de carreira (remover tabela)
UPDATE public.ai_knowledge_sections SET content = $$Detalhes do plano de carreira, níveis e premiações são apresentados pelo consultor em uma conversa personalizada. NÃO informe valores aqui.$$, keywords = ARRAY['carreira','níveis']
WHERE position = 6;

-- SEÇÃO 7 — Royalties (remover valores)
UPDATE public.ai_knowledge_sections SET content = $$Valores de royalties são apresentados pelo consultor responsável.$$, keywords = ARRAY['royalties']
WHERE position = 7;

-- SEÇÃO 8 — Licença (remover valores)
UPDATE public.ai_knowledge_sections SET title = 'SEÇÃO 8 — LICENÇA DO CONSULTOR', content = $$Para se tornar consultor licenciado iGreen:
- Inclui kit oficial, acesso ao App iGreen, iGreen Academy, suporte e materiais
- Valores de aquisição, renovação e benefícios financeiros são apresentados pelo consultor em conversa direta
- NÃO informe preços nem percentuais por aqui$$, keywords = ARRAY['licença','kit','renovação','consultor']
WHERE position = 8;

-- SEÇÃO 9 — Cobertura (parcial, não todo Brasil)
UPDATE public.ai_knowledge_sections SET title = 'SEÇÃO 9 — COBERTURA E ESTADOS', content = $$A iGreen atua atualmente em parte do território brasileiro, com expansão constante. Para confirmar se a distribuidora do cliente é atendida, peça:
- Estado
- Nome da distribuidora (ex: Cemig, Enel, Equatorial, CPFL, Energisa, EDP, Coelba, Celesc, Copel, Cosern, Neoenergia, RGE, CEEE)
- Valor médio da conta de luz

Em breve a cobertura será expandida para todo o Brasil. Se a distribuidora ainda não for atendida, ofereça cadastro na lista de espera.$$, keywords = ARRAY['estado','distribuidora','cobertura','atendimento','brasil']
WHERE position = 9;

-- SEÇÃO 10 — Como funciona pro cliente (ajustar desconto)
UPDATE public.ai_knowledge_sections SET content = $$1. Cadastro gratuito (nome, CPF, conta de luz) — 100% online
2. iGreen analisa e aprova
3. Créditos de energia solar injetados na conta de luz
4. Desconto de até 15% na conta de luz todo mês
5. Sem obras, sem custos, sem fidelidade
6. Programa Cashback Sustentável: até 2% adicional por cada amigo indicado, abatido no próprio boleto iGreen$$, keywords = ARRAY['cliente','como funciona','cadastro','desconto','cashback','15%']
WHERE position = 10;

-- SEÇÃO 13 — FAQ (corrigir desconto, remover valor da licença, ajustar cobertura, cashback)
UPDATE public.ai_knowledge_sections SET content = $$P: É golpe/pirâmide?
R: Não. iGreen Energia (CNPJ 44.159.238/0001-30), regulada pela Lei 14.300/2022, com +500 mil clientes e parcerias Comerc e Vibra. Pirâmide é proibida e não gera produto real; aqui há entrega real de crédito de energia.

P: Preciso investir como cliente?
R: Não. O cadastro do cliente é 100% gratuito.

P: Posso cancelar?
R: Sim, a qualquer momento. Sem fidelidade, sem multa.

P: Quanto tempo para começar a economizar?
R: Em até 60 dias após a aprovação do cadastro.

P: Qual o desconto?
R: Até 15% sobre a Tarifa de Energia, todo mês, direto na conta de luz.

P: Como funciona o Cashback Sustentável?
R: O cliente Green indica amigos e recebe até 2% de cashback por indicação, abatido automaticamente no próprio boleto iGreen. Sem limite de indicações.

P: A iGreen atende todo o Brasil?
R: Atualmente atende parte do território brasileiro, com expansão contínua. Para confirmar, informe seu estado e distribuidora.

P: Diferença Green vs Solar?
R: Green usa créditos de fazendas solares (sem instalação no local). Solar instala usina no telhado/terreno do cliente.

P: Quero ser consultor — quanto custa e quanto ganho?
R: Esses detalhes são apresentados pelo consultor responsável em conversa personalizada. Vou te conectar com ele.$$, keywords = ARRAY['faq','dúvidas','pirâmide','cancelar','desconto','cashback','consultor']
WHERE position = 13;

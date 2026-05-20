
-- Liga A/B test do Rafael
UPDATE public.consultants
SET ab_test_enabled = true
WHERE name = 'Rafael Ferreiras';

-- Fluxo B (sem áudio) — Rafael Ferreiras
-- flow_id = '477f8968-1344-4252-b822-8912fdbdb538'

-- Pos 3 — Boas-vindas (substitui o áudio inicial do A por apresentação completa em texto)
UPDATE public.bot_flow_steps
SET message_text =
'Oi, {{nome}}! Tudo bem? 😊

Aqui é o *Rafael Ferreiras*, da *iGreen Energy*.

Já somos mais de *700 mil clientes* no Brasil economizando todo mês na conta de luz — tem gente economizando R$ 70, R$ 100, e quem gasta mais (R$ 900, R$ 1.200) economiza ainda mais.

E o melhor: *sem custo nenhum, sem obra, sem instalação*. Você continua recebendo a sua conta normal, só que com até *20% de desconto*.

Posso te explicar rapidinho como funciona?'
WHERE flow_id = '477f8968-1344-4252-b822-8912fdbdb538'
  AND position = 3;

-- Pos 4 — Pergunta valor da conta (já igual ao A, mantém)
UPDATE public.bot_flow_steps
SET message_text = '{{nome}}, qual o valor médio da sua conta de luz hoje?'
WHERE flow_id = '477f8968-1344-4252-b822-8912fdbdb538'
  AND position = 4;

-- Pos 5 — Explica o desconto (mantém o texto já correto, só refina)
UPDATE public.bot_flow_steps
SET message_text =
'Funciona assim, {{nome}}: você continua recebendo a conta da sua distribuidora normalmente — só que a iGreen entra com *até 20% de desconto* todo mês.

✅ Sem obra
✅ Sem instalação
✅ Sem mexer em fiação
✅ Sem mudar nada na sua casa

É só uma troca de fornecedor de energia, 100% online. 💚'
WHERE flow_id = '477f8968-1344-4252-b822-8912fdbdb538'
  AND position = 5;

-- Pos 6 — Pede permissão / Como funciona na prática (estava vazio)
UPDATE public.bot_flow_steps
SET message_text =
'Deixa eu te explicar como a iGreen consegue esse desconto:

A iGreen tem uma *fazenda solar gigante* que gera energia limpa e injeta direto na rede da sua distribuidora (Enel, CPFL, Light, Cemig, Equatorial, etc).

Você passa a consumir essa energia limpa no lugar da energia comum — e por isso ganha o desconto todo mês na sua conta. A distribuidora continua a mesma, a conta continua chegando do mesmo jeito, só com o desconto aplicado. ⚡💚'
WHERE flow_id = '477f8968-1344-4252-b822-8912fdbdb538'
  AND position = 6;

-- Pos 7 — Detalhamento (substitui o "vou te mandar áudio e vídeo" por explicação direta em texto)
UPDATE public.bot_flow_steps
SET message_text =
'Resumindo pra ficar bem claro, {{nome}}:

1️⃣ Você *não paga nada* pra entrar — é 100% gratuito.
2️⃣ *Não tem fidelidade* — pode sair quando quiser, sem multa.
3️⃣ Sua conta continua chegando da sua distribuidora, normal.
4️⃣ Todo mês vem com *até 20% de desconto* aplicado.
5️⃣ É energia *limpa e renovável* — você ainda ajuda o meio ambiente. 🌱

Faz sentido pra você?'
WHERE flow_id = '477f8968-1344-4252-b822-8912fdbdb538'
  AND position = 7;

-- Pos 8 — Convite para o cadastro
UPDATE public.bot_flow_steps
SET message_text =
'Então bora fazer seu cadastro, {{nome}}? 🚀

É *rapidinho* e 100% online. Eu vou precisar só de 2 coisas:

📄 Uma *foto da sua conta de luz* (qualquer mês recente)
🪪 Uma *foto de um documento com foto* (RG ou CNH)

Pode me mandar a foto da conta de luz agora?'
WHERE flow_id = '477f8968-1344-4252-b822-8912fdbdb538'
  AND position = 8;

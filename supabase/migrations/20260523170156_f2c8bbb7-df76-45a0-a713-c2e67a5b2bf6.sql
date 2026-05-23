
-- 1) Boas-vindas curta
UPDATE bot_flow_steps SET message_text = E'Olá, seja muito *bem-vindo(a)*! 😊\n\nSou a *assistente virtual* do {{representante}} e vou te ajudar a ver se a sua conta de luz tem perfil pra *economizar todo mês*. 💚\n\n👇 Escolha uma das opções abaixo:'
WHERE message_text = E'Olá, seja muito bem-vindo(a) 😊\n\nSou a assistente virtual do Rafael Ferreira e vou te ajudar a verificar se sua conta de luz tem perfil para economia.\n\nEscolha uma das opções abaixo 👇';

-- 2) Boas-vindas longa (Rafael Ferreiras / 700 mil)
UPDATE bot_flow_steps SET message_text = E'Oi, {{nome}}! Tudo bem? 😊\n\nAqui é o *{{representante}}*, da *iGreen Energy*. 💚\n\nJá somos mais de *700 mil clientes* no Brasil economizando todo mês na conta de luz — tem gente economizando *R$ 70, R$ 100*, e quem gasta mais (*R$ 900 a R$ 1.200*) economiza ainda mais.\n\nE o melhor:\n\n✅ *Sem custo* nenhum\n✅ *Sem obra* nem instalação\n✅ Continua recebendo a sua *conta normal*, só que com *até 20% de desconto*\n\nPosso te explicar *rapidinho* como funciona? 👇'
WHERE message_text = E'Oi, {{nome}}! Tudo bem? 😊\n\nAqui é o *Rafael Ferreiras*, da *iGreen Energy*.\n\nJá somos mais de *700 mil clientes* no Brasil economizando todo mês na conta de luz — tem gente economizando R$ 70, R$ 100, e quem gasta mais (R$ 900, R$ 1.200) economiza ainda mais.\n\nE o melhor: *sem custo nenhum, sem obra, sem instalação*. Você continua recebendo a sua conta normal, só que com até *20% de desconto*.\n\nPosso te explicar rapidinho como funciona?';

-- 3) Apresentação Rafael (pede nome)
UPDATE bot_flow_steps SET message_text = E'Olá, tudo bem? 😊\n\nAqui é o *{{representante}}*. Pra eu já te chamar pelo nome aqui — *como você se chama*?'
WHERE message_text = 'Olá, tudo bem? Eu me chamo Rafael. Qual que é o seu nome para mim tá adicionando aqui?';

-- 4) "Vou te explicar rapidinho como funciona"
UPDATE bot_flow_steps SET message_text = 'Vou te explicar *rapidinho* como funciona 👇'
WHERE message_text = 'Vou te explicar rapidinho como funciona 👇';

-- 5) "Claro! Te explico de novo"
UPDATE bot_flow_steps SET message_text = E'Claro! 😊\n\nTe explico *de novo*, é bem simples 👇'
WHERE message_text = 'Claro! Te explico de novo, é bem simples 👇';

-- 6) "É simples — vou te mandar um áudio..."
UPDATE bot_flow_steps SET message_text = E'É *simples*, {{nome}}! 🎧🎬\n\nVou te mandar um *áudio* e um *vídeo curtos* aqui pra ficar bem fácil de entender.'
WHERE message_text = 'É simples — vou te mandar um áudio e um vídeo curtos pra ficar mais fácil de entender.';

-- 7) Como funciona (versão curta padrão)
UPDATE bot_flow_steps SET message_text = E'Funciona assim, {{nome}} 👇\n\nVocê continua recebendo a conta da sua *distribuidora normal* — só que agora ela vem com *até 20% de desconto* todo mês.\n\n✅ Sem obra\n✅ Sem instalação\n✅ Sem mexer na fiação\n\nÉ *100% online* e leva só alguns minutinhos. 💚\n\nPosso já fazer a sua *simulação* com o valor da sua conta?'
WHERE message_text = E'Funciona assim, {{nome}}: você continua recebendo a conta da sua distribuidora normal — só que a iGreen entra com *até 20% de desconto* todo mês.\n\nSem obra, sem instalação, sem mudar fiação. 💚\n\nQuer que eu já faça a simulação com o valor da sua conta?';

-- 8) Como funciona (versão B com checkmarks)
UPDATE bot_flow_steps SET message_text = E'Funciona assim, {{nome}} 👇\n\nVocê continua recebendo a energia da sua *distribuidora normalmente* — só que agora ela vem com *até 20% de desconto* todo mês.\n\n✅ Sem obra\n✅ Sem instalação\n✅ Sem mexer na fiação\n✅ Sem mudar nada na sua casa\n\nÉ só uma *troca de fornecedor* de energia, *100% online*. 💚\n\nPosso já fazer a sua *simulação*?'
WHERE message_text = E'Funciona assim, {{nome}}: você continua recebendo a energia da sua distribuidora normalmente — só que a iGreen entra com *até 20% de desconto* todo mês.\n\n✅ Sem obra\n✅ Sem instalação\n✅ Sem mexer em fiação\n✅ Sem mudar nada na sua casa\n\nÉ só uma troca de fornecedor de energia, 100% online. 💚';

-- 9) "Deu para entender..."
UPDATE bot_flow_steps SET message_text = E'Deu pra entender como funciona? 😊\n\nBora fazer o seu *cadastro*?\n\nÉ *rapidinho* — e 100% online. 🚀'
WHERE message_text = E'Deu para entender como funciona agora ?\n\nVamos fazer seu cadastro?\n\nÉ rapidinho\n';

-- 10) Resumindo (1️⃣...5️⃣)
UPDATE bot_flow_steps SET message_text = E'Resumindo pra ficar bem claro, {{nome}} 👇\n\n1️⃣ Você *não paga nada* pra entrar — é *100% gratuito*.\n\n2️⃣ *Não tem fidelidade* — pode sair quando quiser, sem multa.\n\n3️⃣ Sua conta continua chegando da sua *distribuidora normal*.\n\n4️⃣ Todo mês ela vem com *até 20% de desconto* aplicado.\n\n5️⃣ É energia *limpa e renovável* — você ainda ajuda o meio ambiente. 🌱\n\nFaz sentido pra você? 💚'
WHERE message_text = E'Resumindo pra ficar bem claro, {{nome}}:\n\n1️⃣ Você *não paga nada* pra entrar — é 100% gratuito.\n2️⃣ *Não tem fidelidade* — pode sair quando quiser, sem multa.\n3️⃣ Sua conta continua chegando da sua distribuidora, normal.\n4️⃣ Todo mês vem com *até 20% de desconto* aplicado.\n5️⃣ É energia *limpa e renovável* — você ainda ajuda o meio ambiente. 🌱\n\nFaz sentido pra você?';

-- 11) "Então bora fazer seu cadastro"
UPDATE bot_flow_steps SET message_text = E'Então bora fazer seu *cadastro*, {{nome}}? 🚀\n\nÉ *rapidinho* e 100% online. Vou precisar só de *2 coisinhas*:\n\n📄 Uma *foto da sua conta de luz* (qualquer mês recente)\n🪪 Uma *foto de um documento com foto* (RG ou CNH)\n\nPode me mandar a *foto da conta de luz* agora? 📸'
WHERE message_text = E'Então bora fazer seu cadastro, {{nome}}? 🚀\n\nÉ *rapidinho* e 100% online. Eu vou precisar só de 2 coisas:\n\n📄 Uma *foto da sua conta de luz* (qualquer mês recente)\n🪪 Uma *foto de um documento com foto* (RG ou CNH)\n\nPode me mandar a foto da conta de luz agora?';

-- 12) Perguntar valor (variações)
UPDATE bot_flow_steps SET message_text = E'{{nome}}, me conta uma coisa 👇\n\nQual é o *valor médio* da sua conta de luz hoje?\n\n(pode mandar só o número, ex.: *350*)'
WHERE message_text IN (
  '{nome}, qual o valor médio da sua conta de luz?',
  '{{nome}}, qual o valor médio da sua conta de luz?',
  '{{nome}}, qual o valor médio da sua conta de luz hoje?'
);

-- 13) Pedir conta (curto)
UPDATE bot_flow_steps SET message_text = E'📸 Agora me envia uma *foto da sua conta de luz*, por favor.\n\nPode ser a *fatura do mês atual* ou a anterior — qualquer uma serve. 💚'
WHERE message_text = 'Me envia uma foto da sua conta de luz, por favor 📸';

-- 14) Pedir conta (d_pedir_conta)
UPDATE bot_flow_steps SET message_text = E'Perfeito! 🙌\n\n📸 Me envia agora uma *foto da sua conta de luz* (fatura do mês atual ou a anterior).\n\nAssim eu já calculo *na hora* quanto você pode economizar todo mês. 💚'
WHERE message_text = 'Perfeito! Me envia uma *foto da sua conta de luz* (pode ser a fatura do mes atual ou a anterior) que eu já calculo na hora quanto você pode economizar 💚';

-- 15) Pedir documento (curto)
UPDATE bot_flow_steps SET message_text = E'🪪 Agora me manda uma *foto de um documento com foto*:\n\n• *RG* (frente e verso) ou\n• *CNH* (frente)\n\nPode mandar como imagem mesmo que eu identifico aqui. 📸'
WHERE message_text = 'Agora me manda um documento com foto (RG ou CNH) 🪪';

-- 16) Pedir documento (d_pedir_documento)
UPDATE bot_flow_steps SET message_text = E'Show, {{nome}}! 🙌\n\nPra finalizar, preciso de *mais uma foto*:\n\n🪪 *RG* (frente e verso) ou *CNH* (frente)\n\nPode mandar como imagem mesmo que eu identifico aqui. 📸'
WHERE message_text = 'Show! Pra finalizar preciso de uma foto do seu *RG (frente e verso)* ou *CNH (frente)*. Pode mandar como imagem mesmo que eu identifico sozinha 📸';

-- 17) Resultado da simulação
UPDATE bot_flow_steps SET message_text = E'Pronto, {{nome}}! 🎉\n\n💡 Sua conta hoje: *R$ {{valor_conta}}*\n💚 Economia estimada: *{{economia_range}}* por mês\n\nE o melhor:\n\n✅ Sem obra\n✅ Sem instalação\n✅ *Mesma* distribuidora\n\nBora fazer seu *cadastro agora*? 🚀'
WHERE message_text = E'Pronto, {{nome}}! 🎉\n\nSua conta hoje é de *R$ {{valor_conta}}*.\n\nVocê pode ter de *{{economia_range}}* de redução todos os meses — sem obra, sem instalação, continuando com a mesma distribuidora.\n\nVamos cadastrar agora?';

-- 18) Finalizar cadastro (link)
UPDATE bot_flow_steps SET message_text = E'🚀 Pra finalizar, é só preencher seus dados aqui:\n\n👉 {link_cadastro}\n\nLeva *menos de 2 minutos* e seu desconto já entra na *próxima conta*. 💚'
WHERE message_text = 'Pra finalizar, é só preencher seus dados aqui: {link_cadastro}';

-- 19) Finalizar (OTP)
UPDATE bot_flow_steps SET message_text = E'Tudo certo, {{nome}}! ⏳\n\nEstou enviando seu cadastro pro *portal da iGreen* agora.\n\n📲 Em alguns instantes você vai receber um *código de verificação* aqui no WhatsApp.\n\nQuando chegar, é só *digitar o código aqui mesmo* que eu finalizo a parte da selfie pra você. 🙌'
WHERE message_text = E'Tudo certo! Estou enviando seu cadastro para o portal da iGreen ⏳\n\nVocê vai receber um *código de verificação* aqui no WhatsApp em alguns instantes — quando chegar, *digite o código aqui mesmo* que eu finalizo a parte da selfie 📲';

-- 20) Handoff humano
UPDATE bot_flow_steps SET message_text = E'Beleza! 🙌\n\nJá chamei o *{{representante}}* aqui pra você.\n\nEm *instantes* ele te responde por aqui mesmo. 💬'
WHERE message_text = 'Beleza! Já avisei o Rafael Ferreira aqui pra você. Em instantes ele te responde 🙌';

-- 21) Texto solto "Você passa a consumir energia limpa..."
UPDATE bot_flow_steps SET message_text = E'Você passa a consumir *energia limpa* no lugar da energia comum — e por isso ganha o *desconto todo mês* na sua conta. ⚡💚\n\nA *distribuidora continua a mesma* e a conta chega no aplicativo *iGreen Club*.\n\nE ainda tem *desconto na farmácia*, restaurantes e outros estabelecimentos parceiros. 🛒'
WHERE message_text = E'\nVocê passa a consumir essa energia limpa no lugar da energia comum — e por isso ganha o desconto todo mês na sua conta. A distribuidora continua a mesma, a conta  chega no aplicativo igreen club.  \n\nOnde voce vai tero desconto na farmacia enre outros estabelcimento⚡💚';


## O que vai mudar

Vou reescrever o `message_text` dos passos dos fluxos para o padrão **negrito nos pontos-chave + parágrafos curtos com linha em branco entre eles + emoji no início das frases-chave**, em todos os consultores.

Atinge tanto:
1. Os passos já gravados no banco (`bot_flow_steps`) — via UPDATE casado pelo texto atual (não pelo step_key, porque os UUIDs variam entre consultores).
2. Os templates do editor (`src/components/admin/flow-builder/flowTemplates.ts`) — pra qualquer fluxo novo já nascer formatado.

Nada de lógica, OCR, transitions, captures ou botões é tocado — só `message_text`.

## Antes × depois (amostra dos principais)

**Boas-vindas curta**

Antes:
```
Olá, seja muito bem-vindo(a) 😊
Sou a assistente virtual do Rafael Ferreira e vou te ajudar a verificar se sua conta de luz tem perfil para economia.
Escolha uma das opções abaixo 👇
```
Depois:
```
Olá, seja muito *bem-vindo(a)*! 😊

Sou a *assistente virtual* do {{representante}} e vou te ajudar a ver se a sua conta de luz tem perfil pra *economizar todo mês*. 💚

👇 Escolha uma das opções abaixo:
```

**Perguntar valor da conta**

Antes: `{nome}, qual o valor médio da sua conta de luz?`
Depois:
```
{{nome}}, me conta uma coisa 👇

Qual é o *valor médio* da sua conta de luz hoje?

(pode mandar só o número mesmo, ex.: 350)
```

**Como funciona (versão curta)**

Antes:
```
Funciona assim, {{nome}}: você continua recebendo a conta da sua distribuidora normal — só que a iGreen entra com *até 20% de desconto* todo mês.

Sem obra, sem instalação, sem mudar fiação. 💚

Quer que eu já faça a simulação com o valor da sua conta?
```
Depois:
```
Funciona assim, {{nome}} 👇

Você continua recebendo a conta da sua *distribuidora normal* — só que agora ela vem com *até 20% de desconto* todo mês.

✅ Sem obra
✅ Sem instalação
✅ Sem mexer na fiação

É *100% online* e leva só alguns minutinhos. 💚

Posso já fazer a sua *simulação* com o valor da sua conta?
```

**Pedir conta de luz (curto)**

Antes: `Me envia uma foto da sua conta de luz, por favor 📸`
Depois:
```
📸 Agora me envia uma *foto da sua conta de luz*, por favor.

Pode ser a *fatura do mês atual* ou a anterior — qualquer uma serve. 💚
```

**Pedir conta (versão d_pedir_conta)**

Antes: `Perfeito! Me envia uma *foto da sua conta de luz* (pode ser a fatura do mes atual ou a anterior) que eu já calculo na hora quanto você pode economizar 💚`
Depois:
```
Perfeito! 🙌

📸 Me envia agora uma *foto da sua conta de luz* (fatura do mês atual ou a anterior).

Assim eu já calculo *na hora* quanto você pode economizar todo mês. 💚
```

**Pedir documento (curto)**

Antes: `Agora me manda um documento com foto (RG ou CNH) 🪪`
Depois:
```
🪪 Agora me manda uma *foto de um documento com foto*:

• *RG* (frente e verso) ou
• *CNH* (frente)

Pode mandar como imagem mesmo que eu identifico aqui. 📸
```

**Pedir documento (versão d_pedir_documento)**

Antes: `Show! Pra finalizar preciso de uma foto do seu *RG (frente e verso)* ou *CNH (frente)*. Pode mandar como imagem mesmo que eu identifico sozinha 📸`
Depois:
```
Show, {{nome}}! 🙌

Pra finalizar, preciso de *mais uma foto*:

🪪 *RG* (frente e verso) ou *CNH* (frente)

Pode mandar como imagem mesmo que eu identifico aqui. 📸
```

**Resultado da simulação (d_resultado)**

Antes:
```
Pronto, {{nome}}! 🎉

Sua conta hoje é de *R$ {{valor_conta}}*.

Você pode ter de *{{economia_range}}* de redução todos os meses — sem obra, sem instalação, continuando com a mesma distribuidora.

Vamos cadastrar agora?
```
Depois:
```
Pronto, {{nome}}! 🎉

💡 Sua conta hoje: *R$ {{valor_conta}}*
💚 Economia estimada: *{{economia_range}}* por mês

E o melhor:

✅ Sem obra
✅ Sem instalação
✅ *Mesma* distribuidora

Bora fazer seu *cadastro agora*? 🚀
```

**Cadastrar (link)**

Antes: `Pra finalizar, é só preencher seus dados aqui: {link_cadastro}`
Depois:
```
🚀 Pra finalizar, é só preencher seus dados aqui:

👉 {link_cadastro}

Leva *menos de 2 minutos* e seu desconto já entra na próxima conta. 💚
```

**Finalizar / OTP (d_finalizar)**

Antes:
```
Tudo certo! Estou enviando seu cadastro para o portal da iGreen ⏳

Você vai receber um *código de verificação* aqui no WhatsApp em alguns instantes — quando chegar, *digite o código aqui mesmo* que eu finalizo a parte da selfie 📲
```
Depois:
```
Tudo certo, {{nome}}! ⏳

Estou enviando seu cadastro pro *portal da iGreen* agora.

📲 Em alguns instantes você vai receber um *código de verificação* aqui no WhatsApp.

Quando chegar, é só *digitar o código aqui mesmo* que eu finalizo a parte da selfie pra você. 🙌
```

**Handoff humano (d_handoff)**

Antes: `Beleza! Já avisei o Rafael Ferreira aqui pra você. Em instantes ele te responde 🙌`
Depois:
```
Beleza! 🙌

Já chamei o *{{representante}}* aqui pra você.

Em *instantes* ele te responde por aqui mesmo. 💬
```

**Resumo 1️⃣…5️⃣** — mantém o miolo, mas adiciona linha em branco entre cada item e fecha com call-to-action em negrito.

**"É simples — vou te mandar um áudio..."** → vira:
```
É *simples*, {{nome}}! 🎧🎬

Vou te mandar um *áudio* e um *vídeo curtos* aqui pra ficar bem fácil de entender.
```

**"Vou te explicar rapidinho como funciona 👇"** → vira:
```
Vou te explicar *rapidinho* como funciona 👇
```

**"Claro! Te explico de novo, é bem simples 👇"** → vira:
```
Claro! 😊

Te explico *de novo*, é bem simples 👇
```

**"Deu para entender como funciona agora? Vamos fazer seu cadastro? É rapidinho"** → vira:
```
Deu pra entender como funciona? 😊

Bora fazer o seu *cadastro*?

É *rapidinho* — e 100% online. 🚀
```

**"Olá, tudo bem? Eu me chamo Rafael..."** → vira:
```
Olá, tudo bem? 😊

Aqui é o *{{representante}}*. Pra eu já te chamar pelo nome aqui — *como você se chama*?
```

**"Você passa a consumir essa energia limpa..."** (texto solto) → vira:
```
Você passa a consumir *energia limpa* no lugar da energia comum — e por isso ganha o *desconto todo mês* na sua conta. ⚡💚

A *distribuidora continua a mesma* e a conta chega no aplicativo *iGreen Club*.

E ainda tem *desconto na farmácia*, restaurantes e outros estabelecimentos parceiros. 🛒
```

**Boas-vindas longa (Oi, {{nome}}! Tudo bem? ... Rafael Ferreiras / 700 mil clientes)** → reformatada com parágrafos curtos, negrito em "700 mil clientes", "R$ 70 a R$ 1.200", "sem custo nenhum", "20% de desconto", e CTA em negrito no final.

## Como executo

1. **Migration de DADOS** (`UPDATE bot_flow_steps SET message_text = $novo WHERE message_text = $antigo`) — um UPDATE por template antigo conhecido. ~20 UPDATEs. Sem `WHERE consultor_id = …`, então atinge todos os consultores que ainda têm o texto padrão. Textos que o consultor já customizou (qualquer divergência de caractere) ficam intactos.
2. **`src/components/admin/flow-builder/flowTemplates.ts`** — substituir as strings `message_text` dos templates pelas versões novas, mantendo a estrutura, `step_type`, `slot_key`, `transitions` e `captures` inalterados.
3. **Memória** — atualizar `mem://copy/discount-rate-20` (já existe) acrescentando link pra nova nota `mem://copy/flow-message-formatting` com as regras de formatação adotadas (negrito WhatsApp `*texto*`, linha em branco entre parágrafos, emoji no início das frases-chave, listas com `✅` ou `•`).

## Arquivos / objetos tocados

- Migration de dados: ~20 `UPDATE bot_flow_steps`.
- `src/components/admin/flow-builder/flowTemplates.ts` (edição de strings).
- `mem/copy/flow-message-formatting.md` (novo).
- `mem/index.md` (acrescenta referência).

Nada de schema novo, nada de RLS, nada de edge function, nada de UI. Zero risco pro runtime.

## O que NÃO faço neste PR

- Não toco `step_key`, `slot_key`, `transitions`, `captures`, `fallback`, `is_active`.
- Não mexo em variantes A/B/C/D/E em si — só no texto.
- Não sobrescrevo textos já personalizados (a UPDATE casa pelo texto antigo exato).
- Não mudo a lógica do IA livre, OCR, OTP, ou handoff.

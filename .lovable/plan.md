## Mudança de filosofia

O bot vira um **vendedor humano de verdade**. Sem botões no meio da conversa — eles existem **apenas em 3 momentos críticos** onde precisa de confirmação clara:
1. Confirmar dados da conta de energia (após OCR)
2. Confirmar dados do RG/CNH (após OCR)
3. Escolher tipo de documento (RG Novo / RG Antigo / CNH)

Em todo o resto, é conversa pura. O lead nunca deve perceber que é uma IA.

---

## Como vai soar

**Hoje (robô com botões):**
> 💡 Quer ativar o iGreen Club?
> [✅ QUERO] [❓ MAIS INFOS] [⏰ DEPOIS]

**Depois (humano de verdade):**
> Boa, Larissa! Com R$ 380 de conta dá pra economizar uns R$ 76 todo mês 💚
> 
> E ó, além da economia, você ainda entra no nosso clube — desconto em farmácia, mercado, posto… minha mãe usa direto kkk
> 
> Bora seguir? É rapidinho, só preciso de uma foto do seu RG ou CNH 📄

---

## Plano

### 1) Corrigir o nome trocado (bug do "Pedro" / "Larissa")
- `bot-flow.ts`: detectar reapresentação em qualquer mensagem (`/me chamo|meu nome é|sou (o|a)|aqui é (o|a)\s+\w+/i`) e **sobrescrever** `customer.name` mesmo se já houver nome salvo.
- Marcar `name_source = 'self_introduced'` (fonte mais confiável que `whatsapp_push`).
- No prompt do `ai-sales-agent`: "Se o lead disser outro nome na última mensagem, use o novo nome a partir de agora — não insista no anterior."

### 2) Tirar os botões do meio da conversa
**Manter botões apenas em:**
- `confirmando_dados_conta` (SIM / NÃO / EDITAR)
- `confirmando_dados_doc` (SIM / NÃO / EDITAR)
- `ask_tipo_documento` (RG Novo / RG Antigo / CNH)

**Remover botões de:**
- Boas-vindas / menu inicial → vira texto conversacional ("oi! tudo bem? eu sou a [nome do consultor]…")
- Pedido de foto da conta → texto natural ("me manda uma foto da sua conta de luz aí…")
- Qualquer "intermediário" do funil

### 3) IA conduz a venda 100% conversacional
Reescrever o `system_prompt` no `ai-sales-agent` para vendedor consultivo iGreen:

**Tom:**
- 100% humano, brasileiro, descontraído mas profissional
- Usa o primeiro nome do lead naturalmente (1x a cada 2-3 mensagens, não martela)
- Emojis com moderação (1 por mensagem, no máximo)
- Frases curtas (WhatsApp), no máximo 3 linhas
- Pode usar "kkk", "rs", gírias leves quando o lead for informal
- **Nunca** diz "sou um assistente", "sou IA", "como modelo de linguagem", etc.

**Estratégia de venda (progressiva, sem pressa):**
1. **Aquece** — pergunta o nome, depois quanto vem na conta, demonstra interesse genuíno
2. **Quantifica o ganho** — calcula economia (12% sobre o valor) e entrega o número de cara
3. **Empilha valor** — quando sentir abertura, menciona iGreen Club (farmácia, mercado, cashback) como bônus, **não como pitch**
4. **Pede a conta** quando o lead estiver curioso ("pra eu confirmar tua distribuidora e travar a economia exata, me manda uma foto da última conta")
5. **Só depois** pede RG/CNH ("agora pra fechar o cadastro, preciso de uma foto do teu documento")
6. **Quebra objeção** com empatia, nunca com script

**Regras anti-erro:**
- Nunca menciona valor/preço/comissão fora do que está no FAQ
- Se não sabe, fala "deixa eu confirmar isso com a equipe e te volto" + flag handoff
- Se o lead recusar a foto da conta → aceita só o valor digitado e segue
- Se o lead disser "vou pensar" → respeita ("tranquilo! qualquer coisa me chama") e despausa automaticamente quando ele voltar a falar

### 4) Despausa automática
Hoje quando `bot_paused = true` ele só sai por humano. Adicionar:
- Se `bot_paused_reason in ('lead_nao_pronto','lead_quer_pensar')` E o lead mandar nova mensagem → **despausa automaticamente** e a IA retoma a conversa do ponto onde parou (lendo o histórico).

### 5) Aceitar lead que não manda foto
- Se o lead recusar mandar a conta E já tiver dito o valor → segue para a fase de RG/CNH normalmente, salvando só o valor.
- A IA decide na hora se insiste 1x ("a foto me ajuda a travar o valor exato, mas se preferir seguimos só com a média") ou aceita.

### 6) Progressão de dados (sem etapa explícita)
Não cria step novo. A IA naturalmente, durante a conversa, já vai colhendo:
- Nome (qualificação)
- Valor da conta (qualificação ou OCR)
- Cidade/distribuidora (OCR ou pergunta casual)
- Telefone (já temos do WhatsApp)

Quando o lead aceitar seguir, **o único botão que aparece** é o de tipo de documento (RG/CNH) — porque ali precisa de input estruturado pro OCR.

---

## Detalhes técnicos

**Arquivos a editar:**

1. `supabase/functions/ai-sales-agent/index.ts`
   - Reescrever `system_prompt` base (vendedor humano, sem revelar IA, regras de tom)
   - Reforço sobre nome do lead (usar último nome dito)
   - Tool `pause_bot` aceita razão `lead_quer_pensar` mas a despausa é automática

2. `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
   - Adicionar `RE_SELF_INTRO` e sobrescrita de nome em qualquer step
   - Adicionar `RE_REFUSE_BILL` em `aguardando_conta` → vai para coleta de doc se já tiver valor; senão pede valor
   - Bloco de despausa automática no início do handler (se `bot_paused_reason in (...)` e lead mandou msg, seta `bot_paused = false` e segue)
   - **Remover envio de botões** dos steps `welcome`, `menu_inicial`, `pos_video` — substituir por mensagem texto que a IA pega o controle
   - **Manter** botões em `confirmando_dados_conta`, `confirmando_dados_doc`, `ask_tipo_documento`
   - Expandir `conversationalSteps` para incluir `aguardando_conta` quando a mensagem **não for** foto/PDF (perguntas livres no meio da espera ainda vão pra IA)

3. `supabase/functions/_shared/ai-sales-prompts.ts` (novo, opcional)
   - Centralizar o prompt do vendedor pra facilitar ajustes futuros sem mexer na função

**Sem mudanças de schema.**

**Deploy:** redeploy de `whapi-webhook` e `ai-sales-agent`.

---

## Fora de escopo
- Não muda OCR, portal-worker, OTP, MinIO
- Não muda o painel SuperAdmin
- Não cria embeddings/RAG (FAQ continua direto no prompt)
- Não treina modelo próprio
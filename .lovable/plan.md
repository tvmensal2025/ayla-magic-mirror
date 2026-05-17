# Plano: Fluxo do Lead Ponta a Ponta (sem quebrar o que já existe)

## 1. Diagnóstico atual (baseado nos logs da Aline)

Linha do tempo real (customer `766482df…`, fluxo do consultor `Aline`):

```text
20:55  Bot pergunta nome                          → Nome do cliente (pos 2)
20:56  Lead responde "Aline Pereira"
20:56  Bot pergunta valor da conta                → pos 3/4
20:58  Bot envia "Como funciona"                  → pos 6
21:02  Lead pergunta "Eu pago alguma coisa?"      → quebra de objeção (pos 7)
21:03  Bot: "Vamos fazer seu cadastro?"           → pos 8
21:03  Lead: "Sim"
21:03  Bot pede foto da conta de luz              → capture_conta (pos 9)
21:09  Lead envia foto
21:10  Bot pergunta "✅ SIM?" (confirmando_dados_conta)
21:10  Lead clica "✅ SIM"
21:10  ❌ Bot pergunta NOVAMENTE "Qual seu nome?" → REGRESSÃO ao passo 2
```

Mapa do fluxo custom da Aline:

```text
pos 2  message            Nome do cliente          ← regressão caiu aqui
pos 3  message            Qual o valor da conta
pos 4  message            Valor da conta
pos 6  message            Como funciona
pos 7  message            Quebra de objeção
pos 8  message            Deu para entender?
pos 9  capture_conta      Conta de energia
pos 10 capture_documento  Cadastro                 ← deveria ir pra cá
pos 11 finalizar_cadastro Confirmacao              ← passo final atual
```

**Causa da regressão:** após o `✅ SIM`, a correção do loop anterior em
`handlers/bot-flow.ts` (linhas 2349-2420) usa `_captureContaPos` para chamar
`findNextActiveFlowStep(afterPosition=9)` e cair em `capture_documento`.
A busca por `[post-confirm-conta]` nos logs da edge function não retorna
nada — ou seja, o código novo não chegou a executar no teste da Aline.
Hipóteses (a verificar em build):

1. O deploy do `whapi-webhook` não estava ativo no momento do teste.
2. Algum caminho alternativo (resolver pré-switch ou worker) reabriu o
   passo 2 antes do switch atingir `case "confirmando_dados_conta"`.

**O que NÃO está coberto hoje (objetivo desta plano):** após o lead concluir
a validação facial não existe nenhuma mensagem que explique que a aprovação
do cadastro pela iGreen leva 24 a 48h. O lead fica sem retorno claro.

## 2. Fluxo alvo (1 → fim, sem furos)

```text
1  Boas-vindas + nome             (Nome do cliente)
2  Valor da conta                  (pergunta + recebe valor)
3  Como funciona + quebra objeção  (3 mensagens informativas)
4  CTA cadastro                    ("Vamos fazer?")
5  capture_conta                   (foto/PDF da conta)
6  OCR + confirmando_dados_conta   (✅ SIM / NÃO / EDITAR)
7  capture_documento               (RG/CNH) ← passo seguinte ao SIM
8  finalizar_cadastro              (link do portal iGreen)
9  aguardando_otp                  (código SMS)
10 aguardando_facial               (link da selfie)
11 lead responde "PRONTO"          → facial_confirmed_at = now
12 NOVO: cadastro_em_analise       ← MENSAGEM 24-48h (foco deste plano)
13 complete                        (mensagem final do fluxo custom)
```

## 3. Mudanças propostas (mínimas, sem refactor)

### 3.1 Garantir que o SIM nunca volta para o passo "Nome"

- Confirmar deploy ativo do `whapi-webhook` com a guarda já escrita
  (`_captureContaPos` + `nextCustom.position <= _captureContaPos` ⇒ ignora).
- Adicionar fallback duro: se mesmo assim `nextCustom` resolver para um
  step do tipo `message` com posição **menor** que `capture_conta`,
  forçar `conversation_step = "aguardando_doc_auto"` e enviar o
  `DOC_FALLBACK` (já existe nas linhas 2382/2419).
- Acrescentar `console.log` `[post-confirm-conta]` no início do handler
  do SIM para confirmar nos logs que o caminho é executado.

### 3.2 Novo passo "cadastro_em_analise" (mensagem agradável de 24-48h)

Inserir entre `aguardando_facial` e `complete` em
`handlers/bot-flow.ts` (linhas 3434-3450):

- Quando o lead confirmar a selfie (`confirmou && link`):
  - manter `facial_confirmed_at = now`
  - mudar `conversation_step` para `cadastro_em_analise` (em vez de pular
    direto para `complete`)
  - enviar mensagem com tom acolhedor, ex.:
    > 🎉 *Validação facial confirmada!*
    >
    > Seu cadastro foi enviado para a equipe da *iGreen Energy*. 💚
    > A análise costuma levar entre *24 e 48 horas úteis*.
    >
    > Assim que for aprovado eu te aviso por aqui com os próximos
    > passos. Pode relaxar — daqui em diante é com a gente. ☀️
- Adicionar `case "cadastro_em_analise":` no switch para tratar mensagens
  do lead enquanto ele aguarda (responder algo educado tipo "estamos
  analisando, em breve te aviso"), sem voltar para `aguardando_conta`.
- Adicionar a string `"cadastro_em_analise"` em:
  - `LEGACY_STEPS` (linha 1860) — impede que o resolver pré-switch trate
    como step custom.
  - lista de steps "bloqueados" em `conversational/index.ts` (linha 66) —
    impede que o conversational reseta para boas-vindas.

### 3.3 Disparar a transição para `complete` apenas quando a iGreen aprovar

- Manter a lógica atual de `status = 'approved' | 'active'` (já há trigger
  `create_postsale_deal_on_approval` e `fb_trigger_purchase`).
- Adicionar pequeno gatilho na função `customer.status` → quando passar a
  `active`/`approved` **E** `conversation_step = 'cadastro_em_analise'`,
  o webhook `whapi-webhook` (ou um cron leve) envia a mensagem final do
  passo `finalizar_cadastro` do fluxo custom (já existe em
  `bot_flow_steps`) e seta `conversation_step = 'complete'`.
- Sem aprovação: o lead fica em `cadastro_em_analise` e responde tudo com
  a mensagem amigável de espera (sem loop, sem reset).

### 3.4 Limpeza do lead preso da Aline

Migration única para destravar o lead do teste:
- `customers.conversation_step = 'aguardando_doc_auto'`
  onde `id = '766482df-f231-4a40-b81c-cb527e10d6db'`.

## 4. Verificação (depois da implementação)

1. Resetar a conversa de teste (`reset_lead_conversation`).
2. Simular o fluxo completo no WhatsApp:
   - boas-vindas → valor → cadastro → conta → SIM → documento → portal →
     OTP → facial → "PRONTO".
3. Validar nos logs:
   - `[post-confirm-conta] next=passo_mp74oztd type=capture_documento`
   - `conversation_step = 'aguardando_doc_auto'` após SIM
   - `conversation_step = 'cadastro_em_analise'` após selfie
   - mensagem 24-48h enviada (tabela `conversations`)
4. Validar no banco que `facial_confirmed_at` é gravado e que o lead não
   volta para `aguardando_conta` em nenhum momento.

## 5. Arquivos que vão mudar

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
  (handler SIM + novo case `cadastro_em_analise` + lista LEGACY_STEPS)
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
  (lista de steps legados)
- 1 migration de unstick para o lead da Aline.

Sem mudanças na UI do `/admin/fluxos`, sem mexer no fluxo já configurado
do consultor — a nova mensagem 24-48h é hardcoded no handler (igual à
mensagem atual de "Cadastro concluído"), então não exige reconfiguração
no Flow Builder.

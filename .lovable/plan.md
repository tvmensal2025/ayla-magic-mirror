
## Análise completa do atendimento (customer 225cabb8 — Sirlene 5511973125846)

Cruzei `customers`, `conversations`, `bot_flow_steps`, `consultants`, `whatsapp_instances` e os logs do `whapi-webhook`. São **3 bugs reais e independentes** — não é o mesmo problema de antes.

### 1) Aviso de novo lead NÃO chegou no 5511989000650

- `consultants.notification_phone = 5511989000650` ✅ configurado certo.
- Customer foi criado novo às 18:58:11 (linha 286 do `whapi-webhook/index.ts`), então o branch que dispara `notifyNewLead` (linha 322) **foi executado**.
- Causa raiz: o helper `_shared/notify-consultant.ts → sendRawToAlertNumber` envia **via Evolution** (`/message/sendText/{instance_name}`), mas:
  - `whatsapp_instances` desse consultor está `status='needs_reconnect'` e o canal ativo hoje é **Whapi**, não Evolution.
  - A chamada para Evolution falha silenciosamente (`res.ok=false`) e o `.catch` só loga warning.
- Resultado: notificação nunca chega. Já era assim antes da última rodada — o gatilho foi corrigido, mas o **transporte continua errado**.

### 2) Passo "Boas Vindas" (position=3, `6226f6f3`) foi pulado

Sequência real:
```
18:58:19 OUT "Qual seu nome para eu adicionar aqui?"   step_logged=flow:6226f6f3 (Boas Vindas)
18:58:33 IN  "Sirlene"
18:58:42 OUT "Sirlene, qual o valor médio da sua conta?" step=3e7fb4cd (position 4)
```

O bot mandou a pergunta do passo 2 (`Nome do cliente`) e marcou `conversation_step = flow:6226f6f3` (Boas Vindas, position 3, que tem áudio/vídeo configurados). Quando a Sirlene respondeu "Sirlene", o engine **pulou direto** para position=4 (valor da conta) sem disparar a mídia do Boas Vindas.

Causa: o resolver custom que adicionamos (no `switch (step)` de `bot-flow.ts`) trata steps `message` assumindo que **qualquer resposta avança pro próximo**. Mas quando o passo atual ainda tem mídia/conteúdo **não enviado** (caso do Boas Vindas, que foi só "marcado" como next mas nunca executado), ele precisa **disparar o conteúdo do step atual antes** de avançar.

### 3) "200 mais ou menos" ignorado → bot pediu para repetir 2×

```
18:59:03 IN  "200 mais ou menos"
18:59:08 OUT "Pode me responder, por favor? 🙂"          (5s depois!)
18:59:19 IN  "Sim"
18:59:23 IN  "200"
18:59:24 OUT "Pode me responder, por favor? 🙂"
19:00:53 OUT "Vou explicar como funciona, ok?"           (avança só 1m50s depois)
```

Causa raiz em `_shared/captureExtractors.ts → extractValor`:
```ts
const moneyHint = /r?\$|\breais?\b|\bconta\b|\bluz\b|\bvalor\b|\bpila\b|\bmangos?\b|\bcontos?\b/i.test(t);
const bareNumber = /^\s*\d{2,5}(?:[.,]\d{1,2})?\s*(?:reais?|pila|...)?\s*$/i.test(t);
if (moneyHint || bareNumber) { ... }
```
- "200 mais ou menos" → `moneyHint=false` (não tem $/reais/conta), `bareNumber=false` (tem texto extra). Retorna `null`.
- "200" sozinho → `bareNumber=true`. **Deveria ter funcionado**, mas o handler já estava no fluxo de nudge/buffer e a próxima execução do bot consolidou só depois.

Além disso, o nudge "Pode me responder, por favor?" dispara **5 segundos** depois da mensagem do lead e **sem checar** se o que ele mandou **continha um número plausível** quando o contexto é claramente uma pergunta de valor. Falta um fallback "estamos perguntando valor, então tente extrair qualquer número 30–50000 da mensagem".

---

## Plano de correção (tudo no Whapi, sem mudar schema)

### A. Notificação de novo lead via Whapi (não Evolution)

`supabase/functions/_shared/notify-consultant.ts`:
- Reescrever `sendRawToAlertNumber` para detectar o canal ativo do consultor:
  - Primeiro tentar **Whapi** usando o mesmo helper que `bot-flow.ts` usa (`sendText` do `whapi.ts`/`_helpers.ts`) — porque já está conectado e enviando para clientes.
  - Só cair em Evolution se Whapi não estiver disponível.
- Manter dedup de 60s. Logar canal usado.
- Sem mudança no `whapi-webhook/index.ts` — o gatilho já está correto.

### B. Não pular passos `message` com mídia pendente

`supabase/functions/whapi-webhook/handlers/bot-flow.ts`, no resolver custom (logo antes do `switch (step)` ~linha 1845) e no handler de `step_type=message`:
- Quando `conversation_step` aponta para um step `message` que **ainda não foi emitido** (sem registro outbound recente em `conversations` para esse `conversation_step`), disparar `dispatchStepFromFlow(step)` **antes** de avançar.
- Só avançar para o próximo `position` depois que o step atual realmente entregou mídia/texto.
- Critério de "já emitido": consulta a `conversations` por `customer_id` + `conversation_step` + `message_direction='outbound'` nos últimos N minutos (ou flag em memória/lock por step).

### C. extractValor mais tolerante + fallback contextual

1. `supabase/functions/_shared/captureExtractors.ts → extractValor`:
   - Adicionar expressões "mais ou menos", "uns", "cerca de", "aproximadamente", "uns X", "umas X" ao `moneyHint` (já são pistas de quantia).
   - Aceitar número seguido de texto qualquer quando vier do contexto "valor da conta" (ver item 2).

2. `bot-flow.ts`, no handler do step `Qual o valor` (`3e7fb4cd` no caso) / `aguardando_conta` / step `message` que perguntou valor:
   - Se `extractValor` falhar, tentar fallback **permissivo**: primeiro número entre 30 e 50000 na mensagem do lead. Se achar, aceita e avança.
   - Só dispara o nudge "Pode me responder" se **não houver nenhum dígito** na resposta E após **≥ 30s sem resposta** (não 5s).
   - Anti-duplicação do nudge: não disparar 2× para o mesmo `conversation_step` em < 60s.

### D. Backstop anti-trava no value capture

- Se o lead já mandou 2 mensagens no mesmo step de valor sem ser entendido, abrir handoff para humano (`notifyHandoff`) ao invés de continuar pedindo. Hoje o lead fica preso.

---

## Arquivos alterados

- `supabase/functions/_shared/notify-consultant.ts` — enviar via Whapi com fallback Evolution.
- `supabase/functions/_shared/captureExtractors.ts` — `extractValor` aceita "200 mais ou menos", "uns 300", "cerca de 450".
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — não pular `message` com mídia pendente; fallback permissivo de número no step de valor; nudge com debounce e threshold de tempo; handoff após 2 falhas seguidas no mesmo step.

Sem mudança de schema.

## Validação

1. Reler trechos editados e confirmar que: (a) `sendRawToAlertNumber` chama Whapi quando há `whatsapp_instances` Whapi-vinculada; (b) `extractValor("200 mais ou menos") === 200`; (c) step `message` com mídia nunca é pulado.
2. Adicionar testes em `bot-flow_test.ts`:
   - "lead em step `message` Boas Vindas responde → mídia do step é emitida ANTES de avançar"
   - "lead responde '200 mais ou menos' em step de valor → bill_value=200, avança para próximo passo, NÃO envia nudge"
3. Conferir nos logs do `whapi-webhook` após próximo lead de teste:
   - `[notify-new-lead] enviado via whapi para 5511989000650`
   - `emitStep step=6226f6f3` (Boas Vindas) aparecendo entre nome e valor.

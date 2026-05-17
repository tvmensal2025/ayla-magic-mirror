
## Diagnóstico (lead Bruna — `06a3ed56-…04b`)

Linha do tempo real (tabela `conversations`):

```
04:51:57  OUT  aguardando_conta            "Me manda foto da conta…"
04:52:54  IN   aguardando_conta            [arquivo conta]
04:53:25  IN   confirmando_dados_conta     "✅ SIM"
                                           ⛔ silêncio de 2min30s
04:55:55  IN   aguardando_doc_auto         "Oi"  ← cliente teve que cutucar
04:56:03  OUT  aguardando_doc_auto         "Me envie a foto do RG ou CNH…"
```

E mais cedo houve **repetição** do mesmo passo do flow:

```
04:43:24  OUT  a71ba814 "Vou explicar como funciona, perai"
04:48:04  IN   "Okay"
04:49:09  OUT  a71ba814 "Vou explicar como funciona"   ← repetiu
04:49:45  OUT  559b8f1b "Deu para entender…"
04:50:09  IN   "Pode ser"
04:50:46  OUT  559b8f1b "Deu para entender…"           ← repetiu
```

### Causa raiz #1 — Dispatch silencioso após "SIM" da conta

Em `bot-flow.ts` (case `confirmando_dados_conta`, linhas 2178-2197):

1. Chama `findNextActiveFlowStep(..., stepTypeIn: ["capture_documento", "capture_doc", "finalizar_cadastro"])`.
2. No fluxo desse consultor (`0c2711ad-…`) o próximo passo é `passo_mp74oztd` (`capture_documento`) — confirmado no banco.
3. Chama `dispatchStepFromFlow("passo_mp74oztd", _vars)`.
4. Esse step está cadastrado em `bot_flow_steps` mas com `message_text` vazio e **não tem nenhuma mídia em `ai_media_library`** para esse slot (consulta retornou `[]`).
5. `dispatchStepFromFlow` monta `items=[]`, o loop não envia nada, retorna `false` silenciosamente.
6. Mesmo assim o código marca `__inline_sent = true` e seta `conversation_step = "aguardando_doc_auto"` → bot fica mudo esperando a próxima mensagem do cliente.

Quando o cliente manda "Oi", aí sim cai no case `aguardando_doc_auto` (linha 2258) que tem o texto hardcoded e finalmente pede o documento.

O mesmo risco existe nas chamadas legacy (linhas 2193-2194) para `pitch_conexao_club` e `duvidas_pos_club`.

### Causa raiz #2 — Repetição do mesmo step

O step `a71ba814` foi disparado às 04:43:24 e re-disparado às 04:49:09 após o cliente responder "Okay". O dispatcher de flow não checa se o `step_key` em questão já foi enviado recentemente, então qualquer reentrada no caminho re-envia o mesmo bloco. O mesmo aconteceu com `559b8f1b` depois do "Pode ser".

---

## Plano de correção

### 1. `dispatchStepFromFlow` precisa avisar quando não enviou nada

Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (função em ~L702).

- Já retorna `boolean`. Vamos usar o retorno no call-site.
- Quando o step não tem `message_text` nem mídias válidas, logar `[dispatch:${stepKey}] EMPTY — sem texto e sem mídia` e retornar `false`.

### 2. Fallback obrigatório no "SIM" da conta

Arquivo: `bot-flow.ts`, case `confirmando_dados_conta` (~L2149-2213).

- Capturar o retorno: `const ok = await dispatchStepFromFlow(nextCustom.step_key, _vars);`
- Se `ok === false` **e** o próximo step é `capture_documento`/`capture_doc`: enviar imediatamente o prompt hardcoded
  `"Show! Pra finalizar seu cadastro, me manda só uma foto da *frente do seu documento* 📄\n\nPode ser RG ou CNH — eu reconheço automaticamente qual é."`
  via `sendText` + `insert conversations(step="aguardando_doc_auto")`.
- Se `ok === false` e o próximo é `finalizar_cadastro`: enviar `"✅ *Todos os dados foram preenchidos!*\n\n1️⃣ Finalizar\n\n_Digite *1* ou *FINALIZAR* para concluir:_"`.
- Aplicar a mesma checagem no ramo legacy (`pitch_conexao_club`/`duvidas_pos_club`): se ambos retornaram `false`, mandar o prompt de doc.

### 3. Anti-repetição por `step_key` recente

Em `dispatchStepFromFlow` (mesma função):

- Antes de montar `items`, consultar a última mensagem outbound dessa conversa:
  ```ts
  const { data: lastOut } = await supabase
    .from("conversations")
    .select("conversation_step, created_at")
    .eq("customer_id", customer.id)
    .eq("message_direction", "outbound")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  ```
- Se `lastOut?.conversation_step === stepKey` e `Date.now() - new Date(lastOut.created_at).getTime() < 10 * 60_000` (10 min), pular: `console.log("[dispatch:${stepKey}] skip — já enviado há <10min"); return true;`
- Isso elimina os re-disparos vistos em `a71ba814` e `559b8f1b`.

### 4. Aviso operacional no admin

Adicionar log estruturado (já existe `console.warn`) quando o dispatcher detectar step custom sem conteúdo. Sem mudança de UI — só facilita debug futuro pelos logs de edge function.

### 5. Recuperar o lead atual (Bruna)

O lead já avançou para `aguardando_facial`. Não precisa de ação extra de fluxo — basta o `/retry-facial-link` planejado anteriormente para o envio do link, que já está implementado no worker-portal.

---

## Arquivos a alterar

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
  - Função `dispatchStepFromFlow` (anti-repetição + log de vazio)
  - Case `confirmando_dados_conta` (capturar retorno + fallback hardcoded)

Nenhuma alteração de UI, banco ou worker. Só edge function.

## Detalhes técnicos

- `findNextActiveFlowStep` continua o mesmo — o problema é a ausência de conteúdo no step, não a busca.
- A janela anti-repetição de 10 min é conservadora: cobre cliente respondendo lento sem bloquear reentradas legítimas (ex.: cliente envia foto ruim e o flow precisa reagir com outro step).
- Os textos fallback usam exatamente as strings que já existem no código (case `duvidas_pos_club` L2237 e `aguardando_doc_auto` L2260) → mantém o tom da Camila.

## Critérios de aceitação

1. Em novo lead com mesmo consultor, após `✅ SIM` da conta o bot envia o pedido de documento em ≤3s, sem o cliente precisar mandar "Oi".
2. Steps `a71ba814` / `559b8f1b` não são disparados duas vezes seguidas em <10 min.
3. Logs `[dispatch:*] EMPTY` aparecem quando o flow tem step sem conteúdo (sinaliza configuração para o admin).

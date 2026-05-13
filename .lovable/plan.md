## Diagnóstico — o que realmente está acontecendo

Olhei `whapi-webhook/handlers/bot-flow.ts`, `ai-sales-agent/index.ts`, os logs recentes e o estado atual da tabela `customers` / `ai_decisions`. Os três problemas que você sentiu têm causas diferentes e somadas:

### 1. "A IA mandou vídeo e depois msg errada"
Logs `ai_decisions` (seu número 5511989000650 / Rafael):

```
23:11:53  user="Como funciona?"  → send_media (vídeo "2. Como Funciona")
23:12:48  user="Cadastrar"       → send_media (vídeo "2. Como Funciona") ❌
```

Quando você digitou **"Cadastrar"** logo após o vídeo, a IA mandou **o mesmo vídeo de novo** em vez de chamar `advance_to_closing`. Causas:
- A regra "cadastrar = sinal de compra" só existe no **switch determinístico** (`menu_inicial`/`pos_video`), mas o bloco da IA roda **antes** do switch e intercepta tudo enquanto `step ∈ {welcome, menu_inicial, pos_video, aguardando_humano}`. Resultado: a palavra "cadastrar" nunca chega ao código que avança o cadastro — fica nas mãos do LLM, que pode (e errou) mandar mídia.
- O guard de cadência (`recentMediaCount >= 2 → não enviar mídia`) só dispara a partir da **terceira** mídia consecutiva. Duas seguidas passa.
- Não há *cooldown por media_id* — o LLM repetiu a mesma mídia que acabou de mandar.

### 2. "IA está maluca confirmando dados de outra pessoa"
Estado atual do seu registro no banco:

```
phone=5511989000650
name="PAULO ROBERTO FIGUEIREDO"   ← OCR de uma conta antiga
name_source="unknown"             ← não confiável
electricity_bill_photo_url=NOT NULL ← foto antiga ainda anexada
conversation_step=NULL            ← cai em "welcome"
sales_phase="descoberta"
ocr_done=false
bot_paused=false
```

O `loadContext` da `ai-sales-agent` então monta o bloco `[CONTA JÁ RECEBIDA E ANALISADA]` com **titular Paulo Roberto** + bill anexado. O system prompt manda "confirme os dados e siga para handoff — PROIBIDO pedir conta de novo, PROIBIDO send_media". Aí você responde "Não sou eu" / "Não conheço" e a IA pede desculpas, mas **não tem ferramenta para resetar o lead** — fica num loop tentando re-qualificar com o `electricity_bill_photo_url` ainda preso, e o hard-guard da função impede até voltar pro fluxo normal de coleta.

Causa raiz: quando um número é reutilizado (ou o webhook reaproveita o `customer` antigo em vez de criar um novo), a IA herda OCR/foto/nome de um lead anterior e fica confusa.

### 3. "Quando o cliente fala 'cadastrar', a IA não inicia o cadastro"
Mesma causa do item 1 + item 2: enquanto houver `electricity_bill_photo_url` no registro, a função tem um *hard guard* que devolve `request_handoff` em qualquer `send_media` e o LLM fica preso em "confirme os dados". Sem foto, o LLM **deveria** chamar `advance_to_closing` ao ver "cadastrar/quero/vamos lá", mas isso depende inteiramente de o modelo acertar — não tem fallback determinístico.

---

## Plano de correção (em camadas, para nunca falhar)

### Camada 1 — Intent override determinístico (antes da IA)
Em `whapi-webhook/handlers/bot-flow.ts`, **antes** do bloco `if (useSalesAi)`:

- Detectar **intents fortes** no texto do usuário com regex:
  - **cadastrar / quero participar / quero me cadastrar / vamos lá / como faço / como cadastro / quero o desconto** → forçar `conversation_step = "aguardando_conta"`, devolver msg pedindo a foto da conta e **pular a IA**.
  - **falar com humano / atendente / pessoa real** → forçar `aguardando_humano` + handoff.
  - **resetar / recomeçar / começar de novo / nova conta / não sou eu / esses dados não são meus** → resetar OCR (`name=null, electricity_bill_photo_url=null, ocr_done=false, distribuidora=null, numero_instalacao=null, electricity_bill_value=null, sales_phase='abertura', qualification_score=0`) e voltar para `welcome`.
- Esses overrides garantem que a palavra-chave funciona **independente** do humor do LLM.

### Camada 2 — Limpeza de contexto poluído
No `whapi-webhook/index.ts`, ao reaproveitar um `customer` existente:
- Se o último inbound for >7 dias atrás **ou** se o `name_source` não está em `{ocr, self_introduced, manual}` mas há `name` preenchido, limpar campos derivados antes de rodar o bot (mesmo set do reset acima).
- Adicionar um helper `resetLeadIdentity(supabase, customerId)` reutilizável (export do `_shared/conversation-helpers.ts`).

### Camada 3 — Guarda contra "está no nome de X"
Em `ai-sales-agent/index.ts`, no bloco `billStatusBlock`:
- Só montar `[CONTA JÁ RECEBIDA E ANALISADA]` se **`ocr_done = true` E `name_source ∈ {ocr, self_introduced, manual}`**. Se `ocr_done=false` ou nome não confiável, tratar como **sem conta** e deixar o fluxo natural pedir/processar.
- Adicionar nova ferramenta `reset_lead` que o LLM pode chamar quando o usuário diz "não sou eu" / "isso não é meu". Implementação no webhook: limpa OCR e volta para `welcome`.
- No system prompt, instruir explicitamente: "Se o lead negar ser o titular dos dados, chame `reset_lead`."

### Camada 4 — Anti-spam de mídia
Em `ai-sales-agent/index.ts`:
- Reduzir o gatilho anti-spam de `recentMediaCount >= 2` para **>= 1** (uma mídia consecutiva já bloqueia a próxima).
- Adicionar **cooldown por `media_id`**: pegar últimas 5 entries de `ai_decisions` com `media_sent_id` e marcar essas IDs como "JÁ ENVIADAS — não repita" no `mediaListLine`. Se o LLM ainda escolher uma já enviada, fazer fallback para `send_text` na própria função (validação adicional após o tool call).
- Forçar fallback `send_text` quando `tool === "send_media"` e o último outbound também foi mídia (mirror do guard, mas determinístico no servidor).

### Camada 5 — Bypass da IA quando o estado já avançou
No bloco `if (useSalesAi)` do `bot-flow.ts`:
- Se `customer.electricity_bill_photo_url` está setado **e** `ocr_done=true` **e** `name_source` é confiável, **não chamar a IA** — ir direto pro switch determinístico (`confirmando_dados_conta` / próximo step). Hoje a IA é chamada mesmo nesse caso e fica refém das próprias regras de "handoff obrigatório".
- Se `customer.bot_paused=true`, não chamar a IA (já existe parcialmente — confirmar).

### Camada 6 — Higiene operacional
- Resetar **agora** o registro do Rafael (5511989000650) para `welcome` limpo (apagar `name`, `electricity_bill_photo_url`, etc.) para destravar o teste.
- Adicionar log estruturado (`jsonLog`) de toda decisão da IA com `customer_id`, `step_before`, `tool`, `media_id`, `score_delta` — facilita auditoria futura.
- Adicionar teste manual rápido via `supabase--curl_edge_functions` simulando webhook com `body="cadastrar"` em estado `welcome` para validar override.

---

## Detalhes técnicos (para o build)

### Arquivos editados
| Arquivo | Mudança |
|---|---|
| `supabase/functions/whapi-webhook/handlers/bot-flow.ts` | Intent override (Camada 1), bypass condicional da IA (Camada 5) |
| `supabase/functions/whapi-webhook/index.ts` | Limpeza de contexto poluído (Camada 2) |
| `supabase/functions/evolution-webhook/index.ts` | Mesma limpeza de contexto (paridade) |
| `supabase/functions/_shared/conversation-helpers.ts` | Export `resetLeadIdentity()` + regex de intents fortes |
| `supabase/functions/ai-sales-agent/index.ts` | Guarda `name_source` confiável, nova tool `reset_lead`, cooldown por `media_id`, anti-spam ≥1 |
| migration SQL | (nenhuma — todos os campos já existem) |

### Pseudocódigo do intent override
```ts
const text = (messageText || "").toLowerCase().trim();
const RE_CADASTRAR = /\b(cadastr|quero (me )?(cadastr|participar)|vamos l[áa]|como (eu )?(fa[çc]o|cadastr)|quero o desconto|bora|simbora)\b/i;
const RE_HUMANO   = /\b(humano|atendente|pessoa real|operador|consultor)\b/i;
const RE_RESET    = /\b(n[ãa]o sou eu|esses dados n[ãa]o s[ãa]o meus|recome[çc]ar|come[çc]ar de novo|outra conta|nova conta|resetar)\b/i;

if (text && !isFile && !isButton) {
  if (RE_RESET.test(text)) { await resetLeadIdentity(supabase, customer.id); /* forçar welcome */ }
  else if (RE_CADASTRAR.test(text) && !customer.electricity_bill_photo_url) {
    return { reply: "📋 Ótimo! Envie agora a *foto ou PDF da sua conta de luz* para começarmos.", updates: { conversation_step: "aguardando_conta" } };
  }
  else if (RE_HUMANO.test(text)) {
    return { reply: `🧑 Vou te conectar com a equipe de ${nomeRepresentante}.`, updates: { conversation_step: "aguardando_humano", bot_paused: true, bot_paused_reason: "lead_pediu_humano" } };
  }
}
```

### Reset SQL imediato (Camada 6)
```sql
UPDATE customers SET
  name=NULL, name_source='unknown',
  electricity_bill_photo_url=NULL, ocr_done=false,
  distribuidora=NULL, numero_instalacao=NULL,
  electricity_bill_value=NULL, address_city=NULL, address_state=NULL,
  conversation_step='welcome', sales_phase='abertura',
  qualification_score=0, bot_paused=false, bot_paused_reason=NULL
WHERE phone_whatsapp='5511989000650';
```

### Riscos / mitigação
- Intent override pode capturar falso positivo ("vou pensar em me cadastrar depois") → regex usa `\b` + verbos de ação; mitigado.
- `reset_lead` pode ser usado em excesso pelo LLM → limitar a 1 reset por hora por customer (checar `ai_decisions` recentes).
- Bypass da IA quando bill+ocr presentes pode pular pitch — mas nesse estado o lead já está em fechamento, então é o comportamento correto.

### Validação (não fechar tarefa sem)
1. Curl simulando webhook com `text="cadastrar"` em estado fresco → `conversation_step` deve virar `aguardando_conta`.
2. Curl com `text="não sou eu"` em estado contaminado → registro limpo, volta a `welcome`.
3. Curl com duas mídias consecutivas via `ai_decisions` → terceira chamada cai em `send_text`.
4. Conferir nos logs `whapi-webhook` que a IA **não** é chamada quando bill+ocr+name confiável.
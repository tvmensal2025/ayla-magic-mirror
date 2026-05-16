## Diagnóstico — de onde vem o texto e por que não segue o fluxo

### 1. Onde está o texto "Show, Rafael! 💚 Sua conta de R$ 385,62…"

Não é IA. É **texto hardcoded** com variáveis interpoladas dentro do código do webhook:

**Arquivo:** `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
**Linha:** 1770

```ts
const economiaMsg = valor >= 30
  ? `Show, ${v.trim().replace(/,$/, "")}! 💚\n\nSua conta de *R$ ${_fmtBRL(valor)}/mês* cabe certinho na economia:\n→ até *R$ ${_fmtBRL(_mensal)}* por mês no seu bolso\n→ até *R$ ${_fmtBRL(_anual)}* por ano (desconto de até 20%)\n\nE ainda entra no *Conexão Club* — até 70% de desconto em farmácia, mercado, posto e várias parceiras. Minha mãe usa direto kkk`
  : `Show, ${v}dados confirmados! 💚…`;
```

Logo abaixo (linhas 1782–1830) o código busca o **vídeo** do slot `conexao_club` em `ai_media_library` e envia.
Em seguida (linha 1838) outro texto hardcoded: `"${firstNm}, ficou alguma dúvida sobre o Conexão Club…"`.

### 2. Por que o fluxo configurado em /admin/fluxos é ignorado neste step

Esse trecho (case `confirmando_dados_conta` → transição para `pitch_conexao_club`) **não chama** o dispatcher genérico de mídia. Outros steps usam:

- `getStepMediaOrder(supabase, consultantId, stepKey)` → lê `consultants.flow_step_media_order[stepKey]`
- Itera `bot_flow_qa_media` / `ai_media_library` (slot_key) na ordem configurada (text, audio, image, video, document)
- Helpers: `sendStepMedia` em `conversational/index.ts:339` e o loop em `bot-flow.ts:586-660`

O `pitch_conexao_club` foi escrito **inline** e ignora completamente:
- O texto configurado em `bot_flow_qa.text_response` para esse step
- O áudio configurado (slot ou `media_id`)
- A imagem configurada
- A ordem definida em `flow_step_media_order["pitch_conexao_club"]`

Resultado: o bot sempre manda **texto hardcoded → vídeo → texto hardcoded**, nunca text→audio→video→image como você definiu.

### 3. Onde o admin salva o fluxo (referência)

- Tabela `bot_flow_qa` (campo `text_response` = texto exato)
- Tabela `bot_flow_qa_media` (lista ordenada de mídias com `media_kind`, `slot_key`, `media_id`, `position`)
- Tabela `consultants.flow_step_media_order` (jsonb com ordem por step)
- Tabela `ai_media_library` (mídia em si: url, kind, duration, slot_key)

---

## Plano de correção

### Mudança única em `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

Substituir o bloco hardcoded do case `confirmando_dados_conta` (linhas ~1759-1848) por uma chamada ao dispatcher genérico que:

1. Lê `bot_flow_qa` onde `step_key = 'pitch_conexao_club'` para pegar `text_response` **exato** configurado no admin (com substituição de `{nome}`, `{valor}`, `{economia_mensal}`, `{economia_anual}`).
2. Lê `bot_flow_qa_media` desse QA, monta a lista de itens.
3. Adiciona o texto como item de tipo `text`.
4. Ordena pela ordem configurada em `flow_step_media_order["pitch_conexao_club"]`, com fallback `["text","audio","video","image","document"]` (a regra que você definiu).
5. Envia cada item na ordem, com `sleepForMedia` entre eles e `canSendMediaOnce` para não duplicar.
6. Não envia mais o texto hardcoded "Ficou alguma dúvida…" — esse passa a ser outro QA configurável (step `duvidas_pos_club`) ou um trailing nudge curto.

### Garantias

- Se não houver `bot_flow_qa.text_response` configurado, **não** envia texto (em vez de cair no hardcoded). Assim o painel /admin/fluxos vira a única fonte da verdade.
- Mantém a regra "não repetir vídeo/áudio para o mesmo cliente" via `canSendMediaOnce`.
- Mantém a ordem **text → audio → video → image** como default global, e respeita a override por step se houver.

### Variáveis disponíveis para o texto configurado

Documentar (no painel ou em comentário) as chaves substituíveis no `text_response`:
- `{nome}` → primeiro nome do cliente
- `{nome_completo}` → nome completo
- `{valor}` → valor da conta formatado pt-BR
- `{economia_mensal}` → 20% do valor, formatado
- `{economia_anual}` → 12 × economia mensal, formatado
- `{representante}` → nome do consultor

### Verificação após o deploy

1. Configurar em /admin/fluxos no step `pitch_conexao_club`: 1 texto + 1 áudio + 1 vídeo + 1 imagem.
2. Disparar um cadastro de teste no WhatsApp e confirmar a conta.
3. Conferir nos logs do `whapi-webhook` e na conversa que chega exatamente: texto configurado → áudio → vídeo → imagem (nessa ordem) — sem o "Show, Rafael 💚" hardcoded e sem duplicar vídeo.

### Detalhes técnicos

- Não mexer no `_shared/step-media-order.ts` nem em `sendStepMedia` — eles já fazem o trabalho.
- Reaproveitar o loop já existente em `bot-flow.ts:586-660` (extrair para função `dispatchStepFlow(step, customer, ctx)` e chamar tanto no QA matching quanto no novo `pitch_conexao_club`).
- Manter `updates.conversation_step = "duvidas_pos_club"` e `__inline_sent = true` ao final para não acionar o reply padrão.
- O case `pitch_conexao_club:` autônomo (linha 1867, fallback) também deve usar o dispatcher novo.

### Fora de escopo (não fazer agora)

- Compressão de vídeo (assunto Easypanel/ffmpeg).
- Fila Redis (combinado para depois do fluxo end-to-end estabilizar).
- Mudar outros steps hardcoded — fazer só este primeiro, validar, e depois replicar o padrão.

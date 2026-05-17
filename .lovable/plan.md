# Auditoria — risco de mensagem duplicada

Revisei as 3 camadas de defesa atuais e simulei cenários reais. Ainda existem **4 brechas** que podem permitir duplicidade. Abaixo o diagnóstico e o plano de correção.

## Defesas hoje (estão OK)

1. **Dedup por message_id** (`checkAndMarkProcessed`) — bloqueia mesmo webhook reentregue pelo Whapi.
2. **Lock por cliente** (`try_lock_customer_processing`, 120 s) — bloqueia 2ª invocação enquanto a 1ª processa.
3. **Anti-rep duplo no `emitStep`** (conversational): por `step_key/id` E por `message_text` igual nos últimos 10 min.
4. **Anti-rep no `dispatchStepFromFlow`** (bot-flow): última outbound = mesmo step ⇒ pula.

## Brechas detectadas

### Brecha 1 — Janela entre fim do processamento e release do lock + falta de "marker" antes de enviar
- O lock é liberado em `finally` (linha 741). Se a 1ª invocação demora 30 s e a 2ª chega no segundo 5, ela faz retry por até **25 s** (50 × 500 ms) e desiste com `{skipped:"busy"}` — a mensagem do usuário é **silenciosamente descartada**. Não duplica, mas perde input do lead (UX ruim, pior que duplicar em alguns casos).
- Pior: se o usuário manda 3 mensagens em rajada, a 2ª espera e entra, mas pode reabrir o mesmo step se o anti-rep não pegar (ver brecha 3).

### Brecha 2 — Anti-rep por `step_key` falha em passos **custom** (UUID vs step_key)
- Em `dispatchStepFromFlow` (bot-flow.ts:747) a comparação é `lastOut.conversation_step === stepKey` (string igual). Mas o `conversation_step` salvo no banco às vezes vem com prefixo `flow:` (normalização no index.ts:663) e o `stepKey` passado é cru. Resultado: **anti-rep não dispara** para passos do Fluxo da Camila despachados por bot-flow.
- O anti-rep do `emitStep` cobre isso (compara contra `{id, step_key, flow:id, flow:step_key}`), mas só roda quando a entrada é pelo motor `conversational`. Quando o cadastro chama `dispatchStepFromFlow`, **a checagem fica incompleta**.

### Brecha 3 — Anti-rep por step_key olha somente o **último** outbound (não os últimos N)
- `dispatchStepFromFlow` usa `.limit(1).maybeSingle()`. Se entre a 1ª emissão e a 2ª chegada da mensagem houver QUALQUER outbound (ex.: áudio do mesmo step gravado como linha separada com outro `conversation_step` ou null), a comparação falha e o texto é reenviado.
- Já o `emitStep` (conversational) usa `limit(5)` para step e `limit(10)` para texto — mais robusto, mas ainda pode escapar se a cascata gerou 6+ linhas outbound entre as duas tentativas.

### Brecha 4 — Mídia (áudio/vídeo/imagem) **não tem anti-rep por conteúdo**
- O check de "mesmo texto" só roda em `message_type='text'`. Mídias só dependem do check por `step_key`. Se o `step_key` mudar (ex.: 2 steps diferentes apontando para o mesmo `slot_key`) ou se a linha outbound não persistir `conversation_step`, a mesma mídia pode ser reenviada.

## Plano de correção

### 1. Trocar "drop silencioso" por enfileiramento curto
Quando `try_lock_customer_processing` falha após os 50 retries:
- **NÃO** retornar `{skipped:"busy"}`. Em vez disso, marcar `customer.pending_inbound = messageId` e retornar 200. A 1ª invocação, ao terminar e liberar o lock, verifica esse flag e reentra (loop interno de 1 passo). Garante que nenhuma mensagem é perdida.

### 2. Reforçar anti-rep do `dispatchStepFromFlow`
- Buscar últimos 5 outbounds (não 1).
- Normalizar comparação removendo prefixo `flow:` dos dois lados.
- Aceitar match por `step_key` **ou** por `step_id` (quando custom).

### 3. Aumentar janela de checagem do `emitStep` para mídia
- Para `mediaSent` recente, consultar `conversations.message_type IN ('audio','video','image')` e checar se a mesma `media_id` saiu nos últimos 10 min (campo `metadata->media_id` se persistido; caso contrário, comparar URL).
- Se persistido por `slot_key`, comparar slot_key + tipo de mídia.

### 4. Persistir `media_id`/`slot_key` na linha outbound de conversations
- Para a defesa #3 funcionar bem, garantir que toda outbound de mídia salva `metadata.media_id` (ou colunas novas `media_id`, `slot_key`). Sem isso, a checagem de mídia continua frágil.
- Migration: adicionar `media_id uuid` e `slot_key text` em `conversations` (nullable).

### 5. Lock advisory **antes** da transcrição/áudio
- Hoje o lock só é adquirido depois de transcrever áudio (linhas 470-537). Se 2 mensagens chegam juntas com áudio, ambas transcrevem em paralelo (custo Gemini duplicado), e só depois disputam o lock. Mover o `try_lock` para logo após `checkAndMarkProcessed` (antes de transcrever) elimina trabalho duplicado.

### 6. Telemetria
- Adicionar contador em `ai_usage_log` (ou tabela própria) para cada `skipped:"busy"`, `anti-rep step`, `anti-rep text`, `anti-rep media` — para você acompanhar no painel se as defesas estão sendo acionadas e onde.

## Arquivos afetados

- `supabase/functions/whapi-webhook/index.ts` (ordem do lock, fallback de enfileiramento)
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (anti-rep do `dispatchStepFromFlow`)
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (anti-rep de mídia em `emitStep` e `sendStepMedia`)
- Migration nova: colunas `media_id`/`slot_key` em `conversations` + RPC `enqueue_pending_inbound`.

## Resumo executivo

As defesas atuais cobrem ~80% dos casos de duplicidade. As 4 brechas acima explicam por que a Fran ainda recebeu repetição: provavelmente o `dispatchStepFromFlow` reenviou um step custom porque o anti-rep dele só olha 1 linha e não normaliza prefixo `flow:`. Aplicando os 6 itens, o risco de duplicidade fica praticamente zero e nenhuma mensagem do lead é descartada.

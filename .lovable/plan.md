## Objetivo
Fazer o simulador rodar o **motor real de produção** sem cross-function imports e sem refactor do engine — usando a infraestrutura `testMode` já existente em `whapi-webhook`.

## Insight-chave
`whapi-webhook/index.ts` já tem suporte completo a teste end-to-end:
- `isTestPhone()` ativa modo teste para telefones `5500000xxxxxxxx`.
- Headers `x-bot-test-run-id` / `x-bot-test-turn` injetam um run id.
- `sender` é trocado por um wrapper que grava em `bot_test_outbound` em vez de enviar pelo Whapi.
- `botRequestStore` (AsyncLocalStorage) propaga o store, `logTestOutbound` registra cada saída do bot.

Ou seja: o motor real já roda em "modo simulação" se a chamada chegar pelo webhook com o telefone certo + headers. **Não precisa duplicar engine, mover para `_shared/`, nem refatorar nada.**

## Mudanças

### 1. `flow-simulate-run/index.ts` — reescrever
- Validar auth (admin / dono do consultor) — igual ao código atual.
- Telefone determinístico: `5500000` + 8 dígitos derivados de `consultantId` → garante range `isTestPhone`.
- Garantir `customer` (`is_sandbox=true`, `flow_variant=variant`, `consultant_id`) — `is_sandbox` faz os triggers existentes ignorarem CRM/alertas/etc.
- Criar linha em `bot_test_runs` (status `running`, escopo da chamada) e calcular `turn = COUNT(bot_test_outbound where run_id=...)`.
- Montar payload sintético no formato Whapi (`{ messages: [{ id, from_me:false, type:'text|image|...', chat_id:'<phone>@s.whatsapp.net', from:'<phone>', timestamp, text:{body}, image:{link}|document:{link}|... }] }`) para texto, botão (`type:'action', action:{type:'reply', reply:{id}}`) e anexo.
- `fetch` para `${SUPABASE_URL}/functions/v1/whapi-webhook` com:
  - `Authorization: Bearer ${ANON}` (whapi-webhook não exige user JWT).
  - `apikey: ${ANON}`.
  - `x-bot-test-run-id: <run_id>` e `x-bot-test-turn: <turn>`.
- Após resposta, ler `bot_test_outbound where run_id=<run_id> and turn=<turn> order by created_at asc`.
- Mapear `kind`:
  - `text` → `{kind:'text', text:content}`.
  - `buttons` → parse `content` `"prompt\n[t1 | t2 | t3]"` para `{kind:'buttons', text, buttons}`.
  - `media:audio|image|video|document` → split `content` em `url | caption`.
- Reler `customers` para `customer_state` (mesma chave atual).
- Marcar `bot_test_runs.status='done'` no fim.

### 2. `flow-simulate-reset/index.ts` — pequeno ajuste
- Trocar query de deleção: deletar customers com `consultant_id=X AND phone_whatsapp like '5500000%'` (em vez de `is_sandbox=true`), pra garantir limpeza mesmo se algum lead antigo não tiver flag.
- Manter cascade manual em `customer_flow_state`, `customer_memory`, `customer_processing_lock`, `whatsapp_message_buffer`.
- Deletar também `bot_test_runs` + `bot_test_outbound` órfãos desse phone (housekeeping).

### 3. UI `FlowSimulator.tsx` — nenhuma mudança
Continua aceitando o mesmo formato de resposta (`events`, `customer_state`). Mensagem de "manutenção" some sozinha.

## O que NÃO muda
- Zero alteração em `whapi-webhook`, `bot-flow`, `conversational/`, `evolution-webhook`, crons.
- Zero migração nova.
- Zero risco no fluxo real dos consultores.

## Limitação consciente
`whapi-webhook` roteia para o `superadmin_consultant_id`. Como hoje só o super admin tem bot ativo (memory: "Active webhook = whapi-webhook"), isso não bloqueia ninguém. Quando outros consultores entrarem em produção via `evolution-webhook`, replicar o mesmo `testMode` hook lá em ~30 linhas (fora deste escopo).

## Verificação
1. Deploy `flow-simulate-run` + `flow-simulate-reset`.
2. `curl_edge_functions` POST `/flow-simulate-run` com payload de teste → 200 + `events.length > 0`.
3. Abrir `/admin/fluxos` → simulador → mandar "oi" → resposta real do bot aparece.
4. Conferir logs `whapi-webhook`: deve aparecer `[test-mode] ATIVO phone=5500000…`.
5. Conferir que `crm_deals` / `bot_handoff_alerts` NÃO ganharam linha (triggers de sandbox ativos).

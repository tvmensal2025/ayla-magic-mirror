## Objetivo
Evitar que o trigger de auto-feedback ensine a IA com falsos negativos quando o handoff for por detecção automática de loop (não por falha real da IA). E, de quebra, consertar uma função órfã que ficou referenciando tabela morta.

## Mudanças

### 1. Filtrar `auto_feedback_on_handoff` por `reason`
Atualizar a função para **só** marcar a `ai_decisions` como `down` quando o motivo do handoff indicar falha real da IA:

Reasons válidos (geram aprendizado):
- `low_confidence`
- `user_requested` / `cliente_pediu_humano`
- `faq_not_found` / `pergunta_sem_resposta`
- `repeated_failure`
- `ai_error`

Reasons ignorados (não geram aprendizado):
- `auto_loop_detected` — pode ser silêncio do cliente, retry, bug do detector
- `manual_global_pause` — admin pausou tudo
- qualquer outro não listado → ignorar (whitelist em vez de blacklist)

Implementação: adicionar `IF NEW.reason NOT IN (whitelist) THEN RETURN NEW; END IF;` no início da função.

### 2. Corrigir `reset_all_consultant_conversations`
Auditoria descobriu que essa função **ainda referencia `bot_flow_rule_fires`** (tabela já dropada). Se um super-admin chamar "resetar todas conversas do consultor", vai estourar erro `relation "bot_flow_rule_fires" does not exist`.

Solução: recriar a função removendo o `DELETE FROM bot_flow_rule_fires`.

## Detalhes técnicos
- Uma única migration faz as duas mudanças (DDL puro: `CREATE OR REPLACE FUNCTION` x2).
- Sem mudança de RLS, sem mudança de schema.
- Sem mudança em frontend nem edge functions.
- Trigger continua `AFTER INSERT` em `bot_handoff_alerts` — comportamento idêntico, só fica mais seletivo.

## Validação pós-deploy
1. Confirmar via `pg_get_functiondef` que ambas as funções estão atualizadas.
2. Confirmar que `reset_all_consultant_conversations` não menciona mais `bot_flow_rule_fires`.
3. Próximo `auto_loop_detected` que cair: verificar que `ai_decisions.feedback` NÃO foi populado (esperado).
4. Quando cair um handoff `low_confidence` ou `user_requested`: verificar que feedback foi gravado.

## Risco
Zero. Mudanças são puramente aditivas/corretivas em funções com `SECURITY DEFINER` já existentes.

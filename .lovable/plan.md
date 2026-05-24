
# Rollout Flow Engine V3 — implantação cuidadosa em 4 semanas

## O que está pronto vs o que falta

Verificado no código:

| Componente | Estado |
|---|---|
| `_shared/flow-engine/engine.ts` (`tick()`) | ✅ pronto + testes |
| `_shared/flow-engine/dispatcher.ts` (`dispatch()`) | ✅ pronto, suporta `delegate_legacy_runBotFlow` |
| `_shared/customer-flow-state.ts` (`loadFlowState`) | ✅ pronto |
| `_shared/feature-flag.ts` (`getFlowEngineV3`, `isV2Enabled`) | ✅ pronto, cache 30s |
| `_shared/customer-pause-filter.ts` | ✅ pronto, não usado pelos crons |
| Tabelas `customer_flow_state`, `bot_flow_steps_canonical`, view `v_flow_engine_health` | ✅ no banco |
| Bloco 7.6 do `evolution-webhook/index.ts` (linhas 1135-1163) | ⚠️ só loga, não chama `tick`/`dispatch` |
| Bloco equivalente no `whapi-webhook` (ATIVO em produção) | ❌ não existe |
| 4 crons leem `bot_paused` direto | ❌ `ai-followup-cron`, `bot-followup-checker`, `bot-loop-watchdog`, `bot-stuck-recovery` |

---

## Semana 1 — Código (executo agora ao aprovar)

### 1.1 Criar helper compartilhado `_shared/flow-engine/webhook-hook.ts`

Função única `runEngineV3IfEnabled()` que:

```text
1. Lê flag flow_engine_v3 do consultor (cache 30s).
2. Se 'off' → return { handled: false } (legado segue).
3. Carrega EngineCustomerState via loadFlowState.
4. Chama tick(state, input).
5. Se modo 'dark':
   - Loga engine_dark_decision com a action planejada.
   - return { handled: false }  (legado emite de verdade).
6. Se modo 'canary' ou 'on':
   - Chama dispatch(actions, { legacyRunBotFlow: hookFn }).
   - Se action = delegate_legacy_runBotFlow → return { handled: false }.
   - Caso contrário → engine emitiu, return { handled: true, reply, updates }.
7. Qualquer throw → log engine_v3_fallback_to_legacy + return { handled: false }.
   (Fail-open: erro no v3 NUNCA quebra fluxo.)
```

### 1.2 Cabear no `whapi-webhook/index.ts` (PRODUÇÃO)

Encontrar o ponto antes do `runBotFlow`/`runConversationalFlow` e adicionar:

```text
const v3 = await runEngineV3IfEnabled({ supabase, customer, consultantId, input });
if (v3.handled) {
  reply = v3.reply;
  updates = v3.updates;
} else {
  // caminho legado atual continua igual
}
```

Variável `engineV3Handled` controla early-return para evitar duplicação.

### 1.3 Espelhar no `evolution-webhook/index.ts`

Substituir bloco 7.6 atual (linhas 1135-1163) pela mesma chamada do helper. Garante paridade quando evolution virar ativo.

### 1.4 Migrar 4 crons para `customer-pause-filter.ts`

Em cada um, trocar:

```text
.eq('bot_paused', false)
.is('assigned_human_id', null)
```

por:

```text
.or(LEGACY_CAN_SEND_FILTER)
+ loop: await canSendToCustomer(supabase, customerId)
```

Arquivos:
- `supabase/functions/ai-followup-cron/index.ts`
- `supabase/functions/bot-followup-checker/index.ts`
- `supabase/functions/bot-loop-watchdog/index.ts`
- `supabase/functions/bot-stuck-recovery/index.ts`

### 1.5 Adicionar 2 cenários em `bot-e2e-runner`

- Cenário A: lead novo, v3='dark' → engine calcula sem emitir, legado emite.
- Cenário B: lead em capture_bill, v3='on' → engine emite, legado NÃO é chamado.

### 1.6 Salvar memória `mem://whatsapp/flow-engine-v3-rollout`

Documenta o que ficou cabeado, helper compartilhado, ordem dark→canary→on.

---

## Semana 2 — Ativar reliability_v2 e dark mode (eu faço via SQL ao seu comando)

Pré-requisito do v3 é v2 estar `on` (locks, idempotência, customer_flow_state).

```sql
-- Dia 1: dark em 1 consultor de teste
UPDATE consultants SET flow_reliability_v2='dark' WHERE id = '<id-teste>';

-- Dia 2 (se logs limpos): global
UPDATE consultants SET flow_reliability_v2='on';

-- Dia 3: engine v3 em dark em 1 consultor
UPDATE consultants SET flow_engine_v3='dark' WHERE id = '<id-teste>';
```

Gates para passar de dark → canary:
- Zero `engine_v3_state_load_failed` em 48h.
- Paridade ≥ 99% entre `engine_dark_decision` e decisão real do legado.
- Latência p95 do webhook ≤ baseline + 10%.

---

## Semana 3 — Canary 5%

```sql
UPDATE consultants SET flow_engine_v3='canary' WHERE id IN (<3-5 baixo volume + 1 alto>);
```

Monitorar via `v_flow_engine_health` por 7 dias:
- `conversion_rate` canary ≥ baseline − 2 pp.
- `deterministic_fallback_pct` ≤ 5%.
- `engine_delegate_legacy` ratio < 30%.
- Zero P1.

Rollback em 30s: `UPDATE consultants SET flow_engine_v3='off' WHERE id = '<problema>';`

---

## Semana 4 — Global e cleanup

```sql
UPDATE consultants SET flow_engine_v3='on';
```

Após 30 dias estável: marcar `customers.bot_paused` como deprecated (mantém coluna), remover branches `engine === 'sys'` mortas do legado.

---

## Critérios de "100%" (o que você pediu)

1. **Helper único** `webhook-hook.ts` — evita drift entre whapi e evolution.
2. **Fail-open** — qualquer bug no v3 cai no legado, nunca quebra produção.
3. **Idempotência** — `acquireOutboundSlot` já garante zero duplicação mesmo com whapi+evolution recebendo o mesmo webhook.
4. **Rollback em 30s** — feature flag tem cache 30s, mudar coluna no banco propaga sozinho.
5. **Testes** — 2 cenários no `bot-e2e-runner` cobrem ambos os modos.
6. **Crons coerentes** — todos lendo da mesma fonte (`customer-pause-filter`).
7. **Memória atualizada** — próxima sessão sabe o estado do rollout.

## O que NÃO entra nesta Semana 1

- Mudanças de SQL (só rodam nas Semanas 2-4 sob seu comando).
- Deprecation de `bot_paused` (só após 30 dias em `on`).
- Phase J (limpeza do legado) — só Semana 4+30 dias.

## Riscos identificados e mitigação

| Risco | Mitigação |
|---|---|
| Engine v3 emite + legado emite (duplicação) | `engineV3Handled` early-return + idempotência outbound |
| Helper carrega state de leads sem flow → throw | `loadFlowState` retorna `null`, fail-open trata |
| Cache 30s da flag deixa consultor "preso" no modo errado | Aceitável — em emergência, `UPDATE` + esperar 30s |
| whapi-webhook e evolution-webhook recebendo mesmo evento | Já tratado por idempotência existente |
| Helper compartilhado com bug afeta os dois webhooks | Testes E2E + fail-open garantem que legado segue |

## Tempo estimado

Semana 1 (código): 1 sessão de implementação (~6-8 edições de arquivo). Eu faço tudo em paralelo ao aprovar.

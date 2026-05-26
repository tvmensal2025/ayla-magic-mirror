# Phase 1 Runbook — flow-engine-v3-rewrite

Spec: `.kiro/specs/flow-engine-v3-rewrite`
Branch: `fix/flow-engine-v3-rewrite`
Production project: `zlzasfhcxcznaprrragl`

## Opening

| Campo | Valor |
| --- | --- |
| Janela aberta em | **2026-05-26 (UTC)** — observada via Supabase MCP |
| Super-admin id | `0c2711ad-4836-41e6-afba-edd94f698ae3` (Rafael Ferreira) |
| `consultants.use_engine_v3` | `true` |
| `consultants.flow_engine_v3` (coluna duplicada de outra spec) | `"off"` (ignorada por esta spec; documentada na migration) |
| Total de consultores com `use_engine_v3 = true` | **1** (somente o super-admin) |
| Variant D ativo | `320bf22c-e383-4f53-a3c0-b88b89b02558` ("Fluxo Whapi (botões)"), strict_mode=false, 10 steps, todos com fallback |
| Variants A/B | também ativos no super-admin (strict_mode=true) — **não rotear pra teste durante Phase 1**; foco é apenas Variant D |

### Edge functions ACTIVE (versões deployadas)

| Função | Versão |
| --- | --- |
| `evolution-webhook` | v562 |
| `whapi-webhook` | v521 |
| `bot-e2e-runner` | v242 |
| `migrate-engine-v3` | v3 |
| `flow-engine-rollout-cron` | v31 (legado, da spec antiga) |
| `flow-engine-v3-rollout-cron` | v2 (desta spec) |

Observação: existem duas funções de cron (`flow-engine-rollout-cron` e `flow-engine-v3-rollout-cron`). O daily report a observar é o `flow-engine-v3-rollout-cron` (v2). A função antiga continua em pé para não quebrar o cron existente — reconciliar antes da Phase 2.

### engine_logs

- Total de linhas: `0` no momento da abertura da janela.
- Tabela acessível e schema correto (`id, at, kind, customer_id, flow_id, step_id, payload, side_effect`).
- Como a v3 só serve o super-admin e ele ainda não recebeu inbound desde o flip, é esperado estar vazio.

### bot_handoff_alerts (super-admin)

- 39 alertas pendentes com `reason = 'engine_v3_migration'` e `metadata.source = 'migration'`.
- Origem: Task 35 (`migrate-engine-v3`), pausando leads em estado pré-UUID. Comportamento documentado.
- **Nestes alertas NÃO contam como violação G1–G6.** O cron v3 deve filtrá-los por `metadata->>'source' IS DISTINCT FROM 'migration'`.

## Smoke results

### bot-e2e-runner (V_D1, V_D2, V_A1, V_B1, AI1, AI2, SILENT)

**Não invocado nesta sessão.** A função exige JWT de admin autenticado (não service role). Para rodar:

```
# Pelo painel admin do app, autenticado como super-admin, abrir DevTools e:
await fetch(
  "https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/bot-e2e-runner",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`,
    },
    body: JSON.stringify({ scenario: "V_D1" }),
  },
).then((r) => r.json());
```

Cenários a rodar em ordem (cada um retorna `{ ok, status, summary.checks }`):

1. `V_D1` — Variant D com botão clicado dentro de 3 opções
2. `V_D2` — Variant D com botão fora das 3 opções (deve cair em fallback)
3. `V_A1` — Variant A media_order respeitado
4. `V_B1` — Variant B persuasive_text (sem áudio, sem transcrição)
5. `AI1` — `mode=ai_answer` responde dúvida fora do fluxo
6. `AI2` — `mode=ai` decide próximo step
7. `SILENT` — confirma que sem inbound não há outbound (G2 não deve disparar)

Critério: **todos retornam `ok: true`**. Qualquer `ok: false` → rollback imediato.

### Smoke real (telefone teste → Variant D do super-admin)

Ainda **não realizado**. Sequência sugerida:

1. Telefone teste manda "oi" no número Whapi do super-admin (não em produção de cliente real).
2. Conferir em até 30 segundos:
   - `SELECT * FROM engine_logs WHERE flow_id = '320bf22c-e383-4f53-a3c0-b88b89b02558' ORDER BY at DESC LIMIT 5;` → deve aparecer pelo menos uma linha `kind='engine_decision'` ou similar.
   - `SELECT * FROM bot_messages WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3' ORDER BY created_at DESC LIMIT 5;` → outbound enviado pela engine v3.
3. Clicar em um botão do Whapi para validar Variant D interativo.
4. Confirmar em `bot_handoff_alerts` que **nenhum alerta novo** foi criado (filtrar por `metadata->>'source' IS DISTINCT FROM 'migration' AND created_at > now() - interval '10 minutes'`).

## Metric gate to advance to Phase 2

Critérios verbatim do spec (T36):

- 0 duplicate outbounds (G1)
- 0 silent turns (G2)
- 100% transition match where applicable on smoke
- G1–G6 violation rate = 0 sustentado por 24h

A leitura é feita no relatório do `flow-engine-v3-rollout-cron` (que roda diário). Ler em ~24h, confirmar zero violações, então avançar para T37 (Phase 2 — 5 pilots, 7 dias).

## Rollback (se qualquer violação aparecer durante a janela de 24h)

```sql
UPDATE consultants
SET use_engine_v3 = false
WHERE id = '0c2711ad-4836-41e6-afba-edd94f698ae3';
```

Próximo inbound do super-admin volta para o caminho legacy (Requirement 11.4). Sem perda de dados; sem necessidade de redeploy.

Após rollback:
1. Abrir RCA no Sentry com payloads dos `engine_logs` e `bot_handoff_alerts` da janela.
2. Não avançar Phase 2 até a causa estar fechada e reaberta a Phase 1.

## Operator instructions for tomorrow (~24h após o flip)

1. Trigger ou aguardar o `flow-engine-v3-rollout-cron` rodar (cron diário em `supabase/config.toml`). Se quiser forçar:
   ```
   curl -X POST https://zlzasfhcxcznaprrragl.supabase.co/functions/v1/flow-engine-v3-rollout-cron \
     -H "Authorization: Bearer <service-role-jwt>"
   ```
2. Ler o relatório (a função grava em `engine_logs` com `kind='daily_report'` ou em uma tabela própria — checar a implementação em `supabase/functions/flow-engine-v3-rollout-cron/index.ts`).
3. Verificar:
   - G1 violation rate = 0
   - G2 violation rate = 0
   - G3 violation rate = 0
   - G4 violation rate = 0 (variant fidelity)
   - G5 violation rate = 0 (single channel of escalation)
   - G6 violation rate = 0 (strict mode honored)
4. Se todos 0 ⇒ editar `tasks.md` marcando T36 como `[x]`, abrir T37 (Phase 2 — 5 pilots por 7 dias). Selecionar 5 consultores: mix de Variants A, B, D e mix de baixo/alto volume. Documentar a escolha em `phase-2-runbook.md`.
5. Se qualquer violação > 0 ⇒ rollback acima + RCA + não avançar.

## Reconciliação a fazer antes da Phase 2

- **Decidir** entre `flow-engine-rollout-cron` (legado) e `flow-engine-v3-rollout-cron` (desta spec). Recomendação: deletar o legado em Phase 4 junto com o restante do cleanup destrutivo. Até lá, ambos coexistem.
- **Resolver os 39 handoff alerts pendentes** da migration (Task 35) antes da Phase 2 para que a Phase 2 comece com inbox limpa. Sugestão: marcar todos como `resolved_at = now()` quando o operador humano tiver assumido cada um.

## Referências

- Spec: `.kiro/specs/flow-engine-v3-rewrite/{requirements,design,tasks}.md`
- Migration: `supabase/migrations/20260526013928_engine_v3_schema.sql`
- Engine puro: `supabase/functions/_shared/flow-engine/v3-runner.ts`
- Loader: `supabase/functions/_shared/flow-engine/v3-loader.ts`
- Dispatcher: `supabase/functions/_shared/flow-engine/v3-dispatcher.ts`
- Router: `supabase/functions/_shared/flow-engine/router.ts`
- Hooks: `supabase/functions/_shared/flow-engine/hooks.ts`
- Webhooks delegados: `supabase/functions/{evolution-webhook,whapi-webhook}/index.ts`
- Cron v3: `supabase/functions/flow-engine-v3-rollout-cron/index.ts`
- Migration script: `supabase/functions/migrate-engine-v3/index.ts`
- Scenarios v3: `supabase/functions/bot-e2e-runner/v3-scenarios.ts`


## Pre-smoke fix aplicado em produção (26-mai-2026)

Antes da janela de smoke real, identifiquei 2 steps do Fluxo D do super-admin com schema legacy `{ "action": "retry", ... }` que o engine v3 ignora silenciosamente (o parser só lê `mode`). Isso causaria repeat infinito em vez de retry → handoff quando o lead errasse e-mail ou telefone.

### Steps corrigidos

| step_key | step_id | step_type |
| --- | --- | --- |
| `d_pedir_email` | `b1e1a001-d001-4001-9001-d00d00d00001` | `capture_email` |
| `d_confirmar_telefone` | `b1e1a002-d002-4002-9002-d00d00d00002` | `confirm_phone` |

### Fix aplicado (PostgREST PATCH com service role)

```json
// antes
{ "action": "retry", "then": "humano", "retry_text": "..." }

// depois
{ "mode": "retry", "then": "humano", "retry_text": "...", "max_retries": 2 }
```

### Validação

```sql
SELECT count(*) FROM bot_flow_steps
WHERE is_active = true AND fallback ? 'action' AND NOT (fallback ? 'mode');
-- → 0 (zero steps com schema legacy em todo o banco)
```

Os 2 steps do Fluxo D agora respondem ao engine v3 corretamente: lead errando e-mail/telefone até `max_retries=2` recebe `retry_text`, ao exceder é escalado pra humano via `then=humano` (handoff alert criado).

### Position 9 (`d_handoff`)

Não é gap real — o step existe mas está `is_active=false`, por isso não aparece nas queries que filtram por ativos. Mantido como está (handoff é tratado por `goto_special: "humano"` nos transitions, não por step explícito).


## Pós smoke 26-mai-2026 — gaps de integração fechados

Durante a sessão de validação foram encontrados e corrigidos 4 gaps de integração entre engine v3 e o resto do sistema:

### Gap A: dispatcher v3 não escrevia em `conversations`

Sintoma: ChatView do painel admin ficava vazio para leads servidos pela v3.

Fix: `v3-dispatcher.ts` agora persiste cada outbound em `conversations` (mesmo quando o adapter retorna `ok=false`, escreve com prefixo `[failed]` para audit). Persiste também o inbound recebido.

Arquivos: `supabase/functions/_shared/flow-engine/v3-dispatcher.ts`, `supabase/functions/_shared/flow-engine/v3-webhook-entry.ts`.

### Gap B: dispatcher v3 não escrevia em `bot_test_outbound`

Sintoma: simulador admin (`flow-simulate-run`) não mostrava as respostas da v3.

Fix: dispatcher agora aceita `testRunId` + `testTurn` e replica outbounds em `bot_test_outbound`. Webhook repassa quando recebe headers `x-bot-test-run-id` + `x-bot-test-turn`.

### Gap C: `customers.conversation_step` não era espelhado quando engine v3 atualiza `customer_flow_state`

Sintoma: legacy queries (ChatView, painéis, crons, reactivation) viam o step antigo após v3 transitionar.

Fix: nova migration `20260526104500_engine_v3_state_mirror.sql` cria função `mirror_customer_flow_state_to_customers` + trigger `trg_mirror_customer_flow_state` (AFTER INSERT OR UPDATE em `customer_flow_state`). Espelha `current_step_id`, `last_outbound_at`, `last_inbound_at`, `status` para `customers.*`.

### Gap D: webhook abortava em `manual_capture_text_saved_no_auto_flow` antes de chegar no engine

Sintoma: leads novos com `capture_mode=manual` (default do trigger `customers_default_capture_mode`) caíam no short-circuit do legado e o engine v3 nunca rodava.

Fix: `whapi-webhook` checa `isEngineV3Enabled` antes do short-circuit; se v3 está ON, pula. `v3-webhook-entry` força `capture_mode='auto'` antes de carregar contexto. `evolution-webhook` recebe a mesma assinatura.

### Gap E: variant A/D só renderizava buttons quando `step_type='ask_choice'`

Sintoma: welcome do Fluxo D do super-admin (`step_type='message'` com `_buttons` em captures) só emitia texto, sem opções.

Fix: `synthesizeFromStep` em `variants/a.ts` passa a emitir choice sempre que `choiceOptions.length > 0`, independente de `step_type`. Variant D continua sobrescrevendo `preferred` baseado em `capabilities`.

### Validação ponta-a-ponta (smoke real, customer não-sandbox)

| Validação | Resultado |
| --- | --- |
| webhook responde `mode=engine_v3, sent=2, failed=0` | ✅ |
| `engine_logs` populado com `engine_step_enter` + `engine_repeat` | ✅ |
| `customer_flow_state.current_step_id` aponta pro welcome | ✅ |
| `customers.conversation_step` espelhado pelo trigger | ✅ |
| `conversations` tem inbound + 2 outbounds (texto + buttons) | ✅ |
| Whapi adapter entrega via `sendChoice`/`sendText` | ✅ |

### Estado dos leads pré-migration (mantidos para humano)

- 41 customers pausados com `bot_paused_reason='engine_v3_migration'` permanecem **pausados**. Humanos assumem via o painel admin.
- 39 handoff alerts abertos para esses leads. **Não foram resolvidos automaticamente** — operadores devem revisar e fechar manualmente conforme atendem.

### Próximo passo

Tráfego REAL novo (leads que mandam "oi" pela primeira vez via Whapi do super-admin) agora passa pela engine v3 corretamente. Aguardar 24h, ler relatório do `flow-engine-v3-rollout-cron`, e validar G1–G6 = 0 antes de avançar para Phase 2.

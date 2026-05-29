# Plano novo — bot-engine-channel-unification

> Escrito após análise completa do código + dados reais via Supabase MCP.
> Substitui as 58 tasks restantes do `tasks.md` original.

## Validação dos pressupostos da spec original

Investigação dos 26 logs do V3 nos últimos 30 dias provou que **a métrica de
"23% de erro" era falso positivo do script de auditoria**:

| Tipo | Contagem | Classificação real |
|---|---|---|
| `engine_invalid_step` | 10 | 10/10 = `auto_cure_orphan_step` (V3 detectando legacy state com step "welcome" e curando para o UUID real do flow ativo). **Comportamento correto.** |
| `engine_no_match` | 10 | 10/10 = `expected_fallback_handled` (step `passo_mp8yc0bp` da Nilma com fallback `goto` configurado, V3 caindo no fallback como esperado). **Comportamento correto.** |
| `engine_handoff` | 6 | 4 `lead_pediu_humano` + 2 `retry_exhausted`. **Comportamento esperado.** |

**Erros reais do V3: 0/26.** O motor V3 não está quebrado.

## Estado atual confirmado

- **76 testes verdes** em `_shared/engine/__tests__/` + `_shared/channels/` + `_shared/pipeline-cadastro/__tests__/`
- **UI já existe** em `src/components/superadmin/RolloutPanel.tsx` (controla `flow_engine_v3` por consultor)
- **View já existe** em `v_flow_engine_health`
- **Modo `dark` atual** (em `webhook-hook.ts`): roda V3 em paralelo, loga `engine_dark_output`, **NÃO envia** outbound. Legacy responde.
- **Modo `'on'` atual** (em `router.ts`): V3 toma o turno via `runUnifiedEngineWebhookEntry` e **responde 100%**.
- **Modo `'canary'` atual**: NÃO É RECONHECIDO pelo `router.ts` — ele só checa `flag === 'on'`. Hoje canary = dark na prática.

## Tráfego nos últimos 30 dias

Apenas **1 consultor em `dark` tem volume**:

- **Nilma tavares** (id `0c2711ad-...`): 1007 leads, 397 inbound, 299 outbound
- Outros 11 consultores em `dark`: 0 inbound, 0 outbound (Sirlene tem 120 leads novos mas zero conversa)

**Implicação:** os 26 logs do V3 vieram TODOS da Nilma. A validação empírica é só dela. Promovê-la = primeira vez que V3 responde de verdade a um cliente real.

---

## Plano em 3 etapas

### Etapa 1 — Promover Nilma para `flow_engine_v3 = 'on'` controlado (1 dia + 7 dias observação)

**Por quê não usar `'canary'`:** o router atual ignora canary. Wirar
`resolveEngineDecisionWithCache` (Task 30) seria 1-2 dias de código novo
sem ganho proporcional. O caminho mais simples é flipar direto pra `'on'`
com kill switch pronto.

**Pré-requisitos (já verdes):**
- ✅ 76 testes passando
- ✅ V3 com 0 erros reais em 26 logs de produção
- ✅ UI de rollback pronta (`RolloutPanel.tsx`)
- ✅ View de saúde pronta (`v_flow_engine_health`)
- ✅ Sentry/audit em `webhook-entry.ts` (`fallThroughToHandoff` em qualquer erro)
- ✅ Cache de 30s na flag (rollback propaga em até 30s)

**Sequência (operacional):**

1. **Antes do flip** — capturar baseline de conversão da Nilma:
   ```sql
   SELECT
     date_trunc('day', created_at) AS day,
     count(*) AS leads,
     count(*) FILTER (WHERE conversation_step = 'complete') AS completed
   FROM customers
   WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
     AND created_at >= now() - interval '14 days'
   GROUP BY 1 ORDER BY 1;
   ```
   Salvar resultado em `_artifacts/nilma-baseline-pre-canary.json`.

2. **Flip** — via `RolloutPanel.tsx` no painel SuperAdmin (UI já existe), ou:
   ```sql
   UPDATE consultants SET flow_engine_v3 = 'on' WHERE id = '0c2711ad-...';
   INSERT INTO rollout_audit (consultant_id, flag_kind, from_state, to_state, reason)
   VALUES ('0c2711ad-...', 'flow_engine_v3', 'dark', 'on', 'canary_etapa_1');
   ```
   Cache propaga em até 30s, V3 toma o turno seguinte.

3. **Monitoramento (a cada 4h por 7 dias)** — query única:
   ```sql
   SELECT
     count(*) FILTER (WHERE kind = 'engine_step_enter') AS turns,
     count(*) FILTER (WHERE kind = 'engine_transition_match') AS advanced,
     -- Erros reais (excluindo auto-cura e fallback configurado):
     count(*) FILTER (WHERE
       kind = 'engine_invalid_step'
       AND NOT EXISTS (SELECT 1 FROM bot_flow_steps WHERE id::text = el.payload->>'reset_to')
     ) AS real_invalid,
     count(*) FILTER (WHERE
       kind = 'engine_no_match'
       AND step_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM bot_flow_steps s WHERE s.id = el.step_id
         AND s.fallback->>'mode' IN ('goto','ai','ai_answer','humano','retry')
       )
     ) AS real_no_match,
     count(*) FILTER (WHERE kind = 'engine_handoff' AND payload->>'reason' NOT IN ('lead_pediu_humano','retry_exhausted')) AS unexpected_handoff
   FROM engine_logs el
   JOIN customers c ON c.id = el.customer_id
   WHERE c.consultant_id = '0c2711ad-...'
     AND at >= now() - interval '4 hours';
   ```

4. **Critério de promoção (após 7 dias):**
   - `real_invalid + real_no_match` < 1% dos `turns`
   - Conversão diária (leads → `complete`) sem queda >10% vs baseline
   - Zero `unexpected_handoff`
   - Nenhum bug report do consultor

5. **Critério de rollback IMEDIATO:**
   - `real_invalid + real_no_match` > 5% em qualquer janela de 4h
   - Queda de conversão > 30% em 24h
   - Bug report da Nilma
   - Comando: `UPDATE consultants SET flow_engine_v3 = 'dark' WHERE id = '0c2711ad-...'`. Volta ao estado anterior em 30s.

**Custo:** ~30 minutos pra montar as queries + 7 dias de espera.
**Risco:** baixo (V3 já validado em paralelo + kill switch instantâneo).

---

### Etapa 2 — Wirar `resolveEngineDecisionWithCache` e simplificar router (semana 2-3)

**Só executa se Etapa 1 passou.**

**Objetivo:** matar o `flow-router.ts::routeEngine` que troca de motor a
cada turno (causa raiz dos bugs descritos no `requirements.md` original
seções 1-2).

**Sequência:**

1. Substituir nos webhooks (whapi-webhook + evolution-webhook) o
   `isEngineV3Enabled` antigo pelo `resolveEngineDecisionWithCache`.
   Decisão por turno fica em uma única função pura testada.
   - Tarefa antiga: Task 30
   - Esforço: 4 horas

2. Adicionar suporte real a `'canary'` no router:
   - Hoje `canary` é tratado como `off` pelo router antigo
   - Com `resolveEngineDecisionWithCache`, `canary` = `engine_unified` igual `on`
   - Diferença passa a ser semântica (auditoria, rollback policy)

3. **Apagar `_shared/engine/engine.ts`** (442 linhas mortas, zero importadores):
   ```bash
   grep -rn "from.*engine/engine" supabase/ src/  # confirmar zero matches
   rm supabase/functions/_shared/engine/engine.ts
   ```

4. Promover Nilma de `on` para `on` (sem mudança visível, apenas migra de
   `router.isEngineV3Enabled` para `resolveEngineDecisionWithCache` por
   baixo) e observar 7 dias de paridade.

**Critério de avanço para Etapa 3:**
- Toda decisão de motor passa por uma função pura
- `engine.ts` morto deletado
- 7 dias sem regressão

**Risco:** médio. Refactor toca os dois webhooks de produção. Mitigação:
deploy em horário de baixo tráfego, kill switch via flag intacto.

---

### Etapa 3 — Quebrar `bot-flow.ts` em módulos (semana 4-6)

**Só executa se Etapa 2 passou.**

**Objetivo:** matar o monolito de 5.264 linhas no Whapi e 4.641 no Evolution.

**Sequência (uma extração por dia útil, com deploy entre cada):**

| Dia | Extração | Origem | Destino |
|---|---|---|---|
| 1 | OCR conta | `bot-flow.ts` linhas que tratam `aguardando_conta`, `processando_ocr_conta`, `confirmando_dados_conta` | `_shared/pipeline-cadastro/conta.ts` |
| 2 | OCR documento | linhas `aguardando_doc_*`, `confirmando_dados_doc`, `confirmar_titularidade` | `_shared/pipeline-cadastro/doc.ts` |
| 3 | Portal + OTP | linhas `portal_submitting`, `aguardando_otp`, `validando_otp` | `_shared/pipeline-cadastro/portal.ts` + `otp.ts` |
| 4 | Facial + assinatura | linhas `aguardando_facial`, `aguardando_assinatura`, `cadastro_em_analise`, `complete` | `_shared/pipeline-cadastro/facial.ts` |
| 5 | Edição pós-OCR | linhas `editing_conta_*`, `editing_doc_*` | `_shared/pipeline-cadastro/editing.ts` |

**Cada extração:**
1. Cria módulo novo com a função pura/testável
2. `bot-flow.ts` Whapi e Evolution viram shim que chamam o módulo
3. Deploy
4. Acompanha 24h via `engine_logs`
5. Se OK, próxima extração no dia seguinte
6. Se quebrar, rollback do shim (1 commit, sem migração SQL)

**Critério final:**
- `bot-flow.ts` Whapi cai de 5264 → < 500 linhas
- `bot-flow.ts` Evolution cai de 4641 → < 500 linhas
- Zero regressão de OCR/portal/OTP em produção

**Esforço:** 5 dias de código + 5 dias de observação = ~2 semanas.

---

## Tabelas de uso do que já foi feito

Das 22 tasks já concluídas:

| Task | Aproveitada em | Como |
|---|---|---|
| 1.1, 1.2, 1.3, 1.4, 2 (auditoria) | Etapa 1 baseline | Métricas históricas pra comparar pós-flip |
| 3, 4.1-4.6 (renames) | Todas | Código já tem nomes consistentes |
| 5, 29 (`decision.ts` puro + cache) | Etapa 2 wiring | Pronto pra usar |
| 6, 13 (purity lint) | Todas | Garante que motor permanece puro |
| 8.1, 8.2 (capabilities) | Etapa 3 (extração com capability) | Adapters já têm capabilities |
| 15 (registry) | Etapa 3 (classificação dos 48 steps) | Pronto |
| 25, 26, 28, 51 (DDL + view + index) | Etapa 1 monitoramento, Etapa 2 audit | Já no banco |
| 27 (gate singleton) | Etapa 2 prereq | Confirmado |

## Tasks da spec original que NÃO serão feitas

| Tasks descartadas | Motivo |
|---|---|
| 16-22 da forma original | Substituídas por Etapa 3 simplificada (uma extração por dia, sem fase única) |
| 23 (shim layer) | Já é o approach da Etapa 3 |
| 24, 31, 35, 48, 54 (checkpoints) | CI já roda; não precisa task formal |
| 32-34 (webhook fino <200 linhas) | Polimento cosmético; webhook tem complexidade real (rate limit, dedup, lock per-customer) |
| 36-47 (PBT inflado) | Os 76 testes existentes cobrem o que importa |
| 49, 50 (UI nova) | `RolloutPanel.tsx` já faz o trabalho |
| 52, 53 (cron auto-killswitch) | Risco operacional baixo até produção total |
| 55-60 (gates de calendário) | Plano novo já tem gates de 7 dias por etapa |
| 61-66 (destrutivos) | Apaga só quando telemetria mostrar zero tráfego legacy por 30 dias — não em data fixa |

## Comparação resumida

| Métrica | Spec original | Plano novo |
|---|---|---|
| Tasks | 80 | 3 etapas (~10 sub-tasks no total) |
| Calendário | 8-10 semanas | 4-6 semanas |
| Big-bang? | Sim (Phase 9 destrutiva) | Não — apaga quando telemetria liberar |
| Kill switch verificado | Não | Sim — etapa 1 testa que rollback funciona em 30s |
| Risco produção | Alto (motor único reescrito) | Baixo (V3 já existe, só promove com observação real) |

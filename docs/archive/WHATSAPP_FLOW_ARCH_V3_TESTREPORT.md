# WhatsApp Flow Architecture v3 — Test Report

> Documento vivo. Atualizar após cada execução de smoke E2E e cada janela de rollout (dark / canary / on).

## Status atual

| Item | Status | Notas |
|---|---|---|
| Phase 0 (Pré-requisitos) | ✅ Completa | Tasks 14-17 + flag audit + human-pace.ts |
| Phase A (Adapters) | ✅ Completa | 18 testes unitários verdes |
| Phase B (Estado canônico) | ✅ Completa | Migration + helpers + customer-takeover atualizado |
| Phase C (Engine puro) | ✅ Completa | 14 PBTs verdes; engine determinístico sem I/O |
| Phase D (Choice channel-aware) | ✅ Infra + 9 PBTs | Migração de call-sites é Task 26 (gated by canary) |
| Phase E (Separação) | ✅ Helpers | webhook fino é Task 30 (gated by canary) |
| Phase F (Observability) | ✅ Completa | logger + view + dashboard card |
| Phase G (UI Flow Builder) | ✅ Helpers | tipos canônicos + channel preview prontos |
| Phase H (Crons) | ✅ Helper | migração individual gated by canary |
| Phase I (Rollout) | ⏳ Pendente | depende de smoke E2E + janelas |
| Phase J (Cleanup) | ⏳ Futura | mínimo 30d após Phase I.5 |

## Suite de testes (Task 37)

Última execução: rodar `deno test --no-check --allow-env supabase/functions/_shared/channels/ supabase/functions/_shared/flow-engine/ supabase/functions/_shared/human-pace_test.ts`

**Resultado: 49 passed | 0 failed**

Cobertura:
- `_shared/human-pace_test.ts`: 8 testes — piso/teto/monotonicidade/pausa IA.
- `_shared/channels/evolution_test.ts`: 10 testes — capabilities + parseInbound (texto, botão, mídia, áudio, grupo, fromMe, números).
- `_shared/channels/whapi_test.ts`: 8 testes — capabilities + parseInbound (texto, ButtonsV3 strip, ListV3 strip, voice, grupo, takeover).
- `_shared/channels/dispatch-choice_test.ts`: 9 testes — render + PBT button-no-button-channel.
- `_shared/flow-engine/engine_test.ts`: 14 testes — determinismo, sem I/O, current_step_id reachable, status terminal silencia outbound, paused_manual silencia, opt_out silencia, todos os step types canônicos.

## Cenários E2E (Task 38) — pendentes

Cada cenário deve ser executado em ambiente staging com Supabase + MinIO + mocked Evolution. Documentar resultado, latência p50/p95 e qualquer observação.

| ID | Cenário | Status | Notas |
|---|---|---|---|
| T1  | Fluxo A em Whapi com botão (3 opções, click no segundo)            | ⏳ | |
| T2  | Fluxo A em Evolution sem suporte a botão (downgrade para lista)    | ⏳ | |
| T3  | Fluxo B com text_message → text_message em sequência               | ⏳ | |
| T4  | Fluxo C com media_message{video} antes de text_message             | ⏳ | |
| T5  | Fluxo D com audio_slot no meio + sleep correto                     | ⏳ | |
| T6  | Cliente em modo manual recebe inbound — engine no-op               | ⏳ | |
| T7  | Humano libera (paused_manual→running) — engine retoma              | ⏳ | |
| T8  | Erro 500 do Evolution durante send → idempotency replay            | ⏳ | |
| T9  | Resposta inválida em ask_choice → fallback do step                 | ⏳ | |
| T10 | Lead sem resposta 24h → cron bot-followup-checker                  | ⏳ | |
| T11 | Conversão (status='converted') — engine não age mais               | ⏳ | |
| T12 | Whapi quick_reply payload sem ButtonsV3: prefix                    | ✅ | Coberto em whapi_test.ts |
| T13 | Evolution recebe "1" em resposta a lista → vira option_id certo    | ✅ | Coberto em engine_test.ts |
| T14 | tick() é determinístico (mesma entrada → mesma saída)              | ✅ | Coberto em engine_test.ts |
| T15 | tick() não chama nenhum SQL/HTTP                                   | ✅ | Coberto em engine_test.ts |
| T16 | step.preferred=button em canal sem suporte → log downgrade         | ✅ | Coberto em dispatch-choice_test.ts |
| T17 | Backfill step_type → step_type_canonical cobre 100% dos rows       | ⏳ | Validar pós-migration em staging |
| T18 | Trigger customer_flow_state → customers mantém os 4 campos sync    | ⏳ | Validar pós-migration em staging |
| T19 | system_capture{pipeline=cadastro_portal} delega para runBotFlow    | ⏳ | E2E staging |
| T20 | flow_engine_v3='dark' por 24h: paridade ≥99% com legado            | ⏳ | Smoke prod |

## Plano de rollout (Tasks 39-41)

### Task 39 — dark (48h)

```sql
-- Em produção:
UPDATE consultants SET flow_engine_v3 = 'dark';

-- Coletar logs `engine_v3_state_loaded` e `engine_dark_decision`.
-- Critério de sucesso: paridade ≥99% com legado.
```

### Task 40 — canary 5% (7 dias)

```sql
-- Whitelist de 5% por hash do id:
UPDATE consultants
   SET flow_engine_v3 = 'canary'
 WHERE substr(md5(id::text), 1, 1) IN ('0','7');  -- ~12.5%, ajuste conforme

-- Critério de sucesso: zero incidente p1, conversion_rate não regrediu,
-- deterministic_fallback_pct < 5%, lock_timeout_pct < 0.1%.
```

### Task 41 — on global (7 dias monitorando)

```sql
UPDATE consultants SET flow_engine_v3 = 'on';

-- Rollback de emergência:
UPDATE consultants SET flow_engine_v3 = 'off';
```

## Métricas a observar

Via view `v_flow_engine_health`:
- `turns_last_hour`: deve ser não-zero quando há tráfego.
- `conversion_rate_24h_pct`: comparar com baseline pré-v3 (deve ser igual ou melhor).
- `paused_manual` / `paused_system`: distribuição esperada — system raro.
- `last_activity_at`: deve atualizar continuamente.

Via logs estruturados (kind):
- `engine_step_advance`: indicador de saúde (deve ser maioria).
- `engine_invalid_step` / `engine_invalid_input`: alerta (debugar config de fluxo).
- `engine_delegate_legacy`: esperado em fluxos com cadastro.
- `channel_choice_downgrade`: esperado em Evolution; alarmar se Whapi.
- `customer_lock_timeout`: deve ser <0.1%.
- `lead_source_tag_failed`: monitorar — pode indicar problema com Meta Ads.

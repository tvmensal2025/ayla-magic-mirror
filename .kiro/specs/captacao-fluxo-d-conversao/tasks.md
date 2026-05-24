# Implementation Plan — Captação Fluxo D + Tracking Meta + Reaquecimento

> Esta spec entrou com 4 frentes que evoluíram em paralelo. Várias tasks já foram entregues em commits anteriores; outras ainda têm gaps. Cada task referencia `requirements.md` (Requirement N) e `design.md`.
>
> Convenções:
> - **PBT** = property-based test obrigatório.
> - **MIG** = migração SQL idempotente (`IF NOT EXISTS`, `OR REPLACE`).
> - `[Optional]` = pode ser pulada sem quebrar caminho feliz.

## Status por frente

| Frente | Progresso |
|---|---|
| Editor de fluxos + simulador (R1, R3..R5) | 80% — falta template "Captação Meta Ads" (R1) |
| Captação cascata pós-OCR (R2) | 70% — alertas `flow_d_*` faltam (R2.5..R2.7) |
| Tracking Meta (R6..R9) | 75% — validações de cadastro manual + tsvector + log (R6, R7, R8.4, R8.6) |
| Reaquecimento (R10..R16) | 85% — cron auto + outcome tracking (R15, R16) |
| Compatibilidade A/B/C/E + RLS (R17, R18) | 100% |

## Tasks

### Frente 1 — Editor de fluxos

- [x] 1. **Botão "🎬 Testar fluxo" no `FluxoBuilder`**.
  - Implementado em `src/pages/FluxoBuilder.tsx`. Desabilitado quando `steps.length === 0`.
  - Atende: Requirement 3.

- [x] 2. **`FlowSimulator` modal com Lead Fake**.
  - Implementado em `src/components/admin/flow-builder/FlowSimulator.tsx`.
  - Não chama Evolution/Whapi, não persiste em banco.
  - Atende: Requirement 4.

- [x] 3. **Mensagens pré-definidas + entrada livre + fallback**.
  - Implementado: opções rápidas + textarea de até 1000 chars.
  - Atende: Requirement 5.

- [ ] 4. **Template "Captação Meta Ads" no `FlowTemplatesDialog`**.
  - Adicionar entry em `src/components/admin/flow-builder/flowTemplates.ts` (ou similar) com:
    - Nome único ≤60 chars + emoji.
    - Passos: welcome (botão "Quero simular") → captura conta → resultado simulação → captura documento → finalizar.
    - Pelo menos 1 botão CTA por passo `message` entre `capture_conta` e `capture_documento`.
  - Diálogo de confirmação ao aplicar em fluxo de variante ≠ D (preserva passos existentes em "Cancelar").
  - Roda `useFlowValidation` antes de fechar o modal.
  - **Verificação**: criar fluxo D em branco, aplicar template, validar zero erros `conversion_step_no_cta`.
  - Atende: Requirement 1.

### Frente 2 — Captação cascata pós-OCR

- [x] 5. **Pipeline de avanço pós-OCR**.
  - `evolution-webhook/handlers/bot-flow.ts` já avança `aguardando_conta → resultado_simulacao` em <5s após OCR sucesso.
  - Botões CTA "Cadastrar agora" / "Tenho dúvidas" / "Falar com humano" configurados no step.
  - Atende: Requirement 2.1, 2.2, 2.3, 2.4.

- [x] 6. **Alertas `flow_d_ocr_failed_bill` e `flow_d_ocr_failed_doc`**.
  - Helper `recordFlowDAlert` em `_shared/captation/flow-d-alerts.ts` insere em `bot_handoff_alerts` com `alert_type` correto.
  - Wired nos 2 catch + 2 else de OCR fail em `evolution-webhook/handlers/bot-flow.ts` (conta + documento).
  - Helper só dispara para `flow_variant='D'` — A/B/C/E continuam com alertas legacy.
  - **Verificação manual**: simular OCR fail (mock retorna 500) e confirmar linha em `bot_handoff_alerts`.
  - Atende: Requirement 2.6, 2.7.

- [x] 7. **Cron `flow-d-stuck-watchdog`**.
  - Edge Function `supabase/functions/flow-d-stuck-watchdog/index.ts` rodando a cada 5 minutos (registrado em `supabase/config.toml`).
  - SELECT customers WHERE flow_variant='D' AND status NOT IN ('approved','cancelled') AND updated_at < now() - 30s e step não-finalista. Debounce 15min entre alertas para o mesmo lead. Cap 200 leads por execução.
  - INSERT `bot_handoff_alerts` com `alert_type='flow_d_stuck'`. Fallback para schema mínimo se colunas extras não existirem.
  - **Verificação manual**: deixar customer em Fluxo_D parado 1min, cron detecta e gera alerta.
  - Atende: Requirement 2.5.

### Frente 3 — Tracking Meta Ads

- [x] 8. **Cadastro manual de campanha (`CreateCampaignWizard`)**.
  - Wizard em `src/components/admin/ads/CreateCampaignWizard.tsx`.
  - Persiste em `facebook_campaigns` com RLS por `consultant_id`.
  - Atende: Requirement 6 parcial.

- [ ] 9. **Validar `initial_message ≥ 5 chars` + dedup `campaign_id` por consultor**.
  - No submit do `CreateCampaignWizard`: validar `initial_message.length >= 5` e bloquear se `campaign_id` já existe para o mesmo consultor.
  - Mostrar erro inline no formulário; preservar dados em caso de falha de persistência.
  - **Verificação**: tentar criar duas campanhas com mesmo `campaign_id` → segunda falha; tentar criar com `initial_message=""` → bloqueado.
  - Atende: Requirement 6.2, 6.3, 6.6.

- [ ] 10. **Importação Meta Marketing API com janela 90d + 3 retries**.
  - Edge Function `facebook-import-campaigns` (nova ou estender `facebook-sync-metrics`):
    - Lista campanhas com status `ACTIVE` ou `PAUSED` cuja `start_time` está nos últimos 90 dias.
    - Atualiza custos/impressões/clicks em campanhas existentes sem sobrescrever `initial_message`/status manual.
    - Insere campanhas novas com `initial_message=""` + aviso UI.
    - Timeout 30s; retry com backoff (1s, 2s, 4s); 401/403 → instrução de reconectar conta.
  - Persiste custos diários em `facebook_metrics_daily` por (campanha, dia).
  - **Verificação**: rodar com mock retornando 5 campanhas → 5 rows; segunda chamada não duplica.
  - Atende: Requirement 7.

- [x] 11. **MIG: índice GIN em `facebook_campaigns.initial_message`**.
  - `CREATE INDEX IF NOT EXISTS facebook_campaigns_initial_message_tsv_idx ON facebook_campaigns USING gin (to_tsvector('portuguese', initial_message));`
  - Idempotente. Migration `20260524100000_lead_source_match_log.sql`.
  - Atende: Requirement 8.4.

- [x] 12. **MIG: tabela `lead_source_match_log`**.
  - Schema em `design.md` (Modelo de dados → `lead_source_match_log`).
  - Inclui RLS + indexes. Migration `20260524100000_lead_source_match_log.sql`.
  - Atende: Requirement 8.6.

- [x] 13. **`_shared/captation/lead-source.ts` — busca tsvector + log**.
  - Após o passo de match exato falhar, executa RPC `match_campaigns_by_initial_message(p_consultant, p_query, p_limit)` que aplica `ts_rank_cd` com normalização 32 e retorna top-N.
  - Caller filtra score ≥ 0.7 e seta `customers.source_campaign_id` + `matchMethod='tsvector'` + `similarity_score`.
  - INSERT em `campaign_match_log` com `method`, `similarity_score`, `customer_id`, `campaign_id` (nullable).
  - Falha de log não bloqueia o fluxo (try/catch).
  - **Verificação manual** após deploy: cliente cuja primeira mensagem é "Tem desconto na conta de luz?" cai em campanha cujo `initial_message="Quero desconto na minha conta"` se score ≥ 0.7.
  - Atende: Requirement 8.4, 8.5, 8.6, 8.7.

- [x] 14. **Painel CAC + lista por campanha (`CampaignsList`)**.
  - Implementado em `src/components/admin/ads/CampaignsList.tsx`.
  - Exibe leads recebidos, conversões, taxa, CAC.
  - Atende: Requirement 9.

- [ ] 15. **Exibir CAC = "—" quando 0 conversões**.
  - Em `CampaignsList.tsx` (ou helper): renderizar `"—"` em vez de `Infinity`/`NaN`.
  - **Verificação**: campanha com 10 leads, 0 conversões → coluna CAC mostra "—".
  - Atende: Requirement 9.7.

### Frente 4 — Painel de Reaquecimento

- [x] 16. **Página `/admin/reaquecimento` + lista de leads parados**.
  - Implementado em `src/pages/AdminReaquecimento.tsx` + `ReaquecimentoLeadList.tsx`.
  - Filtra `updated_at < now()-24h`, status NOT IN (`approved`, `cancelled`), step != null.
  - Telefone mascarado `(XX) X****-1234`.
  - Atende: Requirement 10, 18.3.

- [x] 17. **Histórico do lead (últimas 20 mensagens)**.
  - Implementado em `ReaquecimentoLeadHistory.tsx`.
  - RLS por `consultant_id`.
  - Atende: Requirement 11.

- [x] 18. **Templates de reaquecimento por step (CRUD)**.
  - Tabela `reactivation_templates` (migration `20260524000000_captacao_fluxo_d_conversao.sql`).
  - UI em `ReaquecimentoTemplates.tsx`.
  - UNIQUE parcial garante 1 template ativo por (consultor, step).
  - Atende: Requirement 12.

- [x] 19. **Envio manual de reaquecimento + agendamento**.
  - `ReaquecimentoSendDialog.tsx` envia via Evolution e/ou agenda via `scheduled_messages`.
  - Registra em `reactivation_sends` com `trigger_type='manual'`, `status`, `error_reason`.
  - Atende: Requirement 13.

- [x] 20. **Envio em lote 2-500 leads com progress bar**.
  - Implementado no mesmo dialog em modo `lote`.
  - Sleep 2s entre envios; falha individual não interrompe lote; cancelar em até 5s.
  - Atende: Requirement 14.

- [x] 21. **Edge Function `reactivation-cron` para auto_reactivate**.
  - `supabase/functions/reactivation-cron/index.ts` rodando a cada 1h (registrado em `supabase/config.toml`).
  - Janela 09:00–20:00 no fuso do consultor (default `America/Sao_Paulo`); pula sábado/domingo via `Intl.DateTimeFormat`.
  - Máx 3 envios automáticos por lead lifetime; debounce 48h entre envios; lote ≤500 por execução; sleep 2s entre envios.
  - INSERT `reactivation_sends.trigger_type='auto'`. Skip explícito quando `customers.capture_mode='manual'` sem `manual_override_reactivate=true`.
  - Helpers puros `isInsideWindow` + `renderMessage` testados (6 testes verde).
  - Atende: Requirement 15.

- [x] 22. **Edge Function `reactivation-outcome-tracker`**.
  - **Status**: integrado ao próprio `reactivation-cron` para evitar uma segunda função. A cada execução, chama o RPC `classify_reactivation_outcomes` antes do envio automático. Triggers em `conversations` (INSERT) e `customers` (UPDATE conversation_step) já populam `lead_responded_at` e `lead_advanced_at` em tempo real.
  - **Verificação**: enviar reactivation, lead responde em conversations → `lead_responded_at` populado <1s; passar 7 dias → `outcome='abandoned'` na próxima execução do cron.
  - Atende: Requirement 16.

- [ ] 23. **Dashboard de outcome no Painel_de_Reaquecimento**.
  - Card no topo da página com taxa de resposta, taxa de avanço, taxa de abandono por template.
  - Filtro por período (7/30/90 dias).
  - **Verificação**: dashboard mostra valores diferentes ao mudar o período.
  - Atende: Requirement 16.6.

### Frente 5 — Compatibilidade + privacidade

- [x] 24. **Preservar A/B/C/E + `customers.capture_mode='manual'` default**.
  - Schema preservado; migrations só adicionam colunas/constraints idempotentes.
  - `assign_flow_variant` mantém round-robin existente.
  - Atende: Requirement 17.

- [x] 25. **RLS de `reactivation_*` + audit log**.
  - Policies criadas na migration `20260524000000_captacao_fluxo_d_conversao.sql`.
  - Audit log via trigger em `reactivation_templates` (criar/editar/deletar) e em `reactivation_sends` (INSERT em lote).
  - Atende: Requirement 18.2, 18.6, 18.7.

- [x] 26. **Performance da listagem (≤2s p/ 5000 leads)**.
  - Índice em `customers (consultant_id, updated_at, status, conversation_step)`.
  - Atende: Requirement 18.1.

## Notes

### Tasks abertas (gaps reais)

| ID | Task | Esforço |
|---|---|---|
| 4 | Template "Captação Meta Ads" | 0.5 dia |
| 6 | Alertas `flow_d_ocr_failed_*` | 0.5 dia |
| 7 | Cron `flow-d-stuck-watchdog` | 1 dia |
| 9 | Validação `initial_message`/dedup | 0.5 dia |
| 10 | Import 90d + 3 retries | 1.5 dia |
| 11 | MIG índice GIN | 0.1 dia |
| 12 | MIG `lead_source_match_log` | 0.5 dia |
| 13 | Match tsvector + log | 1 dia |
| 15 | CAC "—" para 0 conversões | 0.1 dia |
| 21 | Cron `reactivation-cron` | 1.5 dia |
| 22 | Cron outcome tracker | 1 dia |
| 23 | Dashboard de outcome | 0.5 dia |
| **Total** | | **~8.7 dias** |

### Princípios de implementação

- **Backwards-compatible.** Toda task adiciona, nunca remove. R17 é gate.
- **Idempotência em todo cron.** `reactivation-cron` é safe contra reexecução.
- **Logs estruturados.** Reuso do `_shared/logger.ts` da spec `whatsapp-flow-architecture-v3` quando possível.
- **Tests + verificação manual.** Cada task tem critério explícito de verificação.

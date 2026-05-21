# Fase 4 — Itens Altos (pós Fases 0–3)

Phases 0–3 already validated. Now we tackle the **High** items from the audit — each behind a flag or with rollback, applied in 3 small batches with verification between each.

---

## Lote 1 — Robustez de envio (1-2h, risco baixo)

**B6 — Abort real em `runFromHere` / sequências longas**

- Em `FlowQuickBar` (`confirmSendFull`) e qualquer loop que envia múltiplas partes: checar `abortRef.current` no **início de cada iteração** e antes de cada `sendPart`.
- Botão "Parar" já existe no `BulkSendPanel`; replicar o padrão no `SendSequenceDialog`/`FlowQuickBar` (botão "Parar envio" ao lado do progresso `Enviando N/M`).
- Sem mudar a função de envio em si — só observar o flag.

**F10 — Fallback de variant C (vídeo) → variant B (sem áudio)**

- Em `whapi-webhook` no ponto onde envia vídeo inicial da variant C: `try/catch` no download/envio do vídeo. Em falha, marcar `customers.flow_variant='B'` para esse lead e re-disparar o welcome de B no mesmo turno.
- Log: `console.warn('[variant-c] video failed, fallback to B', { customerId, error })`.

**Verificação:** clicar "Parar" no meio de um envio de 5 partes → confirmar que para na próxima iteração. Forçar erro 404 no vídeo C (URL temporária inválida) → confirmar que cliente recebe fluxo B.

---

## Lote 2 — Resolver + Watchdog (1-2h, risco médio)

**F2 — Resolver custom sem fallback silencioso para welcome**

- Em `src/lib/flowStepResolver.ts` (e seu espelho na edge): quando custom step não tem mapeamento legacy, **retornar `null**` ao invés de cair em `welcome`.
- No chamador (whapi-webhook bot-flow handler): se `resolved === null`, manter `conversation_step` atual e logar `console.warn('[resolver] no legacy mapping', { stepKey, customerId })`. Não enviar nada.
- Atrás de feature flag `app_settings.resolver_strict_mode` (default OFF — liga só após validar em 1 consultor).

**F6 — Estender `recover-stuck-otp` para `finalizando**`

- No cron existente, adicionar segunda query: leads com `conversation_step='finalizando'` parados > 10min sem mensagem nova → re-disparar `finalizando` step ou notificar `notification_phone` do consultor.
- Sem deletar a lógica de OTP — só uma branch adicional.

**Verificação:** criar lead de teste em step custom sem mapeamento, ligar flag, enviar mensagem → conferir que step não muda e log aparece. Lead em `finalizando` há 11min → cron dispara recuperação.

---

## Lote 3 — Observabilidade & Capacidade (2h, risco zero)

**F12 — Worker `minio-quota-check**`

- Nova edge function `minio-quota-check` (cron a cada 15min): consulta MinIO admin API → grava `used_bytes`, `total_bytes`, `pct` em `system_health` (tabela existente).
- Widget no `SuperAdmin > Saúde do Sistema`: badge amarelo >70%, vermelho >85%.
- Nenhum bloqueio automático — só alerta.

**3.5 — Alertas para super_admin**

- Estender `instance-health-check` (cron já existe): quando instância desconectada >5min OU worker-portal offline, enviar 1 mensagem WhatsApp ao `notification_phone` do super_admin (dedup de 30min para não spammar).

**3.1 — Documentar capacidade (operacional, sem código)**

- Atualizar `LAUNCH_OPS.md` com:
  - RAM mínima Easypanel para 100 instâncias Evolution simultâneas
  - 3 réplicas worker-portal recomendadas
  - Limites Whapi/Evolution por canal
- Checklist de "Antes de abrir 100 consultores".

**Verificação:** rodar `minio-quota-check` manualmente → ver linha em `system_health`. Derrubar instância de teste por 6min → super_admin recebe alerta.

---

## Ordem & Rollback

```text
Hoje:   Lote 1 (B6 + F10)              → testar 24h
+24h:   Lote 2 (F2 + F6, F2 com flag)  → testar 48h
+48h:   Lote 3 (F12 + 3.5 + docs)      → release
```

Cada lote é independente. Kill switch global da Fase 0 cobre qualquer regressão de bot. Flag `resolver_strict_mode` permite reverter F2 sem deploy.

## Detalhes técnicos

- **Arquivos tocados Lote 1:** `FlowQuickBar.tsx`, `SendSequenceDialog.tsx` (se existir), `whapi-webhook/handlers/conversational/welcome.ts`
- **Arquivos tocados Lote 2:** `src/lib/flowStepResolver.ts`, `supabase/functions/_shared/flow/resolver.ts`, `recover-stuck-otp/index.ts`, migration `app_settings.resolver_strict_mode boolean default false`
- **Arquivos tocados Lote 3:** nova `supabase/functions/minio-quota-check/index.ts`, `SystemHealthPanel.tsx`, `instance-health-check/index.ts`, `LAUNCH_OPS.md`

## Decisão

Começo pelo **Lote 1 (B6 + F10)** sim
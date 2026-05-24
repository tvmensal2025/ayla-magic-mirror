# Auto-Rollout V3 — Pilotagem Automática

Você não vai mais tocar em código. O sistema vai avançar/recuar o `flow_engine_v3` e `flow_reliability_v2` sozinho, com base nos gates de saúde já definidos.

## O que vai ser criado

### 1. Edge function `flow-engine-rollout-cron`

Roda a cada 6h via pg_cron. Em cada execução:

1. **Lê `v_flow_engine_health**` dos últimos 24h por consultor.
2. **Aplica gates** (mesmos do plano original):
  - Zero `engine_v3_state_load_failed`
  - `engine_v3_fallback_to_legacy` < 1%
  - p95 latência ≤ baseline + 10%
  - ≥100 turnos shadow (para sair do dark)
3. **Decisão por consultor:**
  ```text
   Estado atual  →  Próximo (gates verdes)  →  Rollback (gates vermelhos)
   off                dark                       (n/a)
   dark (≥48h verde)  canary                     off  + alerta
   canary (≥7d verde) on                         dark + alerta
   on                 on (mantém)                canary + alerta
  ```
4. **Política de canary 5%**: quando promove de `dark→canary`, faz por lotes — primeiros 3 consultores de menor volume, depois +5 a cada 48h verdes, até atingir 5% do total, depois global.
5. **Alertas**: rollback grava em `rollout_alerts` (nova tabela) e dispara `notify-consultant` para o número de suporte (você).
6. **Auditoria**: cada transição grava em `rollout_audit` (nova tabela) com `consultant_id`, `from_state`, `to_state`, `reason`, `metrics_snapshot`.

### 2. Tabelas novas

- `rollout_audit` — histórico imutável (insert-only) de cada transição
- `rollout_alerts` — fila de alertas pendentes (rollback, gate vermelho persistente)
- RLS: só service-role escreve; SuperAdmin lê

### 3. Cron schedule

- pg_cron job `flow-engine-rollout-tick` a cada 6h (00:00, 06:00, 12:00, 18:00 BRT)
- Migration nova adiciona o schedule

### 4. Painel mínimo `/admin/rollout` (SuperAdmin)

- Tabela: consultor, flag atual, turnos 24h, paridade, última transição, próximo gate
- Botão "Pausar auto-rollout" (kill-switch que seta secret `ROLLOUT_AUTOPILOT_DISABLED=true`)
- Botão "Forçar rollback global"

### 5. Memória atualizada

- `mem://whatsapp/flow-engine-v3-rollout` ganha seção "Autopilot" com como pausar e como ler `rollout_audit`

## Cronograma esperado (autopilot)

```text
Hoje + 0h    Rafael (dark)
Hoje + 48h   Demais consultores → dark global (se gates verdes)
Hoje + 96h   Primeiros 3 → canary
+48h         +5 consultores → canary (lotes)
~7 dias      5% atingido → mantém em canary
+7 dias      Global → on
+30 dias     Cleanup branches mortos (manual review — você aprova)
```

Total: ~2 semanas até `on` global se nada vermelho aparecer. Qualquer rollback adiciona +48h.

## Kill-switch (caso queira pausar)

Painel `/admin/rollout` botão "Pausar autopilot" OU SQL:

```sql
UPDATE app_secrets SET value='true' WHERE key='ROLLOUT_AUTOPILOT_DISABLED';
```

## O que NÃO está no escopo

- Cleanup final dos branches mortos (Semana 4 do design original) — exige review humano de uma vez quando 100% estiver em `on` por 30d. O autopilot vai te avisar via `rollout_alerts` quando estiver pronto pra essa última etapa.

## Perguntas antes de implementar

1. Telefone para receber alertas de rollback — uso o `notification_phone` do seu consultor (Rafael) ou tem outro número? 11989000650
2. Painel `/admin/rollout` (SuperAdmin) — implementar agora junto, ou só o autopilot + tabelas e a gente vê o painel depois? agora
3. Janela de quiet hours — autopilot pode promover/rollback a qualquer hora (inclusive 03:00),  qualquer hora
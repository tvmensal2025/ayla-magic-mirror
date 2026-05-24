## Semana 2 — Ativar Dark Mode do Flow Engine V3

Código da Semana 1 já está em produção (inerte). Próximo passo: ligar o modo `dark` em **1 consultor de teste** para começar a coletar decisões shadow do engine sem afetar o fluxo legado.

### Passos

1. **Escolher consultor de teste**
  - Critério: baixo volume (<50 leads/dia) e ativo nos últimos 7 dias.
  - Vou rodar SELECT para listar candidatos e sugerir 1.
2. **Ativar dark mode (SQL via insert tool)**
  ```sql
   UPDATE consultants
   SET flow_reliability_v2 = 'dark',
       flow_engine_v3 = 'dark'
   WHERE id = '<consultant_id>';
  ```
  - `flow_reliability_v2='dark'`: webhook chama `runEngineV3IfEnabled` e loga `engine_dark_decision` (não envia).
  - `flow_engine_v3='dark'`: engine calcula `tick()` em paralelo ao legado.
3. **Monitoramento (48h)**
  - Query em `flow_engine_logs` (ou edge logs) filtrando por `event=engine_dark_decision` e `consultant_id`.
  - Gates de saúde:
    - Zero `engine_v3_state_load_failed`
    - ≥99% paridade entre decisão shadow e ação legada
    - p95 latência webhook ≤ baseline + 10%
    - Zero duplicação de mensagem
4. **Criar view `v_flow_engine_health**` (se ainda não existe)
  - Agrega por consultant_id/hora: `turns/h`, `parity_rate`, `state_load_errors`, `fallback_count`.
  - Migration SQL nova.
5. **Documentar decisão e atualizar memória**
  - Atualizar `mem://whatsapp/flow-engine-v3-rollout` com consultant_id escolhido, timestamp de ativação, e checkpoints de 24h/48h.

### Critério de "pronto para Semana 3 (canary 5%)"

- 48h de dark com gates verdes
- Pelo menos 100 turnos shadow registrados
- Nenhum incidente reportado pelo consultor de teste

### Rollback (qualquer momento, <30s)

```sql
UPDATE consultants SET flow_reliability_v2='off', flow_engine_v3='off' WHERE id='<id>';
```

### Pergunta antes de executar

analise tudo do rafael.ids@icloud.com, analise oque passou e ja aplique agora
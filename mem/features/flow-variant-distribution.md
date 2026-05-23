---
name: Flow Variant Distribution UI
description: Editor /admin/fluxos has VariantDistributionBar to toggle, add and delete variants A-E
type: feature
---
- `src/components/admin/flow-builder/VariantDistributionBar.tsx` lê/escreve `consultants.active_variants` (text[]).
- Round-robin já é feito pela SQL `pick_next_flow_variant` baseado nesse array (1 cliente por variante ativa, não 2-a-2).
- Chip por variante mostra: bolinha verde (ativa) / cinza (pausada mas editável), Switch on/off, menu excluir.
- "Adicionar variante" cria `bot_flows` na próxima letra livre (A→E) com nome "Fluxo de <nome> (X)", is_active=true.
- Exclusão remove `bot_flows` + steps (cascade) e tira a letra de `active_variants`. Variante A não pode ser excluída.
- Pelo menos 1 variante precisa permanecer ativa (toast bloqueia desligar a última).
- Toggle "Fluxo ativo" global foi removido — a presença de variantes ativas controla o roteamento.

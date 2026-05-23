---
name: Multi-Variant Flow A-E with Active Round-Robin
description: Até 5 fluxos por consultor (A,B,C,D,E); active_variants[] controla quais entram no sorteio round-robin
type: feature
---
`consultants.active_variants text[]` (default `{A}`) controla quais variantes participam do round-robin. `assign_flow_variant(_consultant_id)` filtra para variantes que (a) estão em `active_variants` E (b) têm `bot_flows.is_active=true`; sorteia por `count(customers) % len(disponíveis)`. Se nenhuma disponível, cai em `A`.

**Variantes:** A (com áudio, fonte da verdade), B (sem áudio — dispatchers descartam `kind=audio`), C (vídeo inicial), D/E (personalizadas pelo consultor).

**Clone genérico:** `clone_bot_flow_as(_consultant_id, _variant)` cobre B/C/D/E a partir do A (deleta existente + copia steps). `clone_bot_flow_as_b` e `_as_c` viram wrappers.

**Admin (`/admin/fluxos`):** Card "Fluxos ativos no round-robin" com checkboxes A-E (A obrigatório), badge "Rodando agora: A + B + C…", botão "+ Criar" por variante, tabs dinâmicas por variante existente. `ab_test_enabled` foi removido da UI (boolean fica legado).

**Constraints:** `bot_flows.variant` e `customers.flow_variant` aceitam `('A','B','C','D','E')`.

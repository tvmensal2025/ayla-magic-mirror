# Variantes de fluxo dinâmicas + status de ativação

Hoje o sistema é fixo em A/B/C com um único switch `ab_test_enabled` que só liga **se B e C existirem** (tudo-ou-nada). Vamos generalizar para até **5 variantes (A, B, C, D, E)** e dar ao consultor controle de **qual subconjunto entra no round-robin** (A só, A+B, A+C, A+B+C, A+B+C+D+E, etc.).

## Banco

1. `consultants.active_variants text[]` (default `'{A}'`) — substitui a lógica do boolean. `ab_test_enabled` fica como leitura legada (= `array_length(active_variants,1) > 1`) e some da UI.
2. Generaliza `assign_flow_variant(_consultant_id)`:
   - Lê `active_variants` do consultor.
   - Se vazio/`{A}` → sempre `'A'`.
   - Senão: `counter % len(active_variants)` → escolhe item pelo índice (round-robin determinístico).
   - Só considera variantes que tenham `bot_flows.is_active=true` correspondente — se o admin marcar D como ativo mas o fluxo D não existir, é ignorado silenciosamente no sorteio.
3. Nova RPC genérica `clone_bot_flow_as(_consultant_id uuid, _variant text)` que cobre B/C/D/E a partir de A (substitui as duas RPCs `_as_b` e `_as_c`, que viram wrappers).
4. Constraint check em `bot_flows.variant IN ('A','B','C','D','E')` e em `customers.flow_variant` idem.

## UI — `/admin/fluxos` (FluxoCamila.tsx)

Reorganiza o card "Teste A/B/C" para um card **"Fluxos ativos"**:

```
┌─ Fluxos ativos ─────────────────────────────────┐
│  Atualmente rodando:  [ A + B + C ]  ← badge   │
│                                                  │
│  ☑ A (com áudio)        Leads: 412              │
│  ☑ B (sem áudio)        Leads: 408              │
│  ☑ C (vídeo inicial)    Leads: 405              │
│  ☐ D (personalizado)    — não criado            │
│  ☐ E (personalizado)    — não criado            │
│                                                  │
│  [+ Adicionar fluxo D]                          │
└──────────────────────────────────────────────────┘
```

- **Checkboxes** por variante existente → escrevem em `consultants.active_variants`. Desabilitado quando o fluxo daquela letra não existe.
- **Badge "Atualmente rodando: A+B+C"** (ou só "A", ou "A+C", etc.) — calculada a partir de `active_variants ∩ variantes_existentes`. Cor verde se >1 ativa, cinza se só A.
- **Botão "+ Adicionar fluxo {próxima_letra}"** — chama `clone_bot_flow_as(consultantId, próxima_letra_disponível)`. Some quando já existem 5.
- **Tabs de edição**: gera dinamicamente uma aba por variante existente (`A`, `B`, `C`, `D`, `E`), substituindo os 3 botões fixos atuais.
- Remove o `Switch` "ab_test_enabled" — substituído pelos checkboxes (a regra "precisa de >1 variante ativa pra rodar A/B" fica implícita).

## Código tocado

- `supabase/migrations/<novo>.sql` — coluna, RPCs, constraints.
- `src/pages/FluxoCamila.tsx` — bloco da linha ~580-647 (card A/B/C → card Fluxos ativos), `reload()` para carregar contagens dinâmicas, `cloneFlow(letra)` genérico, `setActiveVariants(arr)`.
- `src/integrations/supabase/types.ts` regenera automaticamente após a migration.

## Não muda

- Dispatchers (`whapi-webhook`, `manual-step-send`, `bot-flow.ts`): já lêem `customers.flow_variant` como string e fazem match com `bot_flows.variant`. Funcionam com qualquer letra sem alteração.
- Lógica do `CaptureStepsGrid` e admin de passos: já é `variant: "A" | "B" | "C"` — vira `string` para aceitar D/E.
- Memória `ab-test-audio-vs-text` será atualizada para refletir o modelo N-variantes.

## Risco / migração

- Backfill: `UPDATE consultants SET active_variants = CASE WHEN ab_test_enabled THEN '{A,B,C}' ELSE '{A}' END WHERE active_variants IS NULL;` — sem perda de comportamento atual.
- D e E começam vazios; clonar a partir de A é idempotente (a RPC `clone_bot_flow_as` deleta o existente antes, igual a B/C hoje).

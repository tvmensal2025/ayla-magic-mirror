## Objetivo

No Funil de Vendas (Kanban do CRM), cada card precisa mostrar **em qual passo do fluxo do bot o lead parou** — numerado (1, 2, 3, …, N) com o título do passo. Assim dá pra olhar a coluna e bater o olho: "esse parou no 3 (envio de conta), aquele no 7 (CPF)".

## O que vai aparecer no card

Logo abaixo do nome/telefone, um badge novo:

```
[ 3/10 ] Aguardando conta de luz   · há 2h parado
```

- `3/10` → posição do passo dentro do fluxo ativo do consultor.
- Label → `title` do passo (ou nome amigável da tabela de legados).
- Tempo parado → `now() - customers.last_step_advanced_at` (já existe).

Cor do badge muda por faixa de risco: ≤24h verde, 24-72h âmbar, >72h vermelho.

## Como o passo é resolvido

Cada deal vira lead via `customers.phone_whatsapp = remote_jid`. Pegamos `customers.conversation_step` e mapeamos:

1. **Fluxo customizado** (`flow:<uuid>` ou só `<uuid>`): faz lookup em `bot_flow_steps` (já temos `flow_id`, `position`, `title`, `step_key`) do fluxo ativo do consultor e mostra `position+1 / total`.
2. **Passos legados** (`welcome`, `aguardando_conta`, `ask_cpf`, …): tabela fixa no front com ordem canônica e label PT-BR (reusa o `STEP_LABELS` que já está em `BotFunnelPanel`). Numeração 1..N dentro do grupo "legado".
3. **Sem `conversation_step`**: badge cinza "Sem interação".

## Filtro novo no topo do funil

Ao lado do "Buscar por nome…":

- Select **"Parou no passo"** com a lista de passos do fluxo ativo (`1. Boas-vindas`, `2. Vídeo`, `3. Conta de luz`, …) + opção "Todos" e "Sem interação".
- Filtra os cards do Kanban no client (já temos tudo em memória via `useKanbanDeals`).
- Contador por coluna passa a refletir o filtro.

## Arquivos a tocar

- `src/hooks/useKanbanDeals.ts` — incluir `customers(conversation_step, last_step_advanced_at, flow_id)` no select; manter mapping para `customer_name`.
- `src/hooks/useFlowSteps.ts` *(novo)* — hook que carrega `bot_flow_steps` do(s) flow_id(s) ativos do consultor e devolve `Map<step_key|uuid, { position, total, title }>`. Cacheia em `useMemo`.
- `src/lib/flowStepResolver.ts` *(novo)* — função pura `resolveStep(conversation_step, flowMap, legacyMap) → { number, total, label, lastAdvancedAt }`. Reusa `STEP_LABELS` de `BotFunnelPanel` (mover para esse arquivo e re-exportar).
- `src/components/whatsapp/KanbanDealCard.tsx` — receber `stepInfo` por prop e renderizar o badge novo (cor por faixa de tempo).
- `src/components/whatsapp/KanbanColumn.tsx` / `KanbanBoard.tsx` — repassar `stepInfo` por deal e aplicar filtro "Parou no passo".
- `src/components/whatsapp/CrmTabs.tsx` (ou onde mora o header do Funil) — adicionar o `<Select>` "Parou no passo" controlado.

## Detalhes técnicos

- Query extra: `bot_flow_steps` filtrado por `flow_id in (...)` dos fluxos do consultor — uma única chamada na montagem.
- Numeração: `position` é 0-based no banco → exibir `position + 1`.
- `total`: `count(*) where flow_id = X` (já vem do array carregado).
- Legados: ordem fixa em array — mesma ordem do `STEP_LABELS` de `BotFunnelPanel` (welcome → complete). Total = length do array.
- Estado de "parado": já calculado por `KanbanSlaIndicator` via `updated_at`. Trocar para `customers.last_step_advanced_at` quando existir (mais preciso pro contexto "parou no passo").
- Sem migração de banco. Sem mexer em edge function.

## Fora de escopo

- Não muda a lógica de estágios do Kanban (Abertura/Descoberta/Pitch/…). O passo do fluxo é **informação adicional** dentro do card, ortogonal ao estágio comercial.
- Não mexe na aba "Clientes iGreen" (filtrada do funil já).

# Plano: Dashboard do Consultor + Modo Líder

## 1. Hierarquia de Líder (banco)

Hoje `consultants.referred_by` já existe mas está vazio. Vou:

- Criar função SQL `get_team_consultant_ids(_leader uuid)` que retorna o próprio id + todos descendentes via CTE recursiva sobre `referred_by`.
- Criar política RLS adicional em `customers` permitindo que o líder leia clientes da equipe (usando `has_role` ou a função acima).
- Cadastrar **Rafael Dias** como consultor "líder" (via UI normal de cadastro) — depois você liga manualmente cada filho preenchendo `referred_by = id_do_rafael_dias` na aba de gestão (já existe `ManagedConsultants`).

## 2. Novos cards no DashboardTab (`src/components/admin/DashboardTab.tsx`)

Trocar a grid atual de 3 cards por **5 cards** em 2 linhas:

```text
[Total Clientes] [Média kWh/cliente] [Média R$/cliente]
[Economia gerada (R$ × 20%)] [Taxa de conversão]
```

- `media_kwh` = somatório `media_consumo` / clientes com consumo > 0 (já calculado).
- `media_rs` = média de `electricity_bill_value` dos clientes com valor.
- `economia` = soma(`electricity_bill_value` × 0.20).

## 3. Novo componente `TopConsumersCard`

Lista os 10 clientes com maior `media_consumo`:

```text
#1  Maria Silva       1.450 kW   R$ 980/mês
#2  João Pereira      1.220 kW   R$ 845/mês
...
```

Inclui badge de status (Aprovado/Pendente) e link para abrir o cliente no CRM.

## 4. Novo componente `GeographyCard`

Dois mini-gráficos lado a lado:
- Top 5 distribuidoras (barra horizontal) — usa `customers.distribuidora`.
- Top 5 UFs — derivado do telefone (DDD via `dddToUf.ts` que já existe) ou de `customers.uf` se houver.

## 5. Novo componente `RetentionCard`

- **Aniversariantes da semana** — usa `customers.birth_date` (se não existir, adicionar coluna opcional via migration).
- **Inativos / risco churn** — clientes com último inbound > 30 dias e status ≠ aprovado.

## 6. Toggle "Meus clientes / Equipe" + nova aba "Equipe"

Na toolbar do DashboardTab, adicionar `ToggleGroup`:
- **Meus clientes** (default) — comportamento atual.
- **Equipe** — só aparece se `useTeamConsultantIds(userId).length > 1`. Quando ativo, todas as queries (`useAnalytics`, top consumidores, geografia, retenção) recebem array de ids em vez de um único.

Nova aba **`/admin/equipe`** com ranking dos consultores indicados (reaproveita `useLeadsByConsultant` que já existe e expande):

```text
#  Consultor          Clientes  Aprovados  kW médio  R$ médio  Conv%  Leads 30d
1  Ana Costa          124       89          892       720       18%    34
2  Bruno Lima         98        61          734       650       14%    22
...
```

- Coluna "Conv%" = aprovados / total.
- Botão "Ver dashboard" abre a visão individual daquele consultor (somente leitura).

## 7. Hook novo `useTeamConsultantIds(leaderId)`

```ts
queryKey: ["team-ids", leaderId]
// RPC get_team_consultant_ids → string[]
```

Usado pelo toggle + pela aba Equipe.

## 8. Detalhes técnicos

- Aproveitar `useAnalytics` existente — estender para aceitar `consultantIds?: string[]` opcional em vez de só `userId`.
- Cards usam mesma estilização do `StatCard` (sem cores custom — design tokens).
- Aba "Equipe" só renderiza se o usuário é líder (tem ≥1 filho em `referred_by`).
- Sem mexer em fluxo WhatsApp, bot ou edge functions.

## 9. Arquivos afetados

```text
NOVO  supabase/migrations/*_team_hierarchy.sql      (função RPC + RLS)
NOVO  src/hooks/useTeamConsultantIds.ts
NOVO  src/hooks/useTopConsumers.ts
NOVO  src/components/admin/TopConsumersCard.tsx
NOVO  src/components/admin/GeographyCard.tsx
NOVO  src/components/admin/RetentionCard.tsx
NOVO  src/components/admin/TeamRankingTab.tsx
EDIT  src/components/admin/DashboardTab.tsx        (5 cards + toggle + novos componentes)
EDIT  src/hooks/useAnalytics.ts                    (aceitar array de ids)
EDIT  src/pages/Admin.tsx                          (nova tab "Equipe" condicional)
```

## 10. Fora do escopo (decidir depois)

- Edição visual da hierarquia (drag & drop) — por enquanto líder edita `referred_by` manualmente.
- Comissão calculada — só métricas; nada financeiro de pagamento.
- Cadastro do Rafael Dias em si — você faz pelo fluxo normal de novo consultor.

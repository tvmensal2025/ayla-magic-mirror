## Problema identificado

1. **Ticket médio e Economia aparecem R$ 0** — a sync iGreen não preenche `electricity_bill_value` (0 de 1689 clientes têm valor). Só temos `media_consumo` em kWh.
2. **"Churn"** é jargão — usuário não entendeu.
3. **Aniversariantes** hoje usa "ciclo de cadastro" (1 mês, 2 meses...). Usuário quer aniversário real (`data_nascimento`, que existe como texto `YYYY-MM-DD`).

## O que vou fazer

### 1. Calcular Ticket médio e Economia a partir do consumo
Como `electricity_bill_value` vem vazio do iGreen, estimar via `media_consumo` (kWh) × tarifa média **R$ 0,95/kWh**:
- **Ticket médio (conta)** = `avg(media_consumo) × 0,95`
- **Economia gerada** = `sum(media_consumo) × 0,95 × 0,20`
- Adicionar `subtitle="estimado pela tarifa média"` nos dois cards.
- Se algum cliente tiver `electricity_bill_value > 0` (futuro), usar o valor real e cair na estimativa só para os zerados.

### 2. RetentionCard — reescrever os dois blocos
**Bloco 1: trocar "Risco de Churn" por**
- Título: **"REATIVAR CLIENTES PARADOS"**
- Subtítulo: *"Sem atividade há mais de 30 dias — mande um oi"*
- Lógica atual (status pending/devolutiva/lead/data_complete + 30d) mantida.

**Bloco 2: aniversariantes de verdade (`data_nascimento`)**
- Duas listas lado a lado dentro do card:
  - **🎂 Hoje** — `data_nascimento` com mês+dia = hoje
  - **🎉 Este mês** — `data_nascimento` com mês = mês atual (limita 10, ordenado por dia)
- Mostra nome + idade que está fazendo + dia (ex: "23/05").
- Se não houver, mostra mensagem amigável.

### 3. useAnalytics — incluir `data_nascimento` no select
Adicionar a coluna no `.select()` dos customers para o RetentionCard receber.

## Arquivos

```text
EDIT  src/hooks/useAnalytics.ts                   (+ data_nascimento no select)
EDIT  src/components/admin/DashboardTab.tsx       (cálculo via media_consumo)
EDIT  src/components/admin/RetentionCard.tsx      (rename + aniversariantes do dia/mês)
```

## Fora de escopo
- Buscar valor real da conta no portal iGreen (precisaria mudar o worker de sync — outra task).

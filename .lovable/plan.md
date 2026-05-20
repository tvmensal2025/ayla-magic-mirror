## Problema
No celular (≤390px) o /admin está apertado: o topo (logo + ícones + abas) corta "Central de Anúncios", e os cards do dashboard ficam ou estreitos demais ou com valores cortados ("R$ 50.4...").

## O que vou ajustar (apenas mobile — desktop fica igual)

### 1. Topo do /admin
- **Logo iGreen**: reduzir altura no mobile (de ~h-8 para h-6) pra dar respiro.
- **Ícones da direita** (preview / monitor / sparkles / sino / engrenagem / logout): no mobile passam a ter `gap-1`, `size-8` e ícone `w-4 h-4`. Esconder os menos críticos (`monitor`, `sparkles`) abaixo de `sm:` — já existem em outros menus.
- **Tabs (Dashboard, CRM, Clientes, Rede, WhatsApp, Central de Anúncios)**:
  - Wrapper recebe `overflow-x-auto scrollbar-thin` com `snap-x`.
  - Cada item: `shrink-0`, `px-2.5`, label `text-[11px]`, ícone `w-4 h-4`.
  - Adicionar fade nas bordas (gradient mask) pra deixar claro que rola lateralmente.

### 2. Toolbar (Filtrar licenciado / Sincronizar / Período / PDF / Resetar)
- No mobile vira **2 linhas balanceadas**: linha 1 = filtros (select + sincronizar), linha 2 = ações (período + PDF + resetar).
- Selects ganham `w-full` no mobile com `max-w-[180px]`, botões `flex-1` pra preencher a linha sem quebrar feio.

### 3. Cards de estatística (os 5 do topo)
- Trocar grid pra `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5` **OU** manter 2 colunas mas:
  - Reduzir padding do `StatCard` no mobile (`p-3` em vez de `p-4`).
  - Valor `text-xl sm:text-2xl` com `truncate` + `title={fullValue}` pra mostrar tooltip se cortar.
  - Para valores monetários grandes, formatar com **abreviação** (`R$ 50,4 mil` em vez de `R$ 50.400`) quando ≥ 10.000, usando `Intl.NumberFormat("pt-BR", { notation: "compact" })`.
  - Ícone menor no mobile (`w-4 h-4` em vez de `w-5 h-5`).
- Vou recomendar **1 coluna no celular** (cards largos ficam mais legíveis e ninguém precisa apertar olho), 2 no `sm`, 3 no `md`, 5 no `lg`. É o padrão de dashboards mobile-first.

## Arquivos a editar
```text
src/components/admin/AdminHeader.tsx        (logo + ícones + tabs responsivo)
src/components/admin/DashboardTab.tsx       (toolbar 2-linhas mobile + grid 1→2→3→5)
src/components/admin/StatCard.tsx           (padding, font, truncate, compact format)
```
(Vou abrir os 2 primeiros pra confirmar os class names exatos antes de editar.)

## Fora de escopo
- Mudar paleta, ícones ou copy.
- Reordenar abas ou esconder funcionalidade — só layout responsivo.
- Mexer em `CustomerCharts`, `TopConsumersCard`, `GeographyCard`, `RetentionCard` (a queixa foi "cards e topo"; se quiser depois eu ajusto esses também).

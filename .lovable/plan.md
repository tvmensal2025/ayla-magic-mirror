## Objetivo

Separar a aba **Anúncios** em duas para o dashboard de performance não ficar perdido junto com modelos/campanhas/inteligência.

## Estrutura nova de abas

Antes (1 aba "Anúncios" com 4 views internas):
```
... | Anúncios (Modelos | Resultados | Campanhas | Inteligência) | ...
```

Depois (2 abas separadas):
```
Dashboard | Preview | CRM | Clientes | Rede | WhatsApp | Performance | Histórico | Links | Dados | Materiais | Central de Anúncios
```

- **Performance** (no lugar atual de "Anúncios"): mostra só o `ResultsDashboard` — KPIs reais (cliques, leads no WhatsApp, viraram cliente, CPL, CPA, ROI), funil com custos, gráficos. É a "primeira tela" de leitura rápida.
- **Central de Anúncios** (nova, depois de "Materiais"): contém Modelos, Campanhas e Inteligência (gestão/operação dos anúncios). Mantém `WalletChip` + botão "Criar do zero".

## Mudanças técnicas

1. `src/pages/Admin.tsx`
   - Renomear tab `anuncios` → `performance` (label "Performance", ícone `BarChart3` ou `TrendingUp`), posição mantida.
   - Adicionar nova tab `central-anuncios` (label "Central de Anúncios", ícone `Megaphone`) após `materiais`.
   - Atualizar union type do `activeTab` e o parser de query string (`?tab=performance` e `?tab=central-anuncios`, mantendo retrocompatibilidade com `anuncios` → redireciona para `performance`).
   - Renderizar `<PerformanceTab />` e `<AdsCentralTab />`.

2. `src/components/admin/ads/PerformanceTab.tsx` (novo)
   - Wrapper enxuto: header "Performance dos Anúncios" + `WalletChip` (read-only) + `<ResultsDashboard consultantId onCreateClick={() => navega para central-anuncios} />`.
   - Sem os botões de view interna.

3. `src/components/admin/ads/AdsCentralTab.tsx` (novo, refatorado a partir do `AdsTab.tsx`)
   - Header "Central de Anúncios" + `WalletChip` + botão "Criar do zero".
   - Switcher interno só com 3 views: **Modelos**, **Campanhas**, **Inteligência** (remove "Resultados").
   - Mantém `CreateCampaignWizard`, dica final ajustada.

4. `src/components/admin/ads/AdsTab.tsx`
   - Deletar (substituído pelos dois acima) — confirmar que nenhum outro lugar importa.

## Comportamento

- Quando o usuário clica "Criar campanha" dentro de Performance, é levado para **Central de Anúncios** → view Modelos.
- Links antigos `?tab=anuncios` continuam funcionando (redirecionados para `performance`).
- Nenhuma mudança em lógica de dados — só reorganização visual.
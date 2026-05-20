## Diagnóstico (do que vi no print + estrutura do projeto)

A tela da aba **Clientes** está apertada no celular/tablet pequeno:
- 3 botões coloridos no topo (filtros rápidos por status) viram **quadrados sem rótulo** — parece bug, não funcionalidade.
- "Importar Excel" + "Novo" ficaram empilhados de forma desbalanceada.
- Os 3 selects de filtro (Licenciado / Distribuidora / Cidade) ocupam 2+1 linha — quebra ruim.
- Cards de cliente: nome cortado ("Antonio..."), telefone "+55 (11) 9 5198-7403" quebra em **5 linhas verticais**, distribuidora também empilhada.
- Paginação no rodapé respira pouco.

E pelo inventário do projeto, outras telas usam padrões parecidos que precisam do mesmo tratamento:
**CRM / Kanban**, **WhatsApp** (chat sidebar + conversa), **Rede** (NetworkPanel), **Central de Anúncios** (HeroKpis, AdMetricsCards, MainChart).

## Plano em 3 ondas (executo todas nesta etapa)

### Onda 1 — Aba **Clientes** (CustomerManager + CustomerListItem)
1. **Top action row**: "Importar Excel" e "Novo" viram `flex-1` no mobile, com `text-xs h-9` e ícone só. Já desktop volta ao tamanho normal.
2. **Quick filters de status** (os 3 quadrados): adicionar rótulo curto ao lado do ícone no mobile (`Aprovados`, `Pendentes`, `Devolutiva`) ou virar uma única `Select` no mobile (vou pelo Select — mais limpo).
3. **3 selects de filtro**: grid 1 coluna no mobile, `sm:grid-cols-2`, `md:grid-cols-3`. Cada um `w-full`.
4. **Status pills** (927 Todos / 58 Aprovados / 54 Falta Assinatura...): manter scroll horizontal mas adicionar máscara de fade nas laterais + `snap-x`.
5. **Card de cliente** (CustomerListItem): no mobile reorganizar em 2 linhas — linha 1: avatar + nome (truncate) + status badge; linha 2: telefone formatado em 1 linha + distribuidora curta + cidade. Esconder badges duplicados ("Devolutiva" aparece 2x).

### Onda 2 — **CRM / Kanban** (KanbanBoard, KanbanColumn, KanbanDealCard, SalesFunnelBoard)
1. Colunas Kanban no mobile: `min-w-[280px]` com scroll horizontal smooth + indicador "deslize para ver mais".
2. Cards do deal: padding reduzido (`p-3`), avatar menor (`w-8`), nome `truncate`, badges em linha única com `flex-wrap` controlado.
3. Header do Kanban (filtros + stage selector): vira `Sheet` (gaveta) no mobile com um botão "Filtros".

### Onda 3 — **WhatsApp**, **Rede**, **Anúncios**
1. **WhatsAppTab/ChatSidebar/ChatView**: já é responsivo mas o header do chat (nome + telefone + ações) está apertado — reduzir ícones (`size-8`), esconder texto secundário no mobile, `Sheet` para painel lateral de cliente.
2. **NetworkPanel** (Rede): cards de equipe em `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` com avatares menores.
3. **AdsCentralTab** (HeroKpis, AdMetricsCards, MainChart): mesma tratativa do dashboard — `StatCard` compacto + chart com altura responsiva (`h-[220px] sm:h-[300px]`).

### Padrões aplicados em todas
- **Spacing**: trocar `gap-4`/`p-4` por `gap-2.5 sm:gap-4` e `p-3 sm:p-5`.
- **Fontes**: títulos `text-base sm:text-2xl`, labels `text-[10px] sm:text-xs`.
- **Botões**: ações primárias `h-9 sm:h-10`, ícones `w-4 h-4` no mobile.
- **Linhas de filtro**: sempre `grid` (não `flex-wrap`) no mobile pra evitar "órfão" de 1 select sozinho na 2ª linha.
- **Tabelas → cards**: nada de tabela rolável no mobile; vira lista vertical de cards.
- **Scroll horizontal intencional**: sempre com fade-mask + `snap-x`.

## Arquivos que vou tocar (estimado)
```text
src/components/whatsapp/CustomerManager.tsx       (toolbar + filtros + status pills)
src/components/whatsapp/CustomerListItem.tsx      (card mobile)
src/components/whatsapp/KanbanBoard.tsx           (scroll + indicador)
src/components/whatsapp/KanbanColumn.tsx          (largura mínima)
src/components/whatsapp/KanbanDealCard.tsx        (densidade)
src/components/whatsapp/WhatsAppTab.tsx           (chat header)
src/components/whatsapp/ChatSidebar.tsx           (lista de conversas mobile)
src/components/whatsapp/ChatView.tsx              (header conversa)
src/components/admin/NetworkPanel.tsx             (grid equipe)
src/components/admin/ads/AdsCentralTab.tsx        (toolbar)
src/components/admin/dashboard/HeroKpis.tsx       (cards)
src/components/admin/dashboard/AdMetricsCards.tsx (cards)
src/components/admin/dashboard/MainChart.tsx      (altura)
src/index.css                                     (utility para fade-mask)
```

## Fora de escopo
- Mudar paleta, fontes, copy ou estrutura de dados.
- Esconder funcionalidade — só reorganizar visualmente.
- LP pública (`/ayla-viana` etc.) — só painel `/admin`.
- Refatorar lógica de filtros ou queries.

## Verificação
Vou conferir o resultado em 3 viewports: **390x844** (iPhone), **768x1024** (tablet) e **1280x720** (desktop) via screenshot do preview pra garantir que nada quebrou no caminho.

## Objetivo
Permitir redimensionar (arrastar) as colunas laterais nos painéis principais do `/admin`, com **trava de segurança** pra não arrastar sem querer. Tamanho escolhido é salvo por usuário/painel.

## Como funciona

1. **Toggle global "Layout 🔒 / 🔓"** no header do `/admin` (perto do botão Sair). 
   - 🔒 travado (padrão): handles invisíveis, não arrasta.
   - 🔓 destravado: handles aparecem como barra fininha vertical com aderência visual (hover verde + cursor `col-resize`). Salvo em `localStorage` como `igreen:layout-unlocked`.

2. **Componente novo `src/components/layout/ResizableShell.tsx`** — wrapper em cima de `react-resizable-panels` (já instalado) que:
   - Recebe `storageKey`, `direction`, e `panels: { id, defaultSize, minSize, maxSize, content }[]`.
   - Persiste tamanhos em `localStorage` (`igreen:layout:<storageKey>`).
   - Lê o estado global do lock e passa `disabled` para os handles (não arrasta quando travado).
   - Handles com `withHandle` (alça já existe em `ui/resizable.tsx`).

3. **Hook `useLayoutLock`** — pequeno `useSyncExternalStore` baseado em `window` event para o lock global.

## Onde aplicar

| Tab | Painéis redimensionáveis |
|---|---|
| Captação | `lista leads` ↔ `passos + feed` ↔ `ficha cliente` (3 colunas) |
| WhatsApp | `ChatSidebar` ↔ `ChatView` (2 colunas) |
| Clientes | `lista` ↔ `detalhe/edição` quando houver split |
| CRM | `KanbanBoard` colunas mantêm fluxo próprio; aplicar só se houver split lateral (filtros ↔ board) |
| Rede | `lista upline/downline` ↔ `detalhe` se existir split |
| Central de Anúncios | `lista anúncios` ↔ `editor/preview` |
| Dashboard | `cards principais` ↔ `painel lateral` (se aplicável) |

Em painéis sem split lateral (ex.: Dashboard só com grid), o lock não muda nada — apenas ignoro. Vou auditar cada tab e aplicar onde fizer sentido (não força split onde não tem).

## Mudanças por arquivo

- **NOVO** `src/components/layout/ResizableShell.tsx` — wrapper + persistência.
- **NOVO** `src/hooks/useLayoutLock.ts` — store do lock global.
- **NOVO** `src/components/layout/LayoutLockToggle.tsx` — botão 🔒/🔓 para o header.
- `src/pages/Admin.tsx` — monta o toggle no header.
- `src/components/captacao/CaptacaoPanel.tsx` — substituir o `flex md:flex-row` por `ResizableShell` (lista | centro | aside).
- `src/components/whatsapp/CrmTabs.tsx` (ou onde fica o split ChatSidebar/ChatView) — `ResizableShell` 2 colunas.
- `src/components/customers/...` — auditar; aplicar se houver split.
- `src/components/crm/...` — auditar; aplicar se houver split lateral.
- `src/components/rede/...`, `src/components/anuncios/...`, `src/components/dashboard/...` — aplicar onde houver split.

## Trava de segurança

- Lock **default = travado**. Usuário precisa clicar 🔓 explicitamente.
- Quando travado: `PanelResizeHandle` recebe `disabled` + `pointer-events: none` + opacidade 0 (não aparece).
- Quando destravado: handle visível com alça `GripVertical`, cursor `col-resize`, snap suave.
- Tamanhos persistem mesmo após travar de novo.
- Botão mostra estado atual e tooltip explicativo.

## Fora de escopo
- Não mexer em lógica de envio, bot, dados.
- Mobile (`<md`) continua stacked vertical sem resize — resize só ativa em `md+`.
- Não criar split onde não existe (ex.: não vou inventar sidebar no Dashboard se hoje é só grid).

## Arquivos a editar/criar
- NOVO `src/components/layout/ResizableShell.tsx`
- NOVO `src/components/layout/LayoutLockToggle.tsx`
- NOVO `src/hooks/useLayoutLock.ts`
- `src/pages/Admin.tsx`
- `src/components/captacao/CaptacaoPanel.tsx`
- Splits identificados em WhatsApp/Clientes/CRM/Rede/Anúncios após auditoria rápida.

# Implementation Plan

## Overview

Plano incremental para implementar a visualização em diagrama (`Modo_Diagrama`) no editor de fluxo (`/admin/fluxo`), conforme design aprovado. A implementação é totalmente aditiva: nenhuma alteração no engine de runtime, nenhuma mudança nas colunas existentes de `bot_flow_steps` (apenas adição da coluna `layout` jsonb nullable), e o `Modo_Lista` continua sendo o default.

A estratégia segue camadas concêntricas: começa pelos blocos puros e testáveis (tipos, hooks de mapeamento e layout), passa pelos componentes visuais (nós, arestas, toolbar, popovers), depois compõe o canvas raiz (`FlowDiagram`), integra hooks de UX (busca, métricas, export, viewport), faz a costura no `FluxoBuilder` via `ViewToggle` lazy-loaded, cobre acessibilidade e modo mobile, e fecha com testes integrados, regressão do engine e smoke test documentado.

Convenções:
- Sub-tarefas postfixadas com `*` são opcionais (testes). Não são auto-executadas; podem ser puladas para acelerar MVP.
- Cada sub-tarefa declara explicitamente os arquivos criados ou modificados, os requisitos validados (formato `R<n>.<m>`) e a Property validada (formato `Property N`) quando aplicável.
- Property tests usam `fast-check` (já adotado no projeto via vitest).

## Tasks

- [x] 1. Setup de schema, dependências e tipos
  - Preparar a base mínima para o restante das tarefas: nova coluna `layout`, novas dependências de UI/algoritmo e extensões de tipos compartilhados sem quebrar consumidores existentes.
  - _Mapeia para: R10.5, R10.7, R17.1, R17.2_

- [x] 1.1 Criar migration `20260601000000_add_layout_to_bot_flow_steps.sql`
  - Adicionar coluna `layout jsonb DEFAULT NULL` em `public.bot_flow_steps` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  - Incluir `COMMENT ON COLUMN` explicando que a coluna é cosmética para o `Modo_Diagrama` e não afeta runtime.
  - Validar idempotência rodando duas vezes contra base local.
  - Arquivos: `supabase/migrations/20260601000000_add_layout_to_bot_flow_steps.sql`
  - Mapeia para: R10.5, R17.2, R17.4

- [x] 1.2 Instalar dependências do canvas e auto-layout
  - Rodar `bun add @xyflow/react@^12.3.0 dagre@^0.8.5 html-to-image@1.11.11` e `bun add -d @types/dagre@^0.7.52`.
  - Verificar que `bun.lock`/`bun.lockb` foram atualizados e que `vite build` ainda completa sem erros de resolução.
  - Confirmar pinagem exata de `html-to-image@1.11.11` (recomendação oficial do React Flow para evitar regressões de export).
  - Arquivos: `package.json`, `bun.lock`, `bun.lockb`
  - Mapeia para: R2.1, R10.1, R16.3, R16.4

- [x] 1.3 Estender `flowTypes.ts` com tipos do diagrama
  - Adicionar `StepLayout = { x: number; y: number }`.
  - Adicionar campo opcional `layout?: StepLayout | null` na interface `Step`.
  - Adicionar constante `VALID_GOTO_SPECIAL = ["cadastro", "humano", "repeat"] as const` e tipo `GotoSpecial`.
  - Adicionar `DETERMINISTIC_INTENTS` (`Set<string>` com `default`, `palavra_chave`, `media_received`) e helper `isDeterministicIntent(intent)`.
  - Não remover nem renomear nada do tipo atual (especialmente `Transition.goto_special` que ainda lista `"ai"` legado — `useDiagramData` trata como `error-red` em runtime de mapping).
  - Arquivos: `src/components/admin/flow-builder/flowTypes.ts`
  - Mapeia para: R3.2, R10.5, R10.7, R17.1

- [x] 2. Implementar hook `useDiagramData` (mapping puro `Step[] → {nodes, edges}`)
  - Hook 100% puro, memoizado, sem efeitos colaterais nem chamadas a Supabase. É a fonte de verdade para o que o canvas renderiza dado um array de `Step`.
  - Cobre todas as 5 categorias visuais de aresta, colapso de transitions duplicadas, geração de `terminalsUsed`, propagação de warnings da `useFlowValidation`, estado de busca (`match`/`dim`/null) e atenuação por seleção.
  - Arquivos: `src/hooks/useDiagramData.ts`, `src/hooks/__tests__/useDiagramData.test.ts`
  - _Mapeia para: R2.1, R2.2, R3.1, R3.2, R3.3, R3.4, R3.5, R3.7, R3.8, R3.9, R7.1, R7.3, R8.4, R19.2_

- [x] 2.1 Implementar `useDiagramData`
  - Assinatura conforme design: `useDiagramData({ steps, validation, mediaCounts, metricsData, searchQuery, selectedId, dottedEdgesVisible })`.
  - Geração de nodes: 1 `flow` node por `Step` + 1 `terminal` node por `goto_special` único em `{cadastro, humano, repeat}`.
  - Geração de edges com categoria correta (`solid`, `dashed-amber`, `dotted-gray`, `ai-purple`, `error-red`) seguindo precedência do design.
  - Resolver `sourceHandle = btn:${button.id}` quando `trigger_phrases`/`trigger_intent` casa com `Botao_Interativo` (case-insensitive em title, exato em id).
  - Colapso de transitions com mesmo `(source, target)` em uma única edge com `collapsedTriggers` preenchido.
  - Cálculo de `searchState` por nó com normalização Unicode NFD removendo acentos e comparação case-insensitive.
  - Aplicar regra de menor opacidade entre faixa "inativa" (R2.4) e atenuação por seleção (R3.7) conforme R2.5.
  - `id` estável: `Node.id = step.id`, `Edge.id = ${stepId}-${targetId}-${transitionIdx}`.
  - Arquivos: `src/hooks/useDiagramData.ts`
  - Mapeia para: R2.1, R2.2, R2.4, R2.5, R3.1 a R3.5, R3.7, R3.8, R3.9, R7.3, R8.4, R19.2

- [ ]* 2.2 Unit tests para `useDiagramData`
  - Casos: 0 transitions + fallback `repeat` (com e sem `dottedEdgesVisible`); transition `goto_step_id` válido → `solid`; `trigger_intent="afirmacao"` → `ai-purple`; `goto_special="cadastro"` → terminal usado; `goto_special="ai"` legado → `error-red`; 2 transitions duplicadas → 1 edge colapsada; fallback `goto` para passo inativo → `error-red`; botão casando trigger → `sourceHandle = btn:<id>`; busca com acento → casa via NFD.
  - Usar `vitest` com snapshots semânticos (não DOM).
  - Arquivos: `src/hooks/__tests__/useDiagramData.test.ts`
  - Mapeia para: R3.1 a R3.5, R3.7, R3.8, R7.3, R8.4, R19.2

- [ ]* 2.3 Property test — Property 1 (idempotência do mapping)
  - **Property 1: Idempotência do mapping de dados**
  - **Validates: Requirements 4.1, 4.4, 4.5**
  - Usar `fast-check` para gerar arrays de `Step` arbitrários (entre 0 e 50 passos, com transitions, fallbacks e botões variados).
  - Asserções: `useDiagramData(steps).nodes.length === steps.length + terminalsUsed.size`; chamar duas vezes com mesmo input retorna nodes/edges semanticamente idênticos (mesmos `id`, mesma `category` por edge, mesma `data` chave-a-chave).
  - Arquivos: `src/hooks/__tests__/useDiagramData.property.test.ts`
  - Mapeia para: R4.1, R4.4, R4.5

- [ ]* 2.4 Property test — Property 3 (conservação de transitions na criação por handle)
  - **Property 3: Conservação do conjunto de Transitions**
  - **Validates: Requirements 6.3, 7.7**
  - Usar `fast-check` para gerar pares `(stepOrigem, stepDestino, button)` arbitrários.
  - Asserir que a função utilitária que produz a transition para arrasto a partir de handle de botão (extraída para `src/hooks/useDiagramData.ts` ou helper colocalizado) gera exatamente `{ trigger_phrases: [button.title, button.id], trigger_intent: "palavra_chave", goto_step_id: target, goto_special: null }`.
  - Asserir que arrasto a partir de handle default gera `{ trigger_phrases: [phrase], trigger_intent: intent || "palavra_chave", goto_step_id: target, goto_special: null }`.
  - Arquivos: `src/hooks/__tests__/transition-builder.property.test.ts`
  - Mapeia para: R6.3, R7.7

- [x] 3. Implementar hook `useDiagramLayout` (auto-layout dagre + persistência)
  - Hook responsável por aplicar coordenadas aos nodes (priorizando `layout` salvo, caindo para dagre quando ausente/inválido), persistir drag final com debounce de 500ms e oferecer "Reorganizar automaticamente" transacional.
  - Posiciona `terminals` em coluna fixa à direita conforme R10.2.
  - Arquivos: `src/hooks/useDiagramLayout.ts`, `src/hooks/__tests__/useDiagramLayout.test.ts`
  - _Mapeia para: R10.1, R10.2, R10.4, R10.5, R10.6, R10.7, R10.8, R10.9, R10.10, R10.13_

- [x] 3.1 Implementar `useDiagramLayout`
  - `layoutNodes(nodes)`: aplica `step.layout` quando válido (`{x, y}` numéricos finitos em `[-100000, 100000]`); demais nós passam por dagre com `rankdir="LR"`, `nodesep=80`, `ranksep=60` em subgrafo apenas dos nós sem layout válido (R10.7).
  - Posicionamento de terminals: `x = max(x_passo) + 240`, `y` distribuído com 100px entre eles começando em `min(y_passo)` (R10.2).
  - `saveNodePosition(stepId, position)` com debounce coalescente de 500ms por `stepId`. Em falha, mantém estado local, exibe `toast.error` e tenta novamente respeitando debounce até página ser deixada (R10.13).
  - `autoLayoutAll()`: snapshot do estado anterior + `useConfirm` + `update bot_flow_steps set layout = null where flow_id = $1` em uma única transação. Em falha, restaura snapshot e `toast.error` (R10.10).
  - Não invalidar `layout` ao mudar `position` (R10.8).
  - Arquivos: `src/hooks/useDiagramLayout.ts`
  - Mapeia para: R10.1, R10.2, R10.4, R10.7, R10.9, R10.10, R10.13

- [ ]* 3.2 Unit tests para `useDiagramLayout`
  - Casos: `layoutNodes` aplica `layout` salvo válido; `layout` inválido (NaN, fora do range, tipo errado) cai em dagre apenas para esse nó; terminals posicionados em coluna fixa; `saveNodePosition` com 3 chamadas em 500ms resulta em 1 update; `autoLayoutAll` chama update único `where flow_id = $1`; falha em update mantém estado local + agenda retry.
  - Mock do cliente Supabase via `vi.mock("@/integrations/supabase/client")`.
  - Arquivos: `src/hooks/__tests__/useDiagramLayout.test.ts`
  - Mapeia para: R10.1, R10.2, R10.4, R10.5, R10.7, R10.9, R10.13

- [ ]* 3.3 Property test — Property 7 (reorder não invalida layout)
  - **Property 7: Persistência de layout não interfere com reorder**
  - **Validates: Requirements 10.8**
  - Usar `fast-check` para gerar arrays de `Step` com `layout` válido. Aplicar permutação aleatória de `position`. Asserir que para cada `step.id`, o valor de `layout` permanece byte-a-byte igual antes e depois.
  - Arquivos: `src/hooks/__tests__/useDiagramLayout.property.test.ts`
  - Mapeia para: R10.8

- [x] 4. Checkpoint — Garantir que hooks puros e tipos passam em todos os testes
  - Ensure all tests pass, ask the user if questions arise.


- [x] 5. Implementar componentes do canvas (nós e arestas)
  - Construir os tijolos visuais que `FlowDiagram` (root) vai compor: o nó padrão equivalente a `StepCard`, o nó terminal sintético, a aresta unificada com 5 categorias visuais e o badge de warning.
  - _Mapeia para: R2.2, R2.3, R2.4, R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8, R3.9, R7.1, R7.2, R7.3, R7.4, R7.5, R7.6, R8.1, R8.2, R8.3, R8.5, R8.6, R8.7, R8.9, R13.1, R13.3_

- [x] 5.1 Implementar `FlowDiagramNode` (custom node)
  - Componente de nó padrão equivalente visual ao `StepCard` da lista, mas adaptado ao layout React Flow com `Handle` source/target.
  - Renderizar: posição, emoji do `step_type`, título truncado em 60 chars, preview de `message_text` truncado em 80 chars via `renderVarsPreview`, badges (IA livre, OCR, mídias, botões, regras), warning badge no canto superior esquerdo via `WarningBadge`.
  - Múltiplos handles source: 1 default à direita + 1 por `Botao_Interativo` com `id="btn:<button.id>"` (R7.3).
  - Aplicar opacidade conforme `is_active`, `searchState` e seleção (regra de menor opacidade R2.5).
  - Tooltip em badge "IA livre · Gemini" exibe `fallback.ai_prompt` truncado em 200 chars ou "Sem prompt customizado" (R8.5).
  - `role="button"`, `tabIndex={0}`, `aria-label` em pt-BR no formato `"Passo {position}: {title}, tipo {step_type_label}"` (R14.6).
  - Foco visível com contraste mínimo 3:1 (R14.1).
  - Arquivos: `src/components/admin/flow-builder/diagram/FlowDiagramNode.tsx`
  - Mapeia para: R2.2, R2.3, R2.4, R3.7, R3.9, R7.1, R7.3, R7.5, R8.1, R8.2, R8.3, R8.5, R14.1, R14.6

- [x] 5.2 Implementar `TerminalNode` (custom node sintético)
  - Componente para os 3 terminals: 📝 Cadastro, 👤 Humano, 🔁 Repetir.
  - Apenas `Handle type="target"`. `draggable: false`. Não abre Inspector em duplo-clique.
  - Visual minimal: ícone grande + label, fundo distinto do `FlowDiagramNode` (cinza claro com borda).
  - `aria-label` em pt-BR: `"Destino especial: {label}"`.
  - Arquivos: `src/components/admin/flow-builder/diagram/TerminalNode.tsx`
  - Mapeia para: R3.2, R6.8, R10.2, R14.6

- [x] 5.3 Implementar `FlowDiagramEdge` (custom edge unificada)
  - Aresta unificada com 5 categorias visuais (`solid`, `dashed-amber`, `dotted-gray`, `ai-purple`, `error-red`) conforme tabela do design.
  - Usar `getSmoothStepPath` para arestas verticais e `getBezierPath` para arestas que voltam (loop, R13.1) com curvatura mínima de 40px de diâmetro em auto-laços (R6.7).
  - `EdgeLabelRenderer` para posicionar label truncado em 40 chars com tooltip do `fullLabel` (R3.1).
  - Aplicar precedência visual de R8.9: quando `solid` e `ai-purple` saem do mesmo nó, `solid` recebe `strokeWidth ≥ 2x` e z-order superior.
  - Atenuar para 30% quando `data.dimmed === true` (R3.7).
  - Contraste de label respeitando WCAG 2.1 AA (R14.8) em ambos os temas.
  - Arquivos: `src/components/admin/flow-builder/diagram/FlowDiagramEdge.tsx`
  - Mapeia para: R3.1, R3.2, R3.3, R3.4, R3.5, R3.7, R3.8, R6.7, R8.4, R8.9, R13.1, R14.8

- [x] 5.4 Implementar `WarningBadge`
  - Badge "⚠" com `AlertTriangle` em cor destrutiva no canto superior esquerdo do nó.
  - Tooltip ao foco/hover por ≥300ms exibindo até 5 mensagens; `+N restantes` quando houver mais (R3.9).
  - Lê `warnings: FlowWarning[]` (já filtradas por `byStep[stepId]` pelo nó).
  - Arquivos: `src/components/admin/flow-builder/diagram/WarningBadge.tsx`
  - Mapeia para: R3.9

- [ ]* 5.5 Property test — Property 5 (precedência visual determinístico vs IA)
  - **Property 5: Visibilidade respeita precedência da IA**
  - **Validates: Requirements 8.9**
  - Snapshot/DOM test em `FlowDiagramEdge`: render dois edges saindo do mesmo source (`solid` e `ai-purple`). Asserir que `stroke-width` da `solid` é >= 2× da `ai-purple` e que a ordem de renderização (z-index ou ordem de filhos no SVG) coloca a `solid` por último.
  - Arquivos: `src/components/admin/flow-builder/diagram/__tests__/FlowDiagramEdge.test.tsx`
  - Mapeia para: R8.9

- [x] 6. Implementar componentes de interação (toolbar, popover, menu, viewport)
  - Camada de interação que vive dentro do `<ReactFlow>` mas é independente da representação dos nós/arestas: barra superior, popover de transition, menu de contexto.
  - _Mapeia para: R2.6, R2.7, R2.8, R2.9, R3.6, R5.3, R5.4, R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7, R6.8, R6.9, R9.1, R9.3, R9.10, R10.9, R16.1, R16.2, R19.1_

- [x] 6.1 Implementar `DiagramToolbar`
  - Barra superior do canvas (renderizada via `<Panel position="top-left">`).
  - Conteúdo: campo de busca (R19.1) com placeholder "Buscar por título ou step_key" e atalho `Ctrl+K`/`Cmd+K`; toggle "Mostrar sequência" (R3.6); toggle "Métricas" + label "últimos 30 dias" (R9.1, R9.3); botão "Atualizar métricas" (R9.10); botão "Centralizar" (R2.8); botão "Reorganizar automaticamente" (R10.9); menu "Exportar" → "PNG" / "SVG" (R16.1, R16.2).
  - Todos os controles focalizáveis via Tab, ativáveis via Enter/Espaço, com `aria-label` em pt-BR (R14.7).
  - Arquivos: `src/components/admin/flow-builder/diagram/DiagramToolbar.tsx`
  - Mapeia para: R2.8, R3.6, R9.1, R9.3, R9.10, R10.9, R14.7, R16.1, R16.2, R19.1

- [x] 6.2 Implementar `TransitionPopover` (criação e edição)
  - Popover compacto para criar (`kind: "create"`) ou editar (`kind: "edit"`) transition.
  - Campo de texto `trigger_phrase` (60 chars max) + select `trigger_intent` com presets (`palavra_chave`, `afirmacao`, `negacao`, `interesse_alto`, `media_received` + `BUTTON_PRESETS`).
  - Botões "Confirmar" e "Cancelar"; em modo edit, também "Remover" e "Redirecionar" (selector listando passos da Variante atual) — R6.5.
  - Validação client-side: bloquear confirmação quando phrase e intent ambos vazios; exibir mensagem inline "Informe pelo menos um gatilho" (R6.3).
  - Posicionamento próximo ao ponto de soltura (R6.2) — abrir em ≤200ms.
  - Arquivos: `src/components/admin/flow-builder/diagram/TransitionPopover.tsx`
  - Mapeia para: R6.2, R6.3, R6.5, R6.6

- [x] 6.3 Implementar `NodeContextMenu`
  - Menu de contexto via `onNodeContextMenu` (clique direito) com itens "Editar", "Duplicar", "Ativar/Desativar", "Remover" (R5.3).
  - Cada item dispara o callback equivalente do Modo_Lista recebido por props.
  - "Remover" usa o mesmo `useConfirm` (mesmo título/descrição/tom) do Modo_Lista (R5.4).
  - Fecha em `onPaneClick`, `Esc` ou clique fora.
  - `aria-label` e suporte a teclado (`Tab` + `Enter`).
  - Arquivos: `src/components/admin/flow-builder/diagram/NodeContextMenu.tsx`
  - Mapeia para: R5.3, R5.4

- [x] 7. Implementar `FlowDiagram` (componente raiz do canvas)
  - Container do canvas que compõe todos os componentes anteriores, instancia `<ReactFlow>` e gerencia o estado interno (popovers, menu de contexto, viewport, etc.). Reúne os 6 hooks de UX adicional ao redor.
  - _Mapeia para: R2.1, R2.6, R2.7, R2.8, R2.9, R2.10, R3.6, R3.7, R4.1, R4.2, R4.4, R4.6, R4.7, R5.1, R5.2, R5.5, R5.6, R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7, R6.8, R6.9, R7.7, R7.8, R10.1, R10.3, R10.4, R10.11, R11.1, R11.6, R11.7, R12.2, R12.5, R12.6, R13.2, R13.5, R14.4_

- [x] 7.1 Esqueleto de `FlowDiagram` com `<ReactFlow>` e tipos de nó/aresta registrados
  - Criar componente raiz com a interface `FlowDiagramProps` definida no design.
  - Registrar `nodeTypes = { flow: FlowDiagramNode, terminal: TerminalNode }` e `edgeTypes = { default: FlowDiagramEdge }` em constantes de módulo (evita re-render).
  - Configurar `<ReactFlow>` com `minZoom=0.25`, `maxZoom=2`, `fitView`, `fitViewOptions={{ padding: 0.15 }}`, `proOptions={{ hideAttribution: true }}`.
  - Adicionar `<Background />`, `<Controls showInteractive={false} />`, `<MiniMap pannable zoomable nodeStrokeWidth={3} />`.
  - Wrap em `<ReactFlowProvider>` para permitir uso de `useReactFlow` em filhos.
  - Estado vazio (R2.10): quando `steps.length === 0`, renderizar mesmo texto/atalho do Modo_Lista atual.
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R2.1, R2.6, R2.7, R2.9, R2.10

- [x] 7.2 Cablagem de `useDiagramData` + `useDiagramLayout` em `FlowDiagram`
  - Invocar `useDiagramData(...)` com props recebidos e estado interno (`searchQuery`, `selectedId`, `dottedEdgesVisible`).
  - Invocar `useDiagramLayout(...)` e aplicar `layoutNodes(nodes)` antes de passar a `<ReactFlow>`.
  - `onNodeDragStop`: chama `saveNodePosition(stepId, position)`.
  - Conectar `autoLayoutAll` ao botão "Reorganizar automaticamente" da toolbar.
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R10.1, R10.3, R10.4, R10.9, R12.2

- [x] 7.3 Handlers de seleção, duplo-clique e menu de contexto
  - `onNodeClick`: chama `onSelectStep(node.id)` (R5.1) — atualiza preview WhatsApp em ≤200ms (R5.1).
  - `onNodeDoubleClick`: chama `onOpenInspector(node.id)` exceto para `terminal` nodes (R5.2, R18.1).
  - `onNodeContextMenu`: posiciona `NodeContextMenu` no ponto do clique (R5.3).
  - `onPaneClick`: fecha popovers e menus abertos (R6.5).
  - Listener de teclado: `Enter` no nó focado = `onSelectStep` (R14.2); `F2` = `onOpenInspector` (R14.3); setas = mover foco ao vizinho mais próximo no cone de 90° (R14.4, R14.5).
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R5.1, R5.2, R5.3, R5.4, R14.2, R14.3, R14.4, R14.5, R18.1

- [x] 7.4 Handlers de criação/edição/remoção de aresta
  - `onConnectStart` / `onConnect` / `onConnectEnd`: ao soltar sobre nó válido (mesmo `flow_id`, R11.6), abrir `TransitionPopover` em modo `create`.
  - Em `onConnect`, validar `isValidConnection` (mesma Variante, mesmo `flow_id` — R11.6, R11.7). Solta sobre canvas vazio cancela sem persistir (R6.4).
  - Drag de handle de botão (`sourceHandle = "btn:<id>"`): ao confirmar, persistir transition `{ trigger_phrases: [btn.title, btn.id], trigger_intent: "palavra_chave", goto_step_id: target, goto_special: null }` (R7.7).
  - Drag de handle default: confirmar com input do popover, persistir `{ trigger_phrases: [phrase], trigger_intent: intent || "palavra_chave", goto_step_id: target, goto_special: null }`.
  - Drag até `TerminalNode`: abrir popover; ao confirmar, persistir `{ trigger_phrases: [phrase], trigger_intent: intent, goto_step_id: null, goto_special: terminalKind }` (R6.8).
  - Auto-laço (origem === destino): permitir, sem warning (R6.7, R13.3).
  - Clique em aresta existente: abrir popover em modo `edit` (R6.5).
  - Em qualquer falha de persist (`onPatchStep` rejeitar): reverter estado local + `toast.error` + retry; não deixar aresta-fantasma (R6.9, R7.8).
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6, R6.7, R6.8, R6.9, R7.7, R7.8, R11.6, R11.7, R13.3

- [x] 7.5 Handler de "Adicionar passo" via canvas
  - Botão "Adicionar passo" no toolbar (ou menu de contexto sobre canvas vazio): chama `onAddStep(initialPosition)` com coordenadas dentro da viewport visível.
  - Buscar área com offset ≥40px no espaço do canvas em relação a qualquer nó existente; se não houver, posicionar no centro da viewport (R5.5).
  - Inicializar `layout = { x, y }` no insert (R10.11).
  - Botão fica desabilitado durante `insert` em andamento para evitar nó-fantasma (R5.6, Error Scenario 7).
  - Em falha, reabilitar botão + `toast.error`.
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R5.5, R5.6, R10.11

- [x] 7.6 Realce de ciclos no hover (R13.2, R13.5)
  - `onNodeMouseEnter`: detectar se o nó pertence a algum ciclo no grafo de transitions explícitas (origem → ... → origem usando apenas Arestas_Solidas) com até 50 passos no ciclo. Reusar a função `detectCycles` de `useFlowValidation.ts` (mover para helper compartilhado em `flowTypes.ts` ou `src/hooks/useDiagramData.ts` se necessário) ou implementar busca DFS local memoizada.
  - Realçar todos os nós do ciclo em ≤200ms com indicador visual ("ciclo").
  - Limitar realce aos 50 primeiros ciclos detectados; exibir indicador informativo quando há mais (R13.5).
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R13.2, R13.5

- [x] 7.7 Aviso de mais de 200 passos (R12.5, R12.6)
  - Quando `steps.length > 200`, exibir banner dispensável recomendando segmentar fluxo, sem bloquear interações.
  - Persistir dispensa em sessão (não localStorage — re-aparece em novo carregamento).
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R12.5, R12.6

- [x] 8. Checkpoint — Canvas funcional com edição básica
  - Ensure all tests pass, ask the user if questions arise.


- [x] 9. Implementar hooks de UX adicional
  - Hooks que tangenciam o canvas via `useReactFlow()` e localStorage/Supabase, mas que não são essenciais para o canvas renderizar — podem ser plugados depois do esqueleto.
  - _Mapeia para: R1.4, R1.7, R9.2, R9.7, R9.10, R10.14, R16.3, R16.4, R16.5, R16.6, R16.7, R16.8, R19.1, R19.2, R19.3, R19.4, R19.5, R19.6_

- [x] 9.1 Implementar `useDiagramSearch`
  - Hook para busca por título/`step_key` com normalização Unicode NFD.
  - Atalho global `Ctrl+K`/`Cmd+K` que foca o input via `inputRef` (R19.1).
  - `next()` cicla pelos matches em ordem ascendente de `position`, centralizando a viewport via `setCenter(node.position.x, node.position.y, { zoom: getZoom(), duration: 500 })` sem alterar zoom (R19.3, R19.4).
  - Esvaziar input ou pressionar `Esc` restaura opacidade (R19.5).
  - Texto auxiliar "Nenhum passo encontrado" quando `matches === 0` (R19.6).
  - Arquivos: `src/hooks/useDiagramSearch.ts`
  - Mapeia para: R19.1, R19.2, R19.3, R19.4, R19.5, R19.6

- [x] 9.2 Implementar `useDiagramMetrics`
  - Hook que consulta `v_flow_step_funnel` filtrando `consultant_id` e cacheia o resultado por `(consultantId, variant)` em estado React.
  - Trigger de fetch: quando `enabled` muda para `true` ou quando `refresh()` é chamado (sem polling, R9.10).
  - Em falha: estado `error` populado, toast warning, mas `enabled` permanece `true` para permitir retry (R9.7).
  - Mapear linhas em `Map<step_key, FunnelRow>` para lookup O(1) no `FlowDiagramNode`.
  - Arquivos: `src/hooks/useDiagramMetrics.ts`
  - Mapeia para: R9.2, R9.7, R9.9, R9.10

- [x] 9.3 Implementar `useDiagramExport`
  - Hook para exportar PNG/SVG via `html-to-image`.
  - Calcular bounds com `getNodesBounds(reactFlowInstance.getNodes())`, viewport com `getViewportForBounds(bounds, w, h, 0.5, 2, 20)`.
  - PNG: `toPng(el, { backgroundColor: '#fff', pixelRatio: 2, width, height, style: { transform: ... } })`.
  - SVG: `toSvg(el, { backgroundColor: '#fff', width, height, style: { transform: ... } })`.
  - Nome de arquivo: `fluxo-{consultantSlug}-variante-{variant}-{YYYYMMDD}.{ext}`.
  - Timeout de 10s; em falha, `toast.error("Não foi possível exportar o diagrama. Tente novamente.")` (R16.7).
  - Estado `exporting` bloqueia botão durante operação (R16.8).
  - Arquivos: `src/hooks/useDiagramExport.ts`
  - Mapeia para: R16.3, R16.4, R16.5, R16.6, R16.7, R16.8

- [x] 9.4 Implementar `useViewportPersistence`
  - Subscribe ao evento `onMove` do React Flow com debounce de 500ms.
  - Gravar `{x, y, zoom}` em `localStorage` na chave `flow-viewport:{consultantId}:{variant}` (R10.14).
  - Na montagem, restaurar via `setViewport()` se válido.
  - Falha em `localStorage` é silenciosa (R1.7, R10.14).
  - Validar zoom no intervalo `[0.25, 2.0]`.
  - Arquivos: `src/hooks/useViewportPersistence.ts`
  - Mapeia para: R10.14, R1.7

- [ ]* 9.5 Unit tests para hooks de UX
  - `useDiagramSearch`: normalização NFD (busca "duvida" casa "Dúvida"); ciclo retorna ao primeiro após último; esvaziar input restaura opacidade.
  - `useDiagramMetrics`: enabled=false não dispara fetch; enabled=true dispara fetch único; refresh() dispara novo fetch; trocar variant invalida cache.
  - `useDiagramExport`: nome de arquivo formatado corretamente para diferentes slugs; timeout simulado dispara toast e libera `exporting`.
  - `useViewportPersistence`: setItem com key correta; falha em setItem não throwa; restore com valor inválido cai em viewport default.
  - Arquivos: `src/hooks/__tests__/useDiagramSearch.test.ts`, `src/hooks/__tests__/useDiagramMetrics.test.ts`, `src/hooks/__tests__/useDiagramExport.test.ts`, `src/hooks/__tests__/useViewportPersistence.test.ts`
  - Mapeia para: R9.2, R9.7, R10.14, R16.3, R19.2, R19.4

- [x] 10. Integrar `Modo_Diagrama` no `FluxoBuilder` via `ViewToggle`
  - Costura final no editor: toggle no header, lazy-load do canvas, render condicional, sync com Inspector e WhatsAppPreview.
  - _Mapeia para: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R4.1, R4.2, R4.6, R4.7, R4.8, R4.9, R11.1, R11.2, R11.3, R11.5, R12.3, R15.1, R18.1, R18.2, R18.3, R18.4, R18.5_

- [x] 10.1 Implementar `ViewToggle`
  - Controle segmentado no header com 2 opções "Lista" e "Diagrama" (R1.1).
  - Tooltip "Melhor visualização em desktop" sobre "Diagrama" quando `diagramHint=true` (R15.1, viewport 768-1023px).
  - Persistir escolha em `localStorage` na chave `flow-view-mode` (R1.4).
  - Suporte a teclado completo (Tab, Enter/Espaço, setas dentro do tabgroup).
  - Arquivos: `src/components/admin/flow-builder/ViewToggle.tsx`
  - Mapeia para: R1.1, R1.4, R14.7, R15.1

- [x] 10.2 Lazy-load de `FlowDiagram` em `FluxoBuilder`
  - Adicionar `const FlowDiagram = React.lazy(() => import("@/components/admin/flow-builder/FlowDiagram"))`.
  - Adicionar state `viewMode` com leitura inicial do localStorage (fallback "lista" se valor ausente, vazio ou inválido — R1.5; fallback silencioso em falha de localStorage — R1.7).
  - Persistir `viewMode` em localStorage antes do fim da transição (R1.4).
  - Render condicional: quando `viewMode === "diagrama"`, renderizar `<Suspense fallback={<Loader2 />}><FlowDiagram ... /></Suspense>`; caso contrário, lista atual (R1.2, R1.3, R1.5).
  - Preservar `selectedId`, `inspectorId`, `editingVariant`, scroll position e estado do Inspector ao alternar (R1.3, R1.6).
  - Arquivos: `src/pages/FluxoBuilder.tsx`
  - Mapeia para: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7

- [x] 10.3 Cablagem de props compartilhadas (`steps`, `validation`, callbacks)
  - Passar para `FlowDiagram`: `steps`, `selectedId`, `consultantId`, `consultantName`, `consultantSlug`, `flowId`, `editingVariant`, `mediaCounts`, `validation`, `readOnly` (false em desktop), e callbacks `onSelectStep`, `onOpenInspector`, `onPatchStep`, `onAddStep`, `onDuplicateStep`, `onDeleteStep`, `onAutoFixAll`.
  - Garantir que mutations no canvas usam exatamente as mesmas funções `patchStep`, `addStep`, `duplicateStep`, `deleteStep`, `autoFixAll` já existentes — sem fork (R4.1, R4.4, R4.9, Property 2).
  - Computar `consultantSlug` conforme glossário: `consultants.slug` → fallback NFD do `name` → fallback 8 primeiros chars do `id`.
  - Arquivos: `src/pages/FluxoBuilder.tsx`
  - Mapeia para: R4.1, R4.2, R4.4, R4.6, R4.7, R4.8, R4.9, R11.1, R11.5, R18.1, R18.2, R18.3

- [x] 10.4 Carregamento de `layout` no `reload()`
  - Atualizar a query `select * from bot_flow_steps` (já é `select *`, então `layout` já vem).
  - Adicionar `layout: r.layout ?? null` no parsing do `reload()` para tipagem correta.
  - Recarregar `Modo_Diagrama` ao trocar variante (R11.2): hook já cuida via reset de `useDiagramLayout` quando `flowId` muda; verificar reset de viewport persistido por variant.
  - Em falha de reload de variante, preservar estado anterior + `toast.error` (R11.3).
  - Arquivos: `src/pages/FluxoBuilder.tsx`
  - Mapeia para: R4.1, R10.6, R11.2, R11.3

- [ ]* 10.5 Integration test — Toggle Lista ↔ Diagrama (R1)
  - Render `<FluxoBuilder />` com mock de Supabase retornando 5 steps.
  - Clicar em "Diagrama" → área principal substituída por canvas em ≤500ms; localStorage gravado.
  - Recarregar (`render` novo) com `localStorage.flow-view-mode = "diagrama"` → abre direto no canvas.
  - Selecionar nó no canvas → `selectedId` atualiza → preview WhatsApp reflete.
  - Editar título no Inspector via canvas → `StepCard` da lista (renderizado em paralelo via re-toggle) reflete em ≤1s.
  - Arquivos: `src/pages/__tests__/FluxoBuilder.diagram.integration.test.tsx`
  - Mapeia para: R1.1, R1.2, R1.3, R1.4, R1.5, R4.2, R5.1, R18.2

- [ ]* 10.6 Property test — Property 9 (falhas não deixam UI inconsistente)
  - **Property 9: Falhas de persistência nunca deixam UI em estado inconsistente**
  - **Validates: Requirements 4.3, 4.5, 6.9, 7.8, 10.10, 10.13**
  - Usar `fast-check` para gerar sequências arbitrárias de operações (criar transition, editar transition, remover transition, mover nó, autoLayoutAll) intercaladas com falhas de Supabase (mock que retorna erro com probabilidade `p`).
  - Asserir invariante após cada operação: o array `steps` em estado React é igual ao snapshot pré-operação (rollback completo) OU o estado é mantido COM indicador de erro visível (caso de drag de posição, R10.13). NUNCA estado parcial sem indicação.
  - Mock de cliente Supabase com modo "fail random" controlável.
  - Arquivos: `src/pages/__tests__/FluxoBuilder.errorRecovery.property.test.tsx`
  - Mapeia para: R4.3, R4.5, R6.9, R7.8, R10.10, R10.13

- [x] 11. Checkpoint — Modo_Diagrama integrado e funcional end-to-end
  - Ensure all tests pass, ask the user if questions arise.


- [x] 12. Acessibilidade e modo somente leitura mobile
  - Garantir conformidade com WCAG 2.1 AA, navegação total por teclado e modo somente leitura em viewport <768px.
  - _Mapeia para: R14.1, R14.2, R14.3, R14.4, R14.5, R14.6, R14.7, R14.8, R14.9, R15.1, R15.2, R15.3, R15.4, R15.5_

- [x] 12.1 Modo somente leitura em viewport pequena
  - Hook `useViewportWidth` ou listener `resize` em `FluxoBuilder` que computa `readOnly = window.innerWidth < 768`.
  - Passar `readOnly={true}` para `FlowDiagram` quando viewport <768px (R15.2).
  - Em `FlowDiagram`, quando `readOnly`: setar `nodesDraggable={false}`, `nodesConnectable={false}`, `edgesUpdatable={false}`; ocultar/desabilitar botão "Adicionar passo", "Reorganizar automaticamente", menu de contexto.
  - Pan e zoom permanecem habilitados (R15.2).
  - Mensagem persistente e dispensável: "Edição via canvas indisponível em telas estreitas — use a Lista para editar" (R15.3).
  - Duplo-clique continua abrindo Inspector (R15.3).
  - Transição automática quando viewport cresce/encolhe (R15.4) sem reload.
  - Arquivos: `src/pages/FluxoBuilder.tsx`, `src/components/admin/flow-builder/FlowDiagram.tsx`
  - Mapeia para: R15.1, R15.2, R15.3, R15.4, R15.5

- [x] 12.2 Navegação por teclado completa no canvas
  - Listener `keydown` em `FlowDiagram` quando há nó focado:
    - `Enter` → `onSelectStep` (R14.2)
    - `F2` → `onOpenInspector` (R14.3)
    - Setas → mover foco ao nó vizinho mais próximo dentro de cone de 90° na direção pressionada, com menor distância euclidiana ao centro (R14.4); foco permanece se cone vazio (R14.5)
    - `Esc` → fechar popovers/menus abertos
  - `Tab` percorre nós em ordem ascendente de `position` (R14.1) — usar `tabIndex={0}` na ordem certa via prop `data-position`.
  - Indicador de foco visível com contraste ≥3:1 (R14.1).
  - Arquivos: `src/components/admin/flow-builder/FlowDiagram.tsx`, `src/components/admin/flow-builder/diagram/FlowDiagramNode.tsx`
  - Mapeia para: R14.1, R14.2, R14.3, R14.4, R14.5

- [x] 12.3 Aria labels e contraste em todos os controles
  - Garantir `aria-label` em pt-BR descritivo da ação para: toggle "Métricas", "Centralizar", controles de zoom, "Reorganizar automaticamente", "Atualizar métricas", "Exportar", toggle "Mostrar sequência" (R14.7).
  - Verificar contraste mínimo 4.5:1 entre texto de rótulo de aresta e fundo do canvas em ambos os temas (claro/escuro) (R14.8).
  - Validar que todos os textos novos (rótulos, badges, mensagens vazias, tooltips, popovers, mensagens de erro, modais) estão em pt-BR (R14.9).
  - Arquivos: `src/components/admin/flow-builder/diagram/*.tsx`
  - Mapeia para: R14.7, R14.8, R14.9

- [ ]* 12.4 Accessibility tests com axe-core
  - Rodar `axe-core` sobre o canvas renderizado (via `vitest-axe` ou `@axe-core/playwright` no E2E).
  - Asserir zero violações de severidade `serious` ou `critical`.
  - Teste manual documentado: NVDA anuncia cada nó conforme R14.6.
  - Arquivos: `src/components/admin/flow-builder/__tests__/FlowDiagram.a11y.test.tsx`
  - Mapeia para: R14.1, R14.6, R14.7, R14.8

- [ ]* 12.5 Property test — Property 8 (toda interação tem caminho por teclado)
  - **Property 8: Acessibilidade — toda interação tem caminho por teclado**
  - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.7, 19.1**
  - E2E Playwright sem mouse: percorrer checklist do design (selecionar nó, abrir Inspector, mover foco, ativar toggle, buscar, centralizar, exportar) usando apenas Tab/Enter/Espaço/F2/setas/Ctrl+K.
  - Arquivos: `playwright/flow-diagram-keyboard.spec.ts`
  - Mapeia para: R14.1, R14.2, R14.3, R14.4, R14.7, R19.1

- [ ] 13. Testes de integração end-to-end e performance
  - Validar fluxos críticos completos com Playwright e medir performance contra alvos do R12.
  - _Mapeia para: R4.1, R4.2, R4.4, R6.3, R10.1, R10.4, R12.1, R12.3, R12.4, R16.3, R19.3_

- [ ]* 13.1 E2E Playwright — Cenário "consultor leigo desenha fluxo"
  - Acessa `/admin/fluxo`, alterna para Modo_Diagrama via toggle.
  - Clica "Adicionar passo" → novo nó aparece dentro da viewport.
  - Arrasta handle do nó 1 para o nó 2 → popover abre com input vazio.
  - Digita "sim" no campo trigger_phrase → confirma → aresta `solid` aparece com label "sim" em ≤1s.
  - Atualiza a página → nó e aresta persistem.
  - Volta para Modo_Lista → nó e regra aparecem na lista.
  - Arquivos: `playwright/flow-diagram.spec.ts`
  - Mapeia para: R1.5, R4.1, R5.5, R6.3, R10.6, R10.11

- [ ]* 13.2 E2E Playwright — Cenário "exportar PNG"
  - Modo_Diagrama com 5 nós.
  - Clica "Exportar" → "PNG".
  - Verifica download iniciado com nome `fluxo-*-variante-A-*.png` em ≤10s.
  - Arquivos: `playwright/flow-diagram-export.spec.ts`
  - Mapeia para: R16.3, R16.6

- [ ]* 13.3 E2E Playwright — Cenário "métricas"
  - Modo_Diagrama, ativar Toggle "Métricas".
  - Verificar que percentuais aparecem nos nós com `step_key` presente em `v_flow_step_funnel` em ≤2s.
  - Clicar "Atualizar métricas" → re-fetch.
  - Trocar Variante → métricas recarregadas para nova variante em ≤2s.
  - Arquivos: `playwright/flow-diagram-metrics.spec.ts`
  - Mapeia para: R9.2, R9.4, R9.9, R9.10

- [ ]* 13.4 Performance test — render e drag com 200 nós
  - Setup: gerar 200 steps fake em memória (sem persistir), renderizar `<FlowDiagram>` em ambiente controlado.
  - Medir: tempo até primeiro paint do canvas (alvo <1500ms — R12.3); latência de drag de um nó até 100 nós (alvo <100ms — R12.1) e entre 101-200 nós (alvo <200ms).
  - Verificar memória estável após 5 min via heap snapshot (sem leaks).
  - Verificar que `update bot_flow_steps.layout` é throttle de no máximo 1 chamada por nó a cada 500ms durante drag contínuo (R12.4).
  - Arquivos: `playwright/flow-diagram-performance.spec.ts`
  - Mapeia para: R12.1, R12.3, R12.4

- [ ] 14. Property tests adicionais (estado e isolamento)
  - Cobrir as Properties 2, 4, 6 que requerem testes específicos.
  - _Mapeia para: R4.1, R11.4, R17.1, R17.4, R17.5_

- [ ]* 14.1 Property test — Property 2 (single source of truth para `steps`)
  - **Property 2: Single source of truth para `steps`**
  - **Validates: Requirements 4.1**
  - Inspeção estática via lint customizado (eslint rule) ou test de árvore de componentes que falha se algum filho do `FluxoBuilder` mantiver `useState<Step[]>` próprio.
  - Implementar como teste estático: parsear AST de `src/components/admin/flow-builder/diagram/**/*.tsx` e `src/hooks/useDiagram*.ts` procurando declarações `useState<Step[]>` ou padrão `useState(...steps)`.
  - Arquivos: `src/components/admin/flow-builder/__tests__/single-source-of-truth.test.ts`
  - Mapeia para: R4.1

- [ ]* 14.2 Property test — Property 6 (isolamento entre variantes)
  - **Property 6: Compatibilidade entre variantes (isolamento)**
  - **Validates: Requirements 11.4**
  - Integration test: criar 2 variantes A e B do mesmo consultor, mover nó em A, trocar para B, asserir que `layout` em B não foi alterado em nenhum step.
  - Asserir que toda chamada `update bot_flow_steps set layout = $1` foi feita com `where id IN (...)` cujos IDs pertencem ao `flow_id` da variante atualmente em edição.
  - Arquivos: `src/hooks/__tests__/useDiagramLayout.variantIsolation.test.ts`
  - Mapeia para: R11.4

- [x] 15. Regression — engine de runtime não foi afetado
  - Garantir que nenhum contrato com Whapi/Evolution mudou e que migrations existentes continuam compatíveis.
  - _Mapeia para: R17.1, R17.2, R17.3, R17.4, R17.5, R17.6_

- [x] 15.1 Rodar suíte Deno de `_shared/flow-engine`
  - Executar `deno test supabase/functions/_shared/flow-engine/__tests__/` e `supabase/functions/_shared/flow-engine/engine_test.ts`.
  - Asserir que toda a suíte passa sem alterações de código no engine.
  - Documentar comando exato no PR para CI rodar automaticamente.
  - Arquivos: nenhum (apenas execução)
  - Mapeia para: R17.1, R17.3, R17.4, R17.5
  - Validates Property: Property 4 (não-alteração do payload de runtime)

- [ ]* 15.2 Property test — Property 4 (payload de runtime byte-a-byte idêntico)
  - **Property 4: Não-alteração do payload de runtime**
  - **Validates: Requirements 17.1, 17.4, 17.5**
  - Snapshot test em Deno: dado um `bot_flow_steps` fixture pré-existente, executar `dispatcher.ts`/`router.ts` e capturar o payload enviado a `_shared/channels/whapi.ts` e `_shared/channels/evolution.ts`.
  - Asserir que com `layout = null` e com `layout = {x: 100, y: 200}` o payload é byte-a-byte idêntico (a coluna `layout` é completamente ignorada pelo engine).
  - Snapshot deve ser commitado e revisado em PRs futuros.
  - Arquivos: `supabase/functions/_shared/flow-engine/__tests__/runtime-payload.snapshot.test.ts`
  - Mapeia para: R17.4, R17.5

- [x] 15.3 Validar migration em snapshot do banco de dev
  - Aplicar `20260601000000_add_layout_to_bot_flow_steps.sql` em snapshot de dev.
  - Asserir que: (a) coluna `layout` existe como `jsonb DEFAULT NULL`; (b) registros pré-existentes têm `layout = NULL`; (c) `seed_default_camila_flow` continua funcionando sem alterações; (d) RLS de `bot_flow_steps` continua aplicável.
  - Documentar rollback: `ALTER TABLE public.bot_flow_steps DROP COLUMN layout;` é seguro porque `layout` é nullable e nunca lido pelo engine.
  - Arquivos: nenhum (apenas execução + documentação no PR)
  - Mapeia para: R17.2, R17.3, R17.6

- [x] 16. Smoke test manual e checklist final
  - Validação manual cobrindo o cenário do consultor leigo (do design > Testing Strategy > E2E) em ambiente de dev rodando localmente.
  - _Mapeia para: R1.1, R2.1, R5.1, R5.2, R5.5, R6.3, R10.1, R10.4, R11.2, R16.3, R19.1_

- [x] 16.1 Smoke test manual — fluxo completo do consultor leigo
  - Pré-condição: usuário tem ao menos 1 fluxo seedado (`seed_default_camila_flow`) e está logado em `/admin/fluxo`.
  - Roteiro: (1) Toggle "Diagrama" → canvas abre; (2) ver todos os 38+ passos do template Camila auto-layoutados horizontalmente; (3) clicar nó → preview WhatsApp reflete; (4) duplo-clique nó → Inspector abre; editar título → fechar Inspector → toggle Lista → ver título atualizado; (5) toggle Diagrama de novo → arrastar handle de um nó para outro → digitar "sim" → confirmar → aresta sólida aparece; (6) `Ctrl+K` → digitar "duvida" → primeiro nó casado é centralizado; `Enter` cicla; (7) ativar toggle "Métricas" → percentuais aparecem nos nós com dados; (8) clicar "Exportar" → "PNG" → download inicia; (9) reload da página → variante A continua no Modo_Diagrama com mesmo layout, mesmas regras criadas; (10) trocar para variante B → canvas reseta para variante B com layout próprio.
  - Cobertura cruzada: cada passo do roteiro mapeia para 1+ requisito; falhas em qualquer ponto são bug bloqueante.
  - Arquivos: `docs/flow-diagram-smoke-test.md` (checklist em markdown commitada para referência futura)
  - Mapeia para: R1.1, R1.2, R1.5, R2.1, R5.1, R5.2, R6.3, R9.4, R10.1, R10.6, R11.2, R16.3, R19.1, R19.3

- [x] 16.2 Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marcadas com `*` são opcionais (testes); podem ser puladas para acelerar MVP, mas a Property 1, Property 3 e Property 9 (idempotência, conservação de transitions, falhas sem estado inconsistente) são particularmente importantes para confiar na sincronização Lista ↔ Diagrama.
- Cada task referencia requisitos específicos para rastreabilidade direta no PR review.
- Checkpoints (4, 8, 11, 16.2) garantem validação incremental: hooks puros → canvas funcional → integração end-to-end → smoke test.
- O hook `useFlowValidation` existente é reutilizado integralmente; nenhuma modificação é necessária. A função `detectCycles` interna pode precisar ser exportada para o realce de ciclos no canvas (Task 7.6) — extração simples sem mudança de comportamento.
- A coluna `layout` é estritamente cosmética. O engine de runtime nunca a lê. A migration é trivialmente reversível (`DROP COLUMN`) sem perda de dados de produção.
- Property tests usam `fast-check` (já adotado no projeto). A regressão do engine usa Deno test runner conforme padrão do `supabase/functions/_shared/flow-engine/__tests__/`.

## Risk Mitigation

| Risco | Severidade | Mitigado por |
|---|---|---|
| Engine de runtime regredir | Crítico | Task 15.1 (regression Deno) + Task 15.2 (snapshot byte-a-byte do payload) + ausência total de mudanças em `_shared/channels/*` e `flow-router.ts` |
| Layout salvo corromper banco | Médio | Task 1.3 valida tipo no parsing; Task 3.1 valida range `[-100000, 100000]`; coluna é nullable e independente — corrupção máxima é "nó sai do lugar" (cosmético) |
| React Flow lento com 200 nós | Médio | Task 13.4 mede performance contra R12.1/R12.3; virtualização nativa do RF v12 cuida do grosso; `useDiagramData` memoizado evita reconstruções |
| Modo somente leitura mobile quebrar Modo_Lista | Baixo | Task 12.1 isola `readOnly` apenas em `FlowDiagram`; lista não é tocada (R15.5) |
| Sincronização Lista ↔ Diagrama com estado parcial em falha | Alto | Property 9 (Task 10.6) fuzz-testa rollback; Error Scenarios 1-3 do design definem comportamento determinístico |
| Bundle size impactar usuários do Modo_Lista | Baixo | Lazy-load via `React.lazy` (Task 10.2) — quem fica na lista não baixa `@xyflow/react`/`dagre`/`html-to-image` |
| Migration falhar em produção | Baixo | `ADD COLUMN IF NOT EXISTS` é idempotente; nullable evita backfill; rollback é `DROP COLUMN` sem perda |
| Conflito com `@dnd-kit` no Modo_Lista | Baixo | Modos são mutuamente exclusivos; React Flow só monta quando `viewMode === "diagrama"` |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4", "6.1", "6.2", "6.3"] },
    { "id": 4, "tasks": ["5.5", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6", "7.7"] },
    { "id": 7, "tasks": ["9.5", "10.1"] },
    { "id": 8, "tasks": ["10.2"] },
    { "id": 9, "tasks": ["10.3", "10.4"] },
    { "id": 10, "tasks": ["10.5", "10.6", "12.1", "12.2", "12.3"] },
    { "id": 11, "tasks": ["12.4", "12.5", "13.1", "13.2", "13.3", "13.4", "14.1", "14.2"] },
    { "id": 12, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 13, "tasks": ["16.1"] }
  ]
}
```

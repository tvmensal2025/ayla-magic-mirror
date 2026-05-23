# Auditoria de Layout — Painel Admin

## Diagnóstico (o que está travando hoje)

1. **Altura fixa quebra o scroll**
   - `CaptacaoPanel.tsx` usa `h-[calc(100vh-150px)] min-h-[680px]` + `overflow-hidden`. Em telas pequenas/zoom alto isso esconde botões e força grids a comprimir.
   - Vários painéis (`WhatsAppTab`, `CrmTabs`, `NetworkPanel`, `AdsCentralTab`, `DashboardTab`, `CustomerManager`) herdam contêineres `overflow-hidden` que impedem scroll vertical do conteúdo interno.

2. **Botões “engolidos” ou sem opção de largura**
   - Botões na grade de passos, no header do lead (A/B/C + Abrir conversa + Voltar/Ficha) e no FinalizeButton perdem texto/ícone quando a coluna fica estreita.
   - `MessageComposer` na Captação não tem altura mínima garantida (some atrás do composer fixo).
   - Cards do `DocumentsSection` (RG/Conta) têm tamanho fixo e não acompanham o resize da ficha.

3. **Resize já criado mas só aplicado em 2 lugares**
   - `DragResizer` está só em `CaptacaoPanel` e `WhatsAppTab`. CRM, Clientes, Rede, Anúncios e Dashboard não têm handle.
   - Handles ficam invisíveis quando travados (✓), mas o lock global está ON por padrão → usuário pensa que não há ajuste.

4. **Grids sem `min-w-0` causam overflow**
   - `CaptureStepsGrid` corrigido. Faltam: `DocumentsSection`, `CrmKanban`, `NetworkPanel` (cards), `AdsCentralTab` (galeria), `DashboardTab` (HeroKpis/FunnelStrip).

---

## Plano de correção

### A. Scroll global por aba
Em cada painel principal trocar `overflow-hidden` por `overflow-y-auto` no contêiner raiz e remover `h-[calc(100vh-…)]` fixo, deixando `min-h-[600px]`:
- `CaptacaoPanel.tsx` (root + ambos branches game/normal)
- `WhatsAppTab.tsx` (split conversa)
- `CrmTabs.tsx` (kanban scrolla horizontal, página scrolla vertical)
- `CustomerManager.tsx`
- `NetworkPanel.tsx`
- `AdsCentralTab.tsx`
- `DashboardTab.tsx`

### B. Padronização dos botões
Aplicar regras consistentes em todos botões de coluna estreita:
- `min-w-0` em flex pais, `truncate` no `<span>` interno, ícone com `shrink-0`.
- `size="sm"` com `h-8` mínimo, `gap-1.5`, `px-2.5`.
- Quando coluna < 200px → mostrar só ícone via `hidden xl:inline` no texto.
- Componentes a revisar: `FinalizeButton`, header A/B/C, `Abrir conversa`, `DocumentsSection` upload, `CrmKanban` cards, `MaterialsTab` cards.

### C. Ampliar sistema de resize
Adicionar `data-resize-scope` + `DragResizer` nos painéis ainda fixos:
- **CRM**: lista de stages ↔ detalhe do deal (`--crm-side-w`).
- **Clientes**: tabela ↔ ficha (`--cli-aside-w`).
- **Rede**: árvore ↔ painel detalhe (`--net-side-w`).
- **Central de Anúncios**: galeria ↔ wizard (`--ads-side-w`).
- **Dashboard**: KPIs ↔ gráficos (`--dash-side-w`, opcional 2-col).
- **Ficha do cliente (Captação)**: já tem aside resize; adicionar handle interno entre Documentos e Dados se útil.

### D. Lock global mais visível
- Botão `LayoutLockToggle` ganha tooltip “Destrave para personalizar tamanhos” e um pulse sutil na 1ª visita (flag em localStorage).
- Quando destravado, todos os `DragResizer` recebem `bg-primary/20` (em vez de invisível) para sinalizar zonas arrastáveis.
- Adicionar atalho `Shift+L` para alternar.

### E. Persistência e reset
- Adicionar item no menu Settings: “Resetar tamanhos das colunas” → limpa todas as chaves `igreen:dragsize:*` e recarrega.

---

## Arquivos previstos

**Editar**
- `src/components/captacao/CaptacaoPanel.tsx`
- `src/components/captacao/CaptureLeadCard.tsx` (overflow + botões)
- `src/components/captacao/FinalizeButton.tsx`
- `src/components/captacao/DocumentsSection.tsx`
- `src/components/whatsapp/WhatsAppTab.tsx`
- `src/components/whatsapp/CrmTabs.tsx` (+ Kanban)
- `src/components/whatsapp/CustomerManager.tsx`
- `src/components/admin/NetworkPanel.tsx`
- `src/components/admin/ads/AdsCentralTab.tsx`
- `src/components/admin/DashboardTab.tsx`
- `src/components/layout/DragResizer.tsx` (visual destravado mais visível)
- `src/components/layout/LayoutLockToggle.tsx` (tooltip + pulse + atalho)
- `src/pages/Admin.tsx` (menu reset)

**Criar**
- `src/hooks/useResetLayoutSizes.ts`

## Fora de escopo
Lógica de envio, IA, OCR, dados — apenas layout, scroll, botões e resize.

## Notas técnicas
- Manter todos os tokens semânticos (`bg-primary`, `border-border`).
- Resize só em `md+`; mobile permanece empilhado e com scroll natural.
- Nenhuma mudança em queries / Supabase / edge functions.

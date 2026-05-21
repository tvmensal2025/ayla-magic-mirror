# Respostas Rápidas: fechar + filtrar quais aparecem

## Problema
No chat do WhatsApp, o menu "Respostas Rápidas" (atalho `/`) abre por cima do composer e não tem como fechar manualmente. Quando há muitos templates, vira poluição visual — e o consultor quer escolher só os "favoritos" que ficam visíveis ali.

## Mudanças

### 1. Botão X para fechar o menu (UI)
Arquivo: `src/components/whatsapp/QuickReplyMenu.tsx`
- Adicionar header sticky no topo do popover com:
  - Título "Respostas rápidas" + contador (ex: `12 de 30`)
  - Botão X (ícone `lucide-react`) que dispara `onClose()`
- Mantém o fechamento já existente por clique fora e tecla Esc.

### 2. Marcar templates "favoritos" (quais aparecem)
Coluna nova em `message_templates`:
- `is_quick_reply boolean default true` (migration)
- Default `true` para não quebrar nada existente.

Telas afetadas:
- **Gerenciador de templates** (`src/components/admin/templates/...` — TemplateManager/TemplateListItem):
  - Adicionar toggle/estrela "Mostrar em respostas rápidas" em cada template.
  - Atualiza `is_quick_reply` via `useTemplates`.
- **QuickReplyMenu**:
  - Filtrar `templates.filter(t => t.is_quick_reply !== false)` antes de aplicar busca.
  - Quando o usuário digita `/algo`, ignorar o filtro de favoritos (busca explícita acessa tudo) — só esconde os não-favoritos no menu "vazio".
- **Header do menu** ganha link "Gerenciar" que abre o painel de templates.

### 3. Tipos
`src/types/whatsapp.ts`:
- Adicionar `is_quick_reply?: boolean` em `MessageTemplate`.

`src/hooks/useTemplates.ts`:
- Incluir o campo no select e no upsert.

## Detalhes técnicos
- Migration cria a coluna com default `true` para preservar o comportamento atual.
- RLS continua o mesmo (já por `consultant_id`).
- Sem mudança em envio de mensagem, fluxo do bot ou backend.

## Fora de escopo
- Reordenar templates (drag & drop) — pode ser feito depois se pedir.
- Categorias/pastas de templates.

## Redesign Completo — Editor de Fluxos WhatsApp

Reescrita do `/admin/fluxos` em 4 frentes paralelas. Foco: leigo conseguir montar um fluxo funcional em 5 minutos, sem caminhos órfãos e sem mídia duplicada/pesada.

---

### Frente 1 — Editor Híbrido (cards + preview WhatsApp ao vivo)

Substitui `src/pages/FluxoCamila.tsx` (1677 linhas, denso) por layout 2 colunas:

```text
┌─────────────────────────────────┬──────────────────────┐
│ COLUNA ESQUERDA (passos)        │ COLUNA DIREITA       │
│                                 │  📱 Preview ao vivo  │
│ ┌───────────────────────────┐   │ ┌──────────────────┐ │
│ │ 1 💬 Boas-vindas          │   │ │ WhatsApp mockup  │ │
│ │   "Olá, sou a assistente" │   │ │                  │ │
│ │   [👇 3 botões]            │   │ │  Mensagens do    │ │
│ │   ⚠ Botão "X" sem destino │   │ │  passo selec-    │ │
│ └───────────────────────────┘   │ │  ionado renderi- │ │
│           ↓                     │ │  zadas como bolha│ │
│ ┌───────────────────────────┐   │ │  verde do bot    │ │
│ │ 2 📸 Pedir conta de luz   │   │ │                  │ │
│ └───────────────────────────┘   │ │  Botões aparecem │ │
│           ↓                     │ │  como WhatsApp   │ │
│ [+ Adicionar passo]             │ │  reply buttons   │ │
│                                 │ └──────────────────┘ │
└─────────────────────────────────┴──────────────────────┘
```

**Componentes novos:**
- `FlowEditor.tsx` — shell com 2 colunas, gerencia estado global do fluxo
- `StepCard.tsx` — card colapsado/expandido com título, tipo, badges (mídia, botões), warnings inline
- `WhatsAppPreview.tsx` — mockup fiel do WhatsApp (header verde, bolhas, botões reply, áudio player), renderiza o passo selecionado em tempo real com `{{variáveis}}` substituídas por exemplo (`{{nome}}` → "João")
- `StepInspector.tsx` — drawer/sheet lateral que abre ao clicar editar (separa "editar" de "visualizar")
- Drag-and-drop com `@dnd-kit/sortable` (já bem suportado, sem libs novas pesadas)

**Simplificações:**
- Esconde campos avançados atrás de "Avançado ▾" (delay, fallback IA, intents customizadas)
- Botões com presets visuais: ✅ Sim / ❌ Não / 🤔 Dúvida / 📸 Simular / 👤 Humano — clica e tudo é montado
- Cada botão tem dropdown "vai para → [lista de passos]" ao invés de campos separados de intent/phrase/goto

---

### Frente 2 — Biblioteca de Mídia com Dedup por Hash

**Backend:**
- Migration: adiciona `ai_media_library.content_hash TEXT` + UNIQUE `(consultant_id, content_hash)` parcial onde `content_hash IS NOT NULL`
- Edge function nova `media-upload-dedup`: recebe arquivo, calcula SHA-256, consulta tabela, se já existe retorna `{ media_id, deduplicated: true, original_url }` sem reupload. Senão, faz upload normal pro MinIO/Supabase e grava o hash.
- Migration de backfill: calcula hash das mídias existentes em batch (cron único)

**Frontend:**
- `MediaLibraryDialog.tsx` — modal com grid de thumbnails, filtros por tipo (áudio/imagem/vídeo) e slot, busca por nome/transcript
- Substitui o upload direto do `StepMediaPanel.tsx` por: "📚 Escolher da biblioteca" (padrão) ou "⬆ Subir nova" (que internamente já roda dedup)
- Badge "♻ Reutilizada (3 passos)" mostra quantos passos usam a mesma mídia
- Botão "Limpar órfãs" (super admin) lista mídias sem `slot_key` e sem uso há 90+ dias

**Compressão (sem mexer no worker):**
- Documenta que worker atual já comprime para 720p; o ganho real virá do dedup (não recomprimir o que já existe)

---

### Frente 3 — Templates + Sugestões IA + Validação

**Templates prontos:**
- Nova tabela `flow_templates` (global, super_admin gerencia) com 5 fluxos seed:
  - "Captação solar (4 passos)" — boas-vindas → conta → resultado → cadastro
  - "Captação simples (3 passos)" — boas-vindas → simular → humano
  - "Pitch Conexão Club (5 passos)"
  - "Reengajamento 30 dias"
  - "Pós-venda + indicação"
- Botão "🪄 Começar com template" no topo da página → modal mostra cards visuais, importa estrutura completa pro consultor

**Sugestões IA por passo:**
- Botão "✨ Sugerir próximo passo" em cada `StepCard`
- Edge function nova `flow-step-suggest`: recebe contexto (passo atual + histórico do fluxo) → Gemini 2.5 Pro retorna 3 sugestões: `{tipo, título, texto exemplo, próximo_passo}`
- Consultor aceita/edita antes de inserir

**Validação visual em tempo real:**
- Hook `useFlowValidation(flow)` retorna array de warnings:
  - Botão sem `goto_step_id` nem `goto_special`
  - Passo nunca referenciado (órfão de entrada)
  - Passo com `is_active=false` referenciado por outro passo (caso Fluxo D / `d_handoff`)
  - Variável `{{xxx}}` no texto que não tem resolver
  - Mídia anexada sem `url`
- Warnings aparecem como badge amarela/vermelha no canto do `StepCard` + lista consolidada no topo "⚠ 3 problemas no fluxo"
- Botão "Auto-corrigir" para casos simples (ex.: trocar `goto_step_id` quebrado por `goto_special:"humano"`)

---

### Frente 4 — Memória + Limpeza

- Atualiza `mem://features/custom-flow-step-engine` documentando dedup de mídia e validação
- Cria `mem://features/flow-editor-redesign` com arquitetura do novo editor
- Move `FluxoCamila.tsx` antigo para `FluxoCamila.legacy.tsx` por 1 release (rollback rápido), rota `/admin/fluxos-legado` aponta pra ele
- Remove código morto de variantes E ainda não usadas (mantém A/B/C/D conforme memória `ab-test-audio-vs-text`)

---

### Detalhes técnicos

- **Sem libs novas pesadas** — só `@dnd-kit/core` + `@dnd-kit/sortable` (~15kb) para drag. React Flow descartado por peso.
- **Sem mudança no engine de runtime** — `whapi-webhook` continua igual, só consome `bot_flow_steps` que o novo editor escreve. Backward-compat total.
- **Schemas estáveis** — única migration de schema é `content_hash` em `ai_media_library` + tabela `flow_templates`. Tudo resto é UI.
- **Mobile-first no preview** — mockup WhatsApp ocupa max 380px, encolhe em telas <1024px (vira aba).
- **Acessibilidade** — todos `DialogContent` com `DialogTitle` (corrige warning atual do console).

---

### Ordem de entrega sugerida (4 PRs separados)

1. **PR1 (UI shell)** — `FlowEditor.tsx` + `StepCard.tsx` + `WhatsAppPreview.tsx` + `StepInspector.tsx`, sem dedup ainda, lendo/escrevendo nos mesmos schemas atuais. ~3 dias de trabalho equivalente.
2. **PR2 (mídia)** — migration `content_hash`, edge `media-upload-dedup`, `MediaLibraryDialog.tsx`, integração no inspector. ~2 dias.
3. **PR3 (templates + IA + validação)** — `flow_templates` seed, `flow-step-suggest` edge, `useFlowValidation` hook + badges. ~2 dias.
4. **PR4 (polimento)** — auto-corrigir warnings, remoção do legacy, atualização de memórias. ~1 dia.

Total: ~8 dias-equivalente de trabalho. Cada PR é entregável independente e o fluxo continua funcionando entre eles.

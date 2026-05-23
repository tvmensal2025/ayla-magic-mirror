---
name: Flow Editor Redesign
description: Novo /admin/fluxos (FluxoBuilder) — layout híbrido cards + preview WhatsApp ao vivo, inspector lateral, drag-and-drop dnd-kit, presets de botões. Schema 100% compat com FluxoCamila legado.
type: feature
---
Rota `/admin/fluxos` agora carrega `src/pages/FluxoBuilder.tsx`. Legacy fica em `/admin/fluxos-legado` (`FluxoCamila.tsx`) por 1 release pra rollback.

**Arquitetura:**
- `src/components/admin/flow-builder/flowTypes.ts` — tipos + helpers (`parseTransitions`, `parseCaptures`, `parseFallback`, `getButtons`, `resolveGotoLabel`, `renderVarsPreview`, `BUTTON_PRESETS`, `STEP_TYPE_OPTIONS`). Compartilhado, schema idêntico ao legado.
- `StepCard.tsx` — card com drag handle (dnd-kit/sortable), badges de mídia/botões/regras, warnings inline, preview do texto, lista resumida de transitions resolvidas.
- `WhatsAppPreview.tsx` — mockup fiel WhatsApp (header verde #075E54, bolhas brancas, botões reply, fundo bege). Renderiza o passo selecionado com `renderVarsPreview` substituindo `{{nome}}`→João etc.
- `StepInspector.tsx` — Sheet lateral com 3 abas (Básico/Mídias/Botões). Avançado colapsado. Botões via preset (✅Sim/❌Não/📸Simular/👤Humano…) com dropdown "vai para → passo X". Reusa `StepMediaPanel` legado.
- `FluxoBuilder.tsx` — shell 2 colunas (lista | preview 380px), header com toggle global + badge de alertas + link "Editor antigo", DndContext do dnd-kit, addStep/duplicateStep/deleteStep otimistas, contagem de mídias por slot.

**Validação inline:** `buildWarnings` em `StepCard` detecta:
- Regra sem `goto_step_id` e sem `goto_special`
- Regra apontando para passo removido ou inativo (caso `d_handoff` do Fluxo D)
- Botão sem regra de destino correspondente

Badge consolidada no header mostra total.

**PRs restantes do plano:** PR2 (dedup mídia por hash + biblioteca), PR3 (templates + sugestões IA + auto-corrigir warnings), PR4 (remoção do legacy).

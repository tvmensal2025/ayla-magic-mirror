---
name: Flow Editor PR3 — Templates + AI + Validation
description: FluxoBuilder ganhou templates iniciais, validação consolidada com auto-fix, e sugestões de próximos passos via Gemini
type: feature
---
- `useFlowValidation(steps)` consolida warnings: regras sem destino, destinos removidos/inativos, botões sem regra, passos órfãos, variáveis desconhecidas, mensagem vazia. Retorna patches auto-corrigíveis.
- Botão **Auto-corrigir** no header remove regras quebradas em lote.
- **Templates**: `FlowTemplatesDialog` com 5 fluxos prontos (captação solar, captação simples, Conexão Club, reengajamento, pós-venda). Inseridos via `bot_flow_steps` insert respeitando `position` atual. Sem nova tabela — lista estática em `flowTemplates.ts`.
- **Sugestões IA**: edge function `flow-step-suggest` (Gemini 2.5 Flash, responseSchema JSON) retorna 3 próximos passos com title/step_type/message_text/buttons/reasoning. Botão "Sugerir próximos passos com IA" dentro do StepInspector. Cada sugestão tem botão `+` que cria o passo no final do fluxo.
- Backward-compat: schema dos passos é idêntico ao FluxoCamila legado.

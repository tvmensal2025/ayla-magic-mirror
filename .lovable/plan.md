## Passos "Esclarecer dúvidas" (IA livre) — UX clara + limite de loop

### Problema

O passo `d_duvidas` (slot `esclarecer_duvidas`) é especial: o backend ativa modo **IA livre** (Gemini responde cada pergunta do lead em loop). Hoje o editor não mostra isso — usuário não entende que:
- O texto digitado é ignorado.
- Sem botão, o lead fica em loop infinito.
- Não há limite de perguntas — só sai por clique de botão ou handoff de IA.

### Frontend (editor `/admin/fluxos`)

**`src/components/admin/flow-builder/flowTypes.ts`**
- Novo helper `isAiAnswerStep(step)` — detecta por `slot_key === "esclarecer_duvidas"` ou `step_key` contendo "duvid" (exceto `duvidas_pos_club`).
- `Fallback` ganha modo opcional `"ai_limit"` com `max_questions: number` e `then: "humano" | "next" | "repeat"`.

**`src/components/admin/flow-builder/StepCard.tsx`**
- Badge roxo proeminente **"🤖 IA livre · Gemini"** quando `isAiAnswerStep`. Substitui o badge OCR para esses passos.

**`src/components/admin/flow-builder/StepInspector.tsx`**
- Aviso roxo no topo da aba "Básico": explica que IA responde, texto digitado é ignorado, precisa de botões pra sair.
- Botão **"Adicionar saídas padrão"** → insere `📸 Quero simular` (transition para o primeiro passo capture_conta encontrado) + `👤 Falar com humano` (`goto_special: "humano"`).
- Bloco **"Limite de IA"**: Input "Após [3] perguntas sem clique, [Falar com humano ▼]" → salva em `fallback = { mode: "ai_limit", max_questions, then }`.
- Desabilita aba Mídias com aviso "IA livre não envia mídia".

**`src/components/admin/flow-builder/useFlowValidation.ts`**
- Erro vermelho: IA livre + 0 botões.
- Warning amarelo: IA livre sem botão `goto_special: "humano"`.

### Backend

**`supabase/functions/whapi-webhook/handlers/bot-flow.ts`** (no bloco `isAiAnswerStep`, linhas ~904-978)
- Antes de chamar `answerFaqWithAI`, ler `stepRow.fallback`.
- Se `fallback.mode === "ai_limit"`:
  1. Contar `conversations` inbound do `customer.id` com `conversation_step === stepKey` desde a entrada nesse passo (usar `enter_step_at` se existir, senão últimas N inbounds).
  2. Se `count >= max_questions`:
     - `then === "humano"`: pausa bot, `notifyHandoff(..., "limite de perguntas IA atingido")`, retorna.
     - `then === "next"`: `dispatchStepFromFlow` para o próximo passo ativo por `position`.
     - `then === "repeat"`: continua respondendo (comportamento atual).
- Mantém comportamento atual quando `fallback.mode !== "ai_limit"`.

### Arquivos

```text
src/components/admin/flow-builder/flowTypes.ts
src/components/admin/flow-builder/StepCard.tsx
src/components/admin/flow-builder/StepInspector.tsx
src/components/admin/flow-builder/useFlowValidation.ts
supabase/functions/whapi-webhook/handlers/bot-flow.ts
```

Sem migrations — usa `fallback` jsonb que já existe.

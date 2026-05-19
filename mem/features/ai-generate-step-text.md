---
name: AI Generate Step Text
description: Botão "Gerar texto (IA)" em cada passo do fluxo (A/B/C) usa Gemini oficial; manual-step-send encadeia passos message após Devolver
type: feature
---
Em `/admin/fluxos` (FluxoCamila.tsx → StepCard), botão `✨ Gerar texto (IA)` ao lado do label "Mensagem de texto". Chama edge `ai-generate-step-text` que usa `GEMINI_API_KEY` (Google oficial, `gemini-2.5-flash`), considerando variante (A=áudio+texto curto, B=texto completo substituindo áudio, C=vídeo+texto curto), título/resumo do passo, transcript de áudio, mídias presentes e 2-3 passos vizinhos como contexto. Output preenche o Textarea e dispara `onPatch({ message_text })`.

`manual-step-send` com `continueFlow=true` + `part="all"` agora encadeia até 6 passos consecutivos do tipo `message` (delay 2.5s entre eles), parando ao encontrar `capture_*`, `confirm_phone`, `finalizar_cadastro` ou passo com `transitions` aguardando resposta do cliente.

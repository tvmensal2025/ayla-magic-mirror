## Confirmação
Vou usar `GEMINI_API_KEY` direto do Supabase (já configurada) chamando a API oficial do Google: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`.

## Parte 1 — Continuar fluxo após "Devolver"

`manual-step-send` já reposiciona e dispara o próximo passo, mas para depois disso. Vou estender `buildContinuationPatch` para encadear passos consecutivos do tipo `message` (sem `capture_*`, sem `transitions` aguardando resposta), com delay de ~3s entre cada, até encontrar um passo que exige input do cliente.

Arquivo: `supabase/functions/manual-step-send/index.ts`

## Parte 2 — Botão "✨ Gerar texto (IA)" por passo

UI em `src/pages/FluxoCamila.tsx` no `StepCard`, ao lado do label "Mensagem de texto":
- Botão `✨ Gerar texto (IA)` com loading.
- Chama edge function nova, preenche o `Textarea` e dispara `onPatch({ message_text })`.

Edge function nova: `supabase/functions/ai-generate-step-text/index.ts`
- Input: `{ consultantId, stepId, variant }`
- Carrega: passo atual (título, texto, transcript de áudio se A/B, presença de vídeo se C), 2 passos anteriores e o próximo (contexto).
- Chama Google Gemini oficial (`gemini-2.5-flash`) com `GEMINI_API_KEY`.
- Prompt por variante:
  - **A**: texto curto que complementa o áudio com CTA de fechamento.
  - **B**: texto completo substituindo o áudio + CTA forte.
  - **C**: texto curto apoiando o vídeo, conduzindo ao próximo passo / fechamento.
- Mantém variáveis `{{nome}}`, `{{valor_conta}}`, `{{representante}}`.
- Tom iGreen Energy, consultivo, ≤3 linhas.
- Trata 429/erro com mensagem clara.

## Arquivos
- `supabase/functions/ai-generate-step-text/index.ts` (novo)
- `supabase/functions/manual-step-send/index.ts` (encadear passos)
- `src/pages/FluxoCamila.tsx` (botão no `StepCard`)

## Objetivo

1. Garantir que, depois de "Devolver para o passo", a Camila siga sozinha o fluxo a partir daquele passo (sem precisar do lead responder de novo).
2. Adicionar em cada passo, na variante A/B/C, um botão **"✨ Gerar texto (IA)"** que cria uma copy persuasiva de fechamento alinhada com o contexto do passo e da variante.

---

## Parte 1 — Continuar o fluxo após devolver

Hoje o `manual-step-send` (com `part="all"` + `continueFlow=true`) envia mídia/texto do passo e atualiza `customers.conversation_step`, mas só dispara o **próximo passo** quando o cliente responder.

Mudança:

- Após enviar o passo atual, agendar o próximo passo automaticamente respeitando `next_step_delay_ms` (ou 0/default) e o `text_delay_ms` configurado.
- Implementação: ao final do envio do passo, se `continueFlow=true` e existe passo seguinte (`position + 1` no mesmo `flow_id`), inserir um registro em `scheduled_messages` (ou chamar `dispatchStepFromFlow` recursivamente com delay) apontando para o próximo step.
- `send-scheduled-messages` já respeita `bot_paused`, então se o consultor reassumir antes, a cadeia para.
- Em passos do tipo "pergunta" (com `transitions` esperando resposta), parar a auto-continuação — esses passos exigem input do cliente.

Arquivos:

- `supabase/functions/manual-step-send/index.ts` — agendar próximo passo quando `continueFlow=true` e o passo atual não tem regras de transição obrigatórias.

---

## Parte 2 — Botão "Gerar texto (IA)" por passo

UI no editor `src/pages/FluxoCamila.tsx` (próximo ao `Textarea` de "Mensagem de texto", linhas 828–857):

- Botão `✨ Gerar texto (IA)` ao lado do label "Mensagem de texto". USAR O GOOGLE OFICIAL API GEMINE
- Loading state + toast de erro/sucesso.
- Preenche o `Textarea` com o resultado e dispara o `onPatch({ message_text })`.

Edge function nova: `supabase/functions/ai-generate-step-text/index.ts`

- Input: `{ consultantId, stepId, variant: "A"|"B"|"C" }`
- Lógica:
  - Carrega o passo (`title`, `step_key`, `message_text` atual, transcript do áudio se existir, descrição de mídias do slot).
  - Carrega os 2 passos anteriores e o seguinte para contexto.
  - Carrega dados do consultor (`name`, `representante`).
  - Monta prompt para Lovable AI Gateway (`google/gemini-3-flash-preview`):
    - **Variante A** (áudio + texto): "Gere uma frase curta de complemento ao áudio, com CTA de fechamento."
    - **Variante B** (só texto, substituindo áudio): "Gere o texto completo que substitui o áudio, mesmo conteúdo + CTA forte."
    - **Variante C** (vídeo + texto): "Gere uma frase de apoio ao vídeo de apresentação, conduzindo para o próximo passo / fechamento."
  - Sempre usar variáveis `{{nome}}`, `{{valor_conta}}`, `{{representante}}` quando fizer sentido.
  - Tom: iGreen Energy, consultivo, direto, máx ~3 linhas.
- Output: `{ text: string }`.

Não persiste — o usuário edita e salva via blur normal.

---

## Detalhes técnicos

- Reusar padrão de `ai-followup-cron`/edge functions Gemini já existentes para chamada Lovable AI Gateway (`LOVABLE_API_KEY`, header `Lovable-API-Key`).
- Tratar `429` (rate limit) e `402` (créditos) com toast claro.
- Botão só habilitado quando `consultantId` e `stepId` existem (passo já salvo).
- Não bloquear o `Textarea`: usuário pode regenerar.

## Arquivos

- `supabase/functions/ai-generate-step-text/index.ts` (novo)
- `supabase/functions/manual-step-send/index.ts` (auto-continuação)
- `src/pages/FluxoCamila.tsx` (botão no `StepCard`)  
  
LEMBRAR DE USAR O GOOGLE GEMINE  

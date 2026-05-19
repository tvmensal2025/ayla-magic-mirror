## Diagnóstico (lead Carson 5516992299779)

- `conversation_step = 80188e5f` (step "Valor da conta", slot `como_funciona`, posição 5). Bot pausado com `humano_assumiu`.
- Quando o consultor manda "Devolver para o passo → Conta de energia" (step `capture_conta` na posição 9, slot `passo_mp70jl99`), o `manual-step-send`:
  - Não acha mídia nem `message_text` (capture_conta no editor não tem texto — só `captures[0].retry_text`).
  - Retorna **`nothing_to_send` 400** sem mandar nada. Bot fica em silêncio.
- Mesmo cenário acontece ao "continuar fluxo" e a cadeia parar num `capture_*`: `buildContinuationPatch` só seta `conversation_step='aguardando_conta'`, **sem disparar pergunta**. Lead fica esperando o upload sem saber que tem que mandar.
- Vale para todos os capture_*: `capture_documento`, `capture_email`, `confirm_phone`, `finalizar_cadastro`.

Resumo: o fluxo "Devolver para passo de captura" nunca dispara o prompt — só reposiciona.

## Correção

### 1. `supabase/functions/manual-step-send/index.ts`

Adicionar helper `resolveCapturePrompt(step)` que devolve o texto a enviar quando o passo é de captura:

1. `step.message_text` se preenchido.
2. Primeiro `captures[].retry_text` não-vazio.
3. Fallback por `step_type` (texto curto padrão iGreen, com `{{nome}}`):
   - `capture_conta` → "{{nome}}, me manda a foto **ou PDF** da sua conta de luz aqui pelo WhatsApp 📄"
   - `capture_documento`/`capture_doc` → "Agora me envia uma foto do seu documento (RG ou CNH, frente e verso) 📷"
   - `capture_email` → "Qual é o seu melhor e-mail? ✉️"
   - `confirm_phone` → "Esse número é o melhor pra falar com você no WhatsApp? Pode confirmar?"
   - `finalizar_cadastro` → "Tô finalizando seu cadastro, só um instante… ⏳"

Usar em duas situações:

**(a) Passo selecionado direto é `capture_*`** (resolve antes do `nothing_to_send`):
- Se `step.step_type !== 'message'`, montar `toSend = [{ kind: 'text', text: prompt }]` com o prompt resolvido.
- Setar `conversation_step` mapeado (`aguardando_conta`, `aguardando_doc_auto`, `ask_email`, `ask_phone_confirm`, `finalizando`).
- Sempre despausar (mesmo sem `continueFlow=true`), porque sem o bot ativo o upload não será capturado.
- Salvar `last_custom_prompt_at = now()`.
- Idempotência: se `last_custom_prompt_at` < 20 s atrás **e** `conversation_step` já bate com o destino, pular o envio e retornar `{ ok: true, sent: [], skipped: 'recent_prompt' }` (evita duplicar quando consultor clica 2× rápido).

**(b) Cadeia em `buildContinuationPatch` para num `capture_*`**:
- Antes do `break`, chamar `sender.sendText(remoteJid, prompt)` + insert em `conversations` (igual ao `sendConfiguredStep`).
- Manter o mapeamento de `conversation_step` legado.

### 2. Frontend (`src/pages/.../ChatView` ou onde mora "Devolver para o passo")

Sem mudança funcional. Só tratar resposta `skipped: 'recent_prompt'` como sucesso silencioso ("Pergunta já enviada agora há pouco — aguarde a resposta do cliente.").

### 3. Reposicionar o lead em produção

Como teste imediato após deploy: reenviar Carson para o passo `Conta de energia` — deve receber o texto "Me manda a foto ou PDF…" e o bot fica em `aguardando_conta`, ativo, pronto para receber o upload.

### 4. Memória

Atualizar `mem://features/ai-generate-step-text` (ou criar `mem://features/manual-step-capture-prompt`) registrando: "Manual-step-send em capture_* dispara prompt automático (message_text → retry_text → fallback por tipo), com debounce de 20 s."

## Arquivos tocados

- `supabase/functions/manual-step-send/index.ts` (helpers + dois pontos de uso + idempotência)
- `mem://features/manual-step-capture-prompt` (novo) + `mem://index.md`

## Não faremos

- Não vamos mexer no editor de fluxos para forçar `message_text` em capture_*: o ideal é que o passo funcione mesmo se o consultor deixar vazio.
- Não vamos alterar `whapi-webhook` — a captura propriamente dita (`aguardando_conta`) já funciona corretamente.

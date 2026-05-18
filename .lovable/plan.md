## Problema — duplicação de mensagem e botão

Quando a Camila (fluxo custom) avança para um passo de **captura** (`capture_conta`, `capture_documento`, `confirm_phone`) ou de **confirmação**, dois prompts são enviados ao cliente: o texto que VOCÊ escreveu no editor, seguido do prompt hardcoded antigo. Visível nos prints:

- IMG-WA0198: "me manda foto da conta de luz" (custom) + "me manda uma foto (ou PDF) da sua conta..." (legacy)
- IMG-WA0203: "me manda foto da frente do documento" (custom) + "Me envie a foto da frente do seu RG ou CNH..." (legacy)
- IMG-WA0200: "Está tudo correto?" + "Os dados estão corretos?" (duas confirmações consecutivas)

## Causa

No `bot-flow.ts`, o resolver custom (linhas 1937-1970) dispara o conteúdo do passo `capture_*` via `dispatchStepFromFlow` e seta `conversation_step` para o legacy correspondente (`aguardando_conta`, `aguardando_doc_auto`, `ask_phone_confirm`). Quando o cliente responde com texto, o `switch` legacy entra no case e dispara o prompt padrão hardcoded (linhas 2155, 365, 378-379).

## Solução

Adicionar uma flag transitória `custom_prompt_emitted_at` (timestamp em memória de execução / passada via `updates`) que sinaliza ao switch legacy: "o passo custom já mandou a pergunta, não re-pergunte; apenas trate a resposta".

### Implementação concreta

1. **No resolver custom (linha ~1970)** — ao retornar com `nextStepValue` apontando para um legacy de captura/confirmação, marcar no `updates` um campo:
   ```ts
   updates: { conversation_step: nextStepValue, __custom_prompted: true, __inline_sent: true }
   ```

2. **No handler chamador (whapi-webhook/index.ts)** — quando `__custom_prompted=true`, salvar `last_custom_prompt_at = now()` no customer.

3. **Nos cases legacy** `aguardando_conta` (linha 2124), `aguardando_doc_auto`, `ask_phone_confirm`, `confirmando_dados_conta`, `confirmando_dados_doc`:
   - Se `customer.last_custom_prompt_at` foi nos últimos 5 minutos AND o cliente NÃO enviou arquivo/resposta válida, **não re-prompt** — apenas retorne `reply: ""` (silêncio, espera).
   - Se enviou arquivo válido / "sim" / "não" → processa normalmente (OCR, avança, etc).

4. **Confirmação dupla** ("Está tudo correto?" + "Os dados estão corretos?") — investigar onde o segundo confirm dispara. Provavelmente em `post-confirm-conta` (linha 2395) que avança para próximo passo e esse próximo passo é outro confirm. Remover o confirm hardcoded quando há fluxo custom ativo.

### Migration de schema

Adicionar coluna `last_custom_prompt_at TIMESTAMPTZ` na tabela `customers`.

## Arquivos a editar

- `supabase/migrations/<nova>.sql` — ADD COLUMN `last_custom_prompt_at`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — marcar flag + guards nos 5 cases legacy
- `supabase/functions/whapi-webhook/index.ts` — persistir `last_custom_prompt_at` quando flag presente

## Risco

Baixo. O guard só silencia o prompt legacy quando o passo custom acabou de perguntar. Lead que não responder em 5 min volta a receber prompts normais (fallback de stuck-recovery).

Posso aplicar?

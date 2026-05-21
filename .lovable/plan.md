## Diagnóstico — caso 5511916827893

Linha do tempo real do lead no banco:
- 00:31 — bot envia "qual o valor médio da sua conta?"
- 00:36 — consultor abre o **Modo Captação** e clica em enviar o passo "Me manda a foto/PDF da sua conta" → `manual-step-send` dispara o texto
- 00:36:30 — `CaptureSheet.onSent` roda o efeito colateral: **grava `bot_paused=true`, `bot_paused_reason="manual_capture"`** no customer
- Lead responde (nome, depois envia a conta) → `whapi-webhook` recebe, mas o helper `isCustomerPausedByHuman` retorna `true` (regra atual de "Human Takeover Silence") e o webhook **descarta** a inbound antes mesmo de chamar o OCR

Resultado: nenhum `ocr_conta_attempts`, `electricity_bill_photo_url=null`, fluxo travado para sempre. Mesmo padrão vai acontecer em qualquer lead onde o consultor usar o Modo Captação — o pause global silencia até as respostas que dependem de OCR/captura automática.

## Causa raiz

`src/components/captacao/CaptureSheet.tsx` (linhas 200-207) pausa o bot no primeiro envio manual para "evitar resposta dupla". Mas a regra `mem://whatsapp/human-takeover-silence` silencia **todos** os motores — inclusive os capture handlers (`aguardando_conta`, `aguardando_doc_auto`, capture_*). Modo Captação é assistido, não takeover: o consultor está enviando o **prompt**, mas quem precisa processar a resposta do lead (OCR, parse de CPF/CEP, avanço do passo) continua sendo o bot.

## Correção

### 1. Remover o pause automático ao enviar passos manuais
`src/components/captacao/CaptureSheet.tsx` — apagar o bloco que seta `bot_paused=true, bot_paused_reason="manual_capture"` dentro de `onSent`. O `manual-step-send` já tem anti-duplicação (não dispara se houve outbound recente) e os capture handlers usam `last_custom_prompt_at` para evitar reprompt — então o risco real de "resposta dupla" é baixo. O consultor que quiser silenciar o bot continua tendo o botão "Assumir" (takeover real).

### 2. Salvaguarda no servidor: nunca silenciar OCR por "manual_capture"
`supabase/functions/_shared/bot/paused.ts` — em `isCustomerPausedByHuman`, ignorar o pause quando `bot_paused_reason === "manual_capture"` **e** `assigned_human_id` é null. Assim, leads antigos que já estão com esse motivo gravado (como a Marcia 5511916827893) destravam sem precisar de migration manual. O takeover real continua bloqueando (humano vinculado ou outros motivos).

### 3. Despausar registros existentes presos por "manual_capture"
Migration única:
```text
UPDATE customers
SET bot_paused = false, bot_paused_reason = NULL, bot_paused_at = NULL
WHERE bot_paused = true
  AND bot_paused_reason = 'manual_capture'
  AND assigned_human_id IS NULL;
```

### 4. Memória
Atualizar `mem://whatsapp/human-takeover-silence` registrando que `manual_capture` (sem human assigned) **não silencia** — Modo Captação é assistido, OCR/capture continuam ativos.

## Como valida

1. Em um lead novo: abrir Modo Captação, mandar o passo "conta de luz" → confirmar no banco que `bot_paused` continua `false`.
2. Lead envia foto da conta → `whapi-webhook` logs mostram `ocr_conta_attempts` subindo e `electricity_bill_value/bill_holder_name` preenchidos.
3. Conferir Marcia (5511916827893): após a migration, próxima mídia que ela mandar deve disparar OCR normalmente.

## Fora de escopo

- Mexer no OCR em si (Gemini multimodal segue como está — o problema não é qualidade de leitura, é que ele nunca foi chamado).
- Mudar o comportamento do botão "Assumir" / takeover real.
- Alterar a lógica de A/B/C ou `manual-step-send`.
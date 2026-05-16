## Diagnóstico — por que o fluxo travou

Comparando os logs de `bot_step_transitions` + `conversations` para o nº 5511989000650 (Rafael) com o screenshot:

```
17:57:55  user  "Oi"                                    (step=welcome)
17:58:01  ➜ transição welcome → Passo 1 (Boas Vindas)
17:58:26  ➜ transição Passo 1 → Passo 2 (Valor da conta)
17:58:30  bot   "Rafael, qual o valor médio…"           (1ª vez)
17:59:00  bot   "Rafael, qual o valor médio…"           (2ª vez — duplicada!)
18:00:57  user  "Ok"
18:01:29  bot   "Rafael, qual o valor médio…"           (3ª — repetiu por não capturar)
18:02:25  user  "$250"
18:02:32  bot   "Rafael, qual o valor médio…"           (4ª — "$250" não foi capturado)
18:02:47  user  "900 reais"                             (aí sim capturou)
```

Três problemas reais:

### 1. `extractValor` não reconhece "$250"

Em `supabase/functions/_shared/captureExtractors.ts` o gate de "indício de dinheiro" exige `r$`, `reais`, `conta`, `luz`, `valor`, `pila` ou número puro `^\d{2,5}$`. O cifrão isolado `$` não casa, então `"$250"` retorna `null` → nenhuma intent `valor_brl` → step se repete.
Também `"Ok"` cai em repeat — esperado, mas combinado com o item 2 vira loop de mensagem idêntica.

### 2. Mesma pergunta enviada 4× sem variação

Quando o `repeatCurrent()` é acionado (input sem captura), o engine remanda exatamente o `message_text` configurado. Não há dedupe de "mesmo texto enviado há menos de X segundos", então o lead vê 3-4 vezes "Rafael, qual o valor médio da sua conta de luz?" — exatamente o que aparece no print.

### 3. Áudio sem vídeo no Passo 2

O Passo 2 (`3e7fb4cd-…`, "Qual o valor da conta") tem `media_order: [audio, image, video, text]` mas em `ai_media_library` não existe NENHUMA mídia vinculada a este passo (nenhuma com `step_tags` contendo o id e nenhum `slot_key` correspondente). O áudio que aparece no print veio do Passo 1 (slot `boas_vindas`). Como Passo 2 só tem texto, ele nunca manda vídeo — o vídeo que aparece nos prints é do cascade pós-captura (Passo 3/4) ou de uma QA match, não da pergunta em si.

## Plano de correção

### A. Melhorar `extractValor` (1 arquivo)

`supabase/functions/_shared/captureExtractors.ts`:

- Adicionar `$` ao conjunto de gatilhos de dinheiro: aceitar `$250`, `R$250`, `250,00`, `250.00`.
- Aceitar número puro com 2-5 dígitos mesmo sem keyword **quando o passo atual pedir valor** (sinalizado pelo contexto — passamos o capture esperado, ou simplesmente afrouxamos o gate para `^\s*\d{2,5}([.,]\d{1,2})?\s*$`).
- Atualizar `intent-classifier_test.ts` / adicionar caso de teste para `"$250"`, `"250"`, `"R$ 250,00"`.

### B. Dedupe de mensagem repetida em `repeatCurrent`

`supabase/functions/whapi-webhook/handlers/conversational/index.ts`:

- Antes de reenviar o `message_text` do passo, consultar `conversations` por última outbound do mesmo `customer_id` + mesmo `conversation_step` nos últimos ~60s. Se idêntico, enviar variação curta ("Me conta, quanto vem em média?" / "Pode ser um valor aproximado 🙂") em vez do texto original.
- Limitar a no máximo 1 reenvio idêntico por janela; o segundo vira reformulação.

### C. Avisar o admin quando um passo não tem mídia configurada

Frontend `src/pages/FluxoCamila.tsx` + painel `StepMediaPanel.tsx`:

- Mostrar um badge amarelo "⚠️ sem áudio/vídeo" no card do passo quando `media_order` contém `audio|video` mas não há nenhum `ai_media_library` com `step_tags` ou `slot_key` correspondente — assim o consultor sabe que o Passo 2 precisa de áudio/vídeo se quer manter a sequência áudio→vídeo→texto.

### D. Validar

- Rodar `bunx vitest run` nos testes do captureExtractors.
- `supabase--curl_edge_functions` no `whapi-webhook` com payloads `"$250"`, `"250"`, `"Ok"` e `"900 reais"` no Passo 2 e confirmar que só "$250"/"250"/"900 reais" avançam, e que "Ok" reformula em vez de repetir literal.

## Detalhe técnico — por que não mexer no `index.ts` agora

O loop só existe porque a regex falha. Se A resolver a captura de `$250` e bare numbers, restará apenas o caso legítimo de "Ok" (lead respondeu fora de contexto), e o item B evita que o bot pareça um disco riscado nessa situação.

Não estou tocando em nada do pipeline de OCR/cadastro nem nas mídias do Passo 1 (que estão corretas).

&nbsp;

&nbsp;

Mas passo 2 3 4 5 6 7 8 tem que seguir 100% sem duplicar o audio e o video 
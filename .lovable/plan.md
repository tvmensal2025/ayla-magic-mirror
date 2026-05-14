# Plano de testes — validação do fluxo do bot

Objetivo: validar de ponta a ponta as últimas mudanças em `supabase/functions/whapi-webhook/handlers/bot-flow.ts` sem depender de envio real pelo WhatsApp.

## 1) Testes unitários (Deno) — helpers e transições puras
Arquivo novo: `supabase/functions/whapi-webhook/handlers/bot-flow_test.ts`.

Como os helpers internos (`sleepForMedia`, `fetchUrlToBase64`, `trigramSim`) não são exportados, exporto-os de forma controlada (apenas para testes, via `export` direto — sem alterar comportamento). Cobre:

- `sleepForMedia("audio", 5)` → resolve em ~5s (usar `performance.now`, tolerância ±300ms) e nunca passa de 120s (`sleepForMedia("audio", 999)` ≤ 120s).
- `sleepForMedia("video", undefined)` → ~30s default (mock de `setTimeout` para acelerar — substituir `globalThis.setTimeout` com fake-timers do Deno std).
- `trigramSim("pode seguir","pode seguir.")` > 0.8; strings distintas < 0.3.
- `fetchUrlToBase64` com `globalThis.fetch` mockado: retorna base64 correto e mime; em 404 retorna `null`; em timeout retorna `null`.

## 2) Testes de transição do `runBotFlow` com mocks
Mesmo arquivo de teste. Constrói um `BotContext` falso com:
- `supabase`: stub que registra `from().update().eq()` e devolve linhas fixas (`ai_media_library`, `customers`, `crm_deals`).
- `sender`: stub que captura `sendText`, `sendAudio`, `sendVideo`, `sendButtons` numa fila.
- `customer` inicial conforme cada cenário.

Cenários cobertos (asserções em `result.updates` e na fila do `sender`):

a) **Pré-captura de valor da conta**: `messageText="1600"`, `conversation_step="welcome"`. Esperado: `updates.electricity_bill_value === 1600` antes do AI brain rodar.

b) **`checkin_pos_video` → afirmativo**: `conversation_step="checkin_pos_video"`, `messageText="sim, entendi"`. Esperado: próximo step = `qualificacao` e mensagem pedindo valor da conta.

c) **`checkin_pos_video` → dúvida**: `messageText="o que é igreen?"`. Esperado: NÃO troca para `qualificacao`; entra no ramo IA/Q&A.

d) **`pitch_conexao_club` → envia vídeo e vai para `duvidas_pos_club`**: stub do `ai_media_library` slot `conexao_club` retorna `{url, duration_sec: 2}`. Esperado: `sender` recebeu `sendVideo` com a URL, `sleepForMedia("video", 2)` foi chamado, `updates.conversation_step === "duvidas_pos_club"`.

e) **`duvidas_pos_club` → "pode seguir"**: dispara `ask_tipo_documento` com botões RG/CNH (assert `sendButtons` com 2 opções).

f) **OCR fallback on-demand**: `processando_ocr_conta` com `fileBase64=null` e `fileUrl="https://x/y.jpg"`. Mock `fetch` devolve bytes; mock `ocrContaEnergia` devolve `{nome, valor: 180}`. Esperado: `updates.electricity_bill_value === 180`.

g) **OCR timeout**: mock `ocrContaEnergia` resolve após 30s. Esperado: dentro de ~25s o fluxo cai para fallback `ask_name` (sem ficar travado em "Analisando…").

## 3) Smoke test contra a edge function deployada
Script `supabase/functions/whapi-webhook/_smoke.ts` (executável via `deno run`):

- POST simulando webhook Whapi para um número de teste (`TEST_PHONE` em `.env`):
  1. `"oi"` → espera resposta de boas-vindas e `conversation_step="welcome"` ou abertura de mídia.
  2. Após mídia, `"sim entendi"` → `conversation_step="qualificacao"`.
  3. `"1600"` → `electricity_bill_value=1600` no banco.
  4. Envio de imagem fake da conta (URL pública de fixture) → `conversation_step` avança para `confirmando_dados_conta`.
  5. `"sim"` → vai para `pitch_conexao_club` e em seguida `duvidas_pos_club` (verifica `whatsapp_messages` recentes inclui vídeo do Conexão Club).
  6. `"pode seguir"` → `conversation_step="ask_tipo_documento"` e última mensagem tem botões RG/CNH.

Cada passo: `supabase--curl_edge_functions` em `whapi-webhook` + query SQL no `customers`/`whatsapp_messages` para confirmar estado.

## 4) Verificação por logs
Após cada passo do smoke: `supabase--edge_function_logs whapi-webhook` filtrando por `phone` para confirmar:
- `sleepForMedia` está usando duração real (`duration_sec`).
- Sem erros do tipo `electricity_bill_value=0` no prompt da IA.
- OCR concluiu (`OCR Conta OK`) ou caiu no fallback corretamente.

## Detalhes técnicos
- Mocks de tempo: `import { FakeTime } from "https://deno.land/std@0.224.0/testing/time.ts"` e `tick()` para acelerar `setTimeout`.
- Para tornar helpers testáveis sem mudar comportamento, adiciono no fim do arquivo: `export { sleepForMedia, fetchUrlToBase64, trigramSim };` (apenas re-export, sem renomear nem alterar lógica).
- Execução: `supabase--test_edge_functions` com `functions: ["whapi-webhook"]`.
- Smoke roda separado via `deno run --allow-net --allow-env supabase/functions/whapi-webhook/_smoke.ts` quando solicitado.

## Fora de escopo
- Mudanças no comportamento do bot.
- Testes do `ai-sales-agent` (não foi alterado nesta rodada).
- Envio real via Whapi; usamos apenas o webhook de entrada.

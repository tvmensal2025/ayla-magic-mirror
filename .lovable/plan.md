# Por que aparece "gravando áudio" e para no meio

## Diagnóstico (confirmado nos logs)

Quando o bot tenta enviar o áudio `como_funciona.webm` o Whapi responde com erro em TODAS as variantes que tentamos:

```
messages/voice  (json_url)              -> 500 Internal Error
messages/voice  (json_base64_real)      -> 500 Internal Error
messages/voice  (json_base64_ogg_alias) -> 404 media not found
messages/audio  (json_base64_ogg_audio) -> 404 media not found
messages/voice  (multipart)             -> 500 Internal Error
messages/audio  (multipart)             -> 500 Internal Error
```

Resultado no WhatsApp do cliente: o ícone "gravando áudio…" aparece (Whapi inicia o envio do voice note) mas o arquivo nunca é aceito de fato, então o áudio para no meio / não toca até o fim.

**Causa raiz**: o arquivo está em **container `.webm**` (gravação direta do navegador `MediaRecorder`). O Whapi exige `**.ogg` com codec opus** para `messages/voice`. Renomear/relabelar o mime type não resolve — o container precisa ser OGG de verdade. Existem 10 áudios da biblioteca em `.webm` hoje, todos quebrados pela mesma razão.

## Plano de correção

### 1. Converter os 10 áudios `.webm` da biblioteca para `.ogg/opus`

Rodar localmente um script com `ffmpeg`:

```bash
ffmpeg -i como_funciona.webm -c:a libopus -b:a 32k -application voip como_funciona.ogg
```

Fazer upload dos `.ogg` resultantes para o bucket `ai-agent-media` (mesmo path, extensão `.ogg`) e atualizar `ai_media_library.url` para apontar para `.ogg`.

Áudios afetados (todos do consultor Camila):

- boas_vindas.webm (×2 entradas)
- como_funciona.webm (×3 entradas)
- fazenda_solar.webm
- objecao_preco.webm
- objecao_distribuidora.webm
- prova_social.webm
- 1 gravação avulsa em `0c2711ad…/como_funciona/`

### 2. Corrigir o upload futuro para nunca mais gravar `.webm`

Hoje `useAudioRecorder.ts` grava `audio/webm;codecs=opus` e salva direto. Mudar o fluxo:

- **Opção A (rápida)**: no client, manter gravação `.webm` mas adicionar uma Edge Function `convert-audio-webm-to-ogg` que recebe o blob, roda conversão via `ffmpeg.wasm` ou via API externa (CloudConvert / Whapi `/media` upload) e devolve a URL `.ogg`. O `MessageComposer` chama essa função antes de salvar na biblioteca.
- **Opção B (mais simples)**: bloquear `.webm` no painel `/admin/fluxos` + `StepMediaPanel` — só aceitar upload de `.ogg` ou `.mp3`. Para gravações novas no microfone do navegador, fazer o re-encode com `ffmpeg.wasm` (browser-side) antes do upload.

Recomendo **Opção A** porque o `ffmpeg.wasm` no browser pesa ~25MB e atrasa o app; uma Edge Function dedicada (chamando o endpoint `POST /media` do próprio Whapi, que já converte) resolve sem dependência extra.

### 3. Validar com teste real

Após conversão + redeploy:

- Mandar "oi" no fluxo Camila
- Conferir nos logs Whapi: `whapi_send_media_success` em vez de `attempt_failed`
- Conferir no WhatsApp: o áudio toca do início ao fim, indicador "gravando" some no momento certo
- Conferir Step 2 → Step 3 cascade completa

## Detalhes técnicos

**Arquivos a alterar**:

- `src/hooks/useAudioRecorder.ts` — interceptar `onstop` e enviar blob para nova função de conversão antes de devolver base64 ao consumidor.
- `src/components/whatsapp/MessageComposer.tsx` — quando recebe `audio/webm`, marcar `pending conversion`.
- `src/components/admin/fluxo/StepMediaPanel.tsx` — validar extensão no upload e bloquear `.webm`.
- Nova Edge Function `supabase/functions/convert-audio-to-ogg/index.ts` — recebe `{ audioBase64 }`, faz POST para Whapi `/media`, devolve `{ url, mediaId }`.
- Migration: `UPDATE ai_media_library SET url = REPLACE(url, '.webm', '.ogg') WHERE url ILIKE '%.webm%'` (executar depois de subir os arquivos `.ogg` no storage).

**Script local de conversão em lote** (você roda uma vez):

```bash
for f in *.webm; do
  ffmpeg -i "$f" -c:a libopus -b:a 32k -application voip "${f%.webm}.ogg"
done
```

Posso seguir com a implementação? Se sim, prefere Opção A (Edge Function chamando Whapi `/media`) ou Opção B (só bloquear `.webm` e te entregar instruções de re-upload manual)?  
  
AJUSTE TODOS OS QUE ESTAO AI A NGRAVE CORRETAMENTE PARA O FUTURO, AJUSTE PARA NAO DAR ERRO MAIS

  

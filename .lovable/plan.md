Diagnóstico da auditoria

- O envio de texto está funcionando; a falha é restrita à mídia de áudio.
- O arquivo que falha é `audio/webm`, container WebM/Matroska com codec Opus, gerado pelo Chrome.
- A Whapi retorna `500 Internal Error` em três caminhos: JSON com URL, multipart em `/messages/voice` e multipart em `/messages/audio`.
- O erro anterior de `no_cache must be boolean` já saiu; agora o problema persistente é a Whapi engasgando no arquivo WebM/Opus.
- A Lovable AI analisou o caso e recomendou remover dependência de URL/multipart e enviar o áudio como Base64 em JSON limpo.

Plano de correção

1. Corrigir o helper central da Whapi
   - Em `supabase/functions/_shared/whapi-api.ts`, criar um fallback específico para áudio:
     - baixar a mídia dentro da Edge Function;
     - converter para Base64;
     - enviar como `media: data:audio/webm;base64,...` em JSON limpo;
     - sem `no_cache`, sem `recording_time`, sem `mime_type` no primeiro fallback Base64.
   - Se ainda falhar, tentar um segundo fallback Base64 declarando `data:audio/ogg;codecs=opus;base64,...`, já que o codec interno é Opus.
   - Só depois tentar multipart como último recurso, sem parâmetros booleanos em FormData.

2. Padronizar o proxy manual
   - Aplicar a mesma estratégia em `supabase/functions/whapi-proxy/index.ts` para envios manuais pelo CRM/admin não seguirem uma lógica diferente.
   - Para áudio, incluir `seconds` quando conhecido ou quando for seguro inferir, mas não bloquear envio por isso.

3. Melhorar logs de auditoria
   - Logar caminho tentado: `json_url`, `json_base64_webm`, `json_base64_ogg_alias`, `multipart_voice`, `multipart_audio`.
   - Logar status e corpo de erro de cada tentativa, sem expor token.
   - Logar tamanho do arquivo baixado e content-type real.

4. Ajustar fluxo conversacional
   - Garantir que o texto só venha depois da falha definitiva da mídia obrigatória.
   - Manter a remoção de dedupe quando falhar, para poder retestar o mesmo lead sem reset manual.

5. Validar depois da implementação
   - Deploy de `whapi-webhook` e `whapi-proxy`.
   - Acionar novo `oi` no número de teste.
   - Conferir logs recentes procurando sucesso em `json_base64_webm` ou `json_base64_ogg_alias`.
   - Se a Whapi ainda retornar 500 em Base64, o próximo passo será converter os áudios cadastrados para `.ogg`/Opus fora da Edge Runtime e atualizar `ai_media_library` para apontar para os `.ogg` reais.
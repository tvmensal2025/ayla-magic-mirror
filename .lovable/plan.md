## Diagnóstico (último fluxo no WhatsApp)

Lendo os logs do `whapi-webhook` do step `80188e5f-...` (consultor Ayla / Rafael):

```
18:55:32  auto-advance para o step (2 mídias: audio + video, sem texto)
18:55:34  ⏱ aguardando 1500ms antes de enviar audio
18:55:36  📤 audio via messages/voice (json_url)
18:55:39  ✅ audio OK
18:55:39  ⏱ aguardando 500ms antes de enviar video
18:55:39  📤 video via messages/video (json_url) — 27 MB
18:57:01  ⚠ json_url falhou: "Signal timed out" (após 3 tentativas / ~82s)
18:57:01  📥 baixando 27 MB para retry
18:57:22  📤 video via messages/video (json_base64_real, 27 MB)
18:57:52  ← Whapi confirma envio do vídeo #1 (id Pso...) ← era o json_url!
18:57:56  ← Whapi confirma envio do vídeo #2 (id Psq...) ← o base64
```

### Causa raiz

**Ordem texto→áudio→vídeo→imagem está correta.** O step só tem áudio + vídeo (sem texto), então pulou texto — comportamento certo conforme sua regra.

Os 2 problemas são todos no envio do **vídeo de 27 MB**, dentro de `supabase/functions/_shared/whapi-api.ts` (função `sendMedia`):

1. **Duplicação:** `tryJsonSend("json_url")` faz 3 retries com timeout de 60 s cada. Quando o Whapi demora a processar o vídeo grande, o `fetch` estoura o timeout do nosso lado, mas o Whapi já recebeu e enfileirou. Como a função "achou" que falhou, cai no fallback `json_base64_real` e envia o vídeo **de novo**. Resultado: cliente recebe 2 vídeos.
2. **Lentidão:** o tempo todo (≈ 82 s só de timeout do json_url + ≈ 21 s baixando/reenviando em base64) é consequência do mesmo bug. Vídeo pequeno passa direto no primeiro POST.

A reserva `try_log_media_send` impede duplicação entre **invocações diferentes** do webhook, mas não dentro do mesmo `sendMedia` (os retries internos passam por baixo dela).

---

## Plano de correção

Mexer só em `supabase/functions/_shared/whapi-api.ts`, sem alterar a ordem (texto→áudio→vídeo→imagem) já garantida em `handlers/conversational/index.ts`.

### 1. Não duplicar quando o Whapi demora

Em `sendMedia`, tratar **timeout do cliente como "provavelmente entregue"** para vídeo/imagem grandes:

- Em `tryJsonSend`, distinguir 3 categorias de erro: `http_error` (status ≥ 400), `network_error` (DNS/conexão), `client_timeout` (`Signal timed out`).
- Se a 1ª tentativa de `json_url` retornar `client_timeout` para `video` ou `image`, **não cair no fallback base64**. Retornar `true` (otimista) e deixar o `dispatch_log` evitar reenvio em webhooks futuros.
- Para `audio` e `document`, manter o fallback (são pequenos, baixo risco de duplicar).
- Reduzir os retries internos de 3 → 1 quando for vídeo/imagem (a operação não é idempotente).

### 2. Acelerar o envio de vídeo

- Pular `json_url` direto quando o `Content-Length` da URL conhecida sinalizar > 15 MB, e ir direto para `multipart` (mais rápido e confiável que base64 — evita inflar 33% em base64).
- Aumentar o timeout do `json_url` para vídeos para 120 s em 1 só tentativa, em vez de 60 s × 3 = 180 s.
- Manter `delay_before_ms` configurado por mídia (já respeitado).

### 3. Logs para confirmar

Adicionar log estruturado em cada envio de mídia com `attempt_path` e `outcome` (`ok`, `timeout_optimistic`, `failed`) para auditar duplicações futuras.

### Arquivos afetados
- `supabase/functions/_shared/whapi-api.ts` — única alteração de código
- Nenhuma migração de banco
- Nenhuma mudança no `conversational/index.ts` (a cascata texto→áudio→vídeo→imagem já está como você pediu)

### Como validar
1. Disparar o mesmo step e ver no log: `attempt_path=json_url outcome=timeout_optimistic` em vez de 2 envios.
2. Receber 1 só vídeo no WhatsApp.
3. Tempo total esperado: áudio 3 s + delay 500 ms + vídeo ≤ 30 s ≈ 35 s (hoje passa de 2 minutos).

## Padronização total: tudo no MinIO organizado por consultor/cliente

### Estrutura final no bucket `igreen`

```
igreen/
├── documentos/{consultor_slug}/{cliente_nome_data}/
│     ├── conta_{ts}.{ext}
│     ├── doc_frente_{ts}.{ext}
│     └── doc_verso_{ts}.{ext}              ← já existe ✅
│
├── whatsapp/{consultor_slug}/{cliente_jid}/
│     ├── audio/{ts}.ogg
│     ├── image/{ts}.jpg
│     ├── video/{ts}.mp4
│     └── document/{ts}.pdf                  ← NOVO (chat manual + recebidos)
│
├── templates/{consultor_slug}/
│     ├── image/{slug}.jpg
│     └── audio/{slug}.ogg                   ← NOVO (move do Supabase)
│
├── consultores/{consultor_slug}/
│     └── avatar.{ext}                       ← NOVO (move consultant-photos)
│
├── creativos/{consultor_slug}/{slug}.png    ← já existe ✅
└── estaticos/                               ← LP/vídeos institucionais ✅
```

`{consultor_slug}` = `{igreen_id}_{nome_normalizado}` (mesmo padrão atual de documentos).
`{cliente_jid}` = número limpo do WhatsApp (`5511999999999`).

### Mudanças

**1. Edge function `upload-media` (chat WhatsApp do painel) — refatorar**
- Aceitar `consultant_id`, `customer_jid` (ou `customer_id`) e `media_kind` no FormData.
- Buscar nome do consultor e gerar slug.
- Subir direto ao MinIO em `whatsapp/{consultor}/{jid}/{kind}/{ts}.ext` via `uploadBytesToMinio` (estender helper para aceitar `customPath`).
- Manter fallback Supabase Storage só se MinIO indisponível.
- Atualizar `src/services/minioUpload.ts` para passar esses campos.

**2. Mídias recebidas do cliente no chat (fora do bot)**
- No `evolution-webhook` quando chega áudio/imagem/vídeo de cliente já existente, baixar bytes da Evolution e subir ao MinIO em `whatsapp/{consultor}/{jid}/{kind}/`.
- Salvar URL pública na tabela `messages` (campo `media_url`).
- Hoje só conta/doc do bot vão pro MinIO; estendendo para todo o fluxo.

**3. Templates de mensagem**
- Nova edge function `upload-template-media` (ou parâmetro extra em `upload-media`) que sobe em `templates/{consultor}/{kind}/{slug}.ext`.
- Substituir uploads de templates atualmente em `whatsapp-media` pelo MinIO.
- `useTemplates` passa a usar a nova URL.

**4. Foto do consultor**
- Refatorar upload em `useConsultantForm` para chamar `upload-media` com `kind=avatar` → `consultores/{slug}/avatar.ext`.
- Atualizar coluna `consultants.photo_url`.

**5. Helper compartilhado `_shared/minio-upload.ts`**
- Adicionar `uploadBytesToMinioPath({bytes, contentType, objectKey})` para casos com path custom.
- Manter `uploadBytesToMinio` legado para documentos (compatibilidade).

**6. Migração histórica em background — nova edge function `migrate-supabase-to-minio`**
- Roda manualmente (botão admin) ou via cron único.
- Para cada bucket (`whatsapp-media`, `consultant-photos`):
  - Lista objetos, baixa via `supabase.storage.download`.
  - Detecta dono (consultor) pela tabela referenciadora (`messages.consultant_id`, `consultants.id`, `message_templates.consultant_id`).
  - Sobe ao MinIO no path correto.
  - Atualiza URL no banco (UPDATE WHERE old_url=...).
  - Marca progresso em tabela `storage_migration_log` (id, old_url, new_url, status, error).
- Idempotente: se URL já é MinIO, pula.
- Após validação manual, deletar objetos do Supabase em segundo passo.

**7. Logs e observabilidade**
- Tabela `storage_migration_log` (item, status, old_url, new_url, error_message, migrated_at).
- Painel admin simples para acompanhar progresso (lista + contagem).

### Detalhes técnicos

- **Slugs**: reusar `normalizeName()` já existente (NFD + lowercase + `_`).
- **Nome do consultor**: cache em memória dentro da edge function por execução para evitar N queries.
- **Permissões MinIO**: bucket `igreen` é público (já é) — URL retornada é direta `https://igreen-minio.d9v63q.easypanel.host/igreen/...`.
- **Ordenação por data no JID**: usar `Date.now()` no nome do arquivo garante histórico ordenado.
- **Fallback**: se MinIO falhar (timeout 5s), grava em Supabase + agenda re-tentativa via `storage_migration_log` para subir depois.
- **Tipos suportados**: mesmos limites atuais (100 MB, mimes em `ALLOWED_TYPES`).
- **Não toca em**: `IMAGE` bucket (fallback do gerador, baixo volume) e `video igreen` (vídeos LP institucionais já replicados manualmente no MinIO).

### Ordem de execução

1. Estender `_shared/minio-upload.ts` com helper genérico `uploadBytesToMinioPath`.
2. Refatorar `upload-media` para aceitar contexto (consultor/cliente/kind) e priorizar MinIO.
3. Atualizar frontend (`minioUpload.ts`, `useTemplates`, anexar mídia em chat, foto consultor) para passar contexto.
4. Estender `evolution-webhook` para subir mídias recebidas no chat para MinIO.
5. Criar tabela `storage_migration_log` + edge function `migrate-supabase-to-minio` + botão admin para disparar.
6. Rodar migração em background, validar URLs, depois limpar buckets antigos.

---
name: Media Hash Dedupe
description: Uploads de mídia (StepMediaPanel e MediaColumn) calculam SHA-256, consultam ai_media_library.content_hash e reaproveitam url/storage_path quando o mesmo consultor já enviou o arquivo
type: feature
---
- Coluna `ai_media_library.content_hash` (text) + índice `(consultant_id, content_hash) WHERE content_hash IS NOT NULL`.
- Helper `src/lib/mediaHash.ts` (`sha256File`, `findExistingByHash`) usa WebCrypto.
- StepMediaPanel: calcula hash antes do compress-worker; se dedupe acerta, pula compressão e upload, reusa duration_sec e tamanhos. Insere novo row com mesma `url`/`storage_path` para preservar relação passo↔mídia.
- MediaColumn (AI Agent): mesma lógica para uploads gerais; toast informa quantos foram reutilizados.
- Sempre persiste `content_hash` no insert para futuros dedupes.

# compress-worker

Serviço Node + ffmpeg para comprimir vídeos antes de salvar no MinIO.
Usado pelo /admin/fluxos para reduzir vídeos grandes (ex: 27MB → 3-5MB) e fazer o WhatsApp/Whapi entregar em segundos.

## Deploy no Easypanel

1. Crie um novo serviço "App" no Easypanel apontando para esta pasta (`compress-worker/`) — ou faça push da pasta como repositório próprio.
2. Build: Dockerfile.
3. Porta exposta: `8080`.
4. Recursos sugeridos: 1 vCPU / 1 GB RAM.
5. Configure as variáveis de ambiente abaixo.
6. Habilite domínio público (ex: `compress.seu-dominio.com`).

## Variáveis de ambiente

| Nome | Obrigatório | Descrição |
|------|-------------|-----------|
| `API_KEY` | sim | Segredo compartilhado. Enviado pelo frontend no header `x-api-key`. |
| `MINIO_ENDPOINT` | sim | Host do MinIO sem `https://`. Ex: `minio.seu-dominio.com` |
| `MINIO_PORT` | sim | `443` se SSL, `9000` sem SSL |
| `MINIO_USE_SSL` | sim | `true` ou `false` |
| `MINIO_ACCESS_KEY` | sim | Mesmo `MINIO_ROOT_USER` usado pelas Edge Functions |
| `MINIO_SECRET_KEY` | sim | Mesmo `MINIO_ROOT_PASSWORD` |
| `MINIO_BUCKET` | sim | `igreen` |
| `PUBLIC_BASE_URL` | sim | URL pública base do MinIO. Ex: `https://minio.seu-dominio.com` |
| `TARGET_HEIGHT` | não | Padrão `720` |
| `CRF` | não | Padrão `28` (maior = mais compressão) |
| `AUDIO_BITRATE` | não | Padrão `96k` |
| `SKIP_BELOW_BYTES` | não | Não comprime mp4 menor que isso. Padrão `5242880` (5MB) |

## Endpoints

### `GET /health`
Healthcheck simples.

### `POST /compress`
Multipart form:
- `file` (obrigatório) — vídeo
- `folder` (opcional) — pasta destino no MinIO. Padrão: `videos`
- `name` (opcional) — prefixo do nome do arquivo

Headers:
- `x-api-key: <API_KEY>`

Resposta:
```json
{
  "ok": true,
  "url": "https://minio.seu-dominio.com/igreen/videos/pitch_ab12cd34.mp4",
  "object_key": "videos/pitch_ab12cd34.mp4",
  "bucket": "igreen",
  "content_type": "video/mp4",
  "original_size": 27341822,
  "final_size": 3812044,
  "compression_ratio": 0.139,
  "duration_sec": 42.1,
  "skipped_compression": false,
  "elapsed_ms": 18540
}
```

## Integração com o app

Configure no `.env` do projeto:
```
VITE_COMPRESS_WORKER_URL=https://compress.seu-dominio.com
VITE_COMPRESS_WORKER_KEY=<mesmo valor de API_KEY>
```

O `StepMediaPanel` detecta automaticamente quando é vídeo e usa este serviço; se as variáveis não estiverem definidas ou o serviço falhar, faz fallback para o upload direto no Supabase Storage.

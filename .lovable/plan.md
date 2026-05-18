## Diagnóstico

**1. Erro "Falha ao criar campanha — The requested file could not be read..."**

É o `error_user_msg` literal do endpoint `/adimages` do Meta. Hoje em `facebook-create-campaign/index.ts` (linhas 411–449) tentamos:
- (a) mandar `url` pública do Supabase → Meta tenta baixar do nosso bucket. Em algumas contas/regiões a Meta cacheia o erro e nunca retenta.
- (b) fallback `bytes` em base64 dentro de `application/x-www-form-urlencoded` → URL-encoded com 2–5 MB de payload às vezes é rejeitado com a mesma mensagem genérica.

Quando todos os hashes falham, o `throw "Nenhuma imagem pôde ser carregada..."` sobe e quebra a publicação inteira. O mesmo upload é usado no "Salvar como template" (linha 625) → mesmo erro.

**2. Templates sem nome**

`handleSaveAsTemplate` (linha 614) gera título automático `${distribuidora} — ${headline.slice(0,40)}`. Não há campo para o consultor nomear.

**3. Re-upload toda vez**

Cada publicação/save chama `uploadAdPhotos()` que faz `storage.upload()` com `Date.now()-filename` → mesma foto vira N cópias no bucket, e a Meta recebe `url` nova → sempre tem que baixar e gerar `image_hash` de novo (lento + sujeito ao erro acima).

## O que vai mudar

### A) Fix do upload para a Meta (multipart binário)

Em `facebook-create-campaign/index.ts`, trocar o POST `/adimages` para **`multipart/form-data` com `source=<binary>`** (formato oficial e mais confiável da Marketing API):

```text
1) Baixa a imagem da URL pública (já está na nossa Storage, baixa rápido)
2) POST /act_X/adimages com FormData:
   - source: Blob(imagem) com filename
   - access_token: ...
3) Lê image_hash do response e cacheia em ad_image_library
```

Mantém fallback: se multipart falhar, tenta `url` (estratégia atual) → último recurso `bytes` base64. Mensagem de erro real do Meta sempre propaga.

### B) Biblioteca de imagens reutilizáveis

Nova tabela `ad_image_library` (RLS por consultor + admin lê tudo):

```text
ad_image_library
- id, consultant_id, url, storage_path
- format: 'square'|'vertical'|'story'
- width, height, file_size, content_type, filename
- fb_image_hash (cache do hash da Meta — pula /adimages nas próximas publicações)
- fb_image_hash_synced_at
- usage_count, last_used_at, created_at
```

Mudanças:
- `uploadAdPhotos` no front passa a **gravar uma linha** em `ad_image_library` após o upload no bucket (com dimensões/formato).
- Edge function `facebook-create-campaign`: antes de chamar `/adimages`, lê `fb_image_hash` pela URL. Se existir, **pula o upload** e usa direto. Se subir hash novo, salva no DB. Incrementa `usage_count` + `last_used_at`.
- `upload-ad-photo` (fallback edge) também grava na library.

### C) UI da biblioteca dentro do wizard (Step 2)

Em `CreateCampaignWizard` (Step 2 — fotos), adicionar duas tabs:

```text
[ 🆕 Enviar novo ]   [ 📁 Minhas imagens (N) ]
```

Aba "Minhas imagens":
- Lista do `ad_image_library` do consultor, agrupada por formato (Quadrado / Vertical / Story).
- Filtro rápido "Mais usadas" / "Recentes".
- Cada thumb mostra: dimensão (1080×1350), badge "✓ pronta na Meta" se já tem `fb_image_hash`.
- Clicar adiciona à seleção da campanha **sem re-upload**.
- Botão "Excluir" remove do bucket + DB.

Mesma aba aparece no "Salvar como template" e no `UseTemplateDialog`.

### D) Dar nome ao template

Quando clicar em "Salvar como template", abrir mini-dialog (`SaveTemplateDialog`):

```text
Nome do template:    [_________________________________]
Descrição (opcional): [_________________________________]
                                       ( Cancelar ) ( Salvar )
```

- Pré-preenche com sugestão (`{distribuidora} — {headline}`), editável.
- Persiste `title` e `description` no `ad_templates`.
- Mostra status: rascunho pessoal ou publicado (super admin).

### E) Validação de tamanho centralizada

`ad_image_library` só aceita itens com `width/height` válidos por formato (mesmas regras já existentes em `isFileValidFor`). Itens inválidos não entram na library — evita "lixo" e garante que só o que aparece já está no tamanho certo.

## Arquivos a tocar

**DB (migration nova):**
- `ad_image_library` + índices + RLS + trigger `updated_at`.

**Backend:**
- `supabase/functions/facebook-create-campaign/index.ts` — multipart upload + leitura/escrita de `fb_image_hash`.
- `supabase/functions/upload-ad-photo/index.ts` — após upload, insert na library.

**Frontend:**
- `src/services/adImageLibrary.ts` (novo) — `listLibrary`, `addToLibrary`, `removeFromLibrary`, `touchUsage`.
- `src/services/facebookAds.ts` — `uploadAdPhotos` grava na library e devolve `{ url, libraryId }`.
- `src/components/admin/ads/AdImageLibraryPanel.tsx` (novo) — grid agrupado por formato, com seleção.
- `src/components/admin/ads/SaveTemplateDialog.tsx` (novo) — nome + descrição.
- `src/components/admin/ads/CreateCampaignWizard.tsx` — Step 2 com Tabs "Enviar / Minhas imagens"; `handleSaveAsTemplate` usa `SaveTemplateDialog`.
- `src/components/admin/ads/UseTemplateDialog.tsx` — mesma library disponível ao personalizar.

## Fora do escopo

- Não vou mexer no upload do `/adimages` pra contas que ainda usam `url` com sucesso — fica como fallback.
- Não vou migrar imagens antigas do bucket pra `ad_image_library` automaticamente (entram conforme forem usadas).
- Não vou tocar em audiências/CAPI/wallet — só fluxo de imagem + template.

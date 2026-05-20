## Objetivo

Em qualquer mensagem do chat WhatsApp (áudio, vídeo, imagem — recebida ou enviada), aparece um menu de 3 pontinhos. Clicando, abre um pequeno diálogo para salvar a mídia como **template** com **nome** e **atalho** (ex: `/oi`, `/conta`). Depois é só digitar o atalho no composer e a mídia + texto vão embora.

## Mudanças

### 1. Banco — `message_templates`

- Adicionar coluna `shortcut text` (ex: `/oi`).
- Índice único parcial `(consultant_id, lower(shortcut)) where shortcut is not null` pra evitar atalho duplicado por consultor.
- Sem mudar RLS (já está OK).

### 2. Edge function nova: `save-message-as-template`

- Recebe `{ message_id, name, shortcut, caption }`.
- Busca a `messages` no DB pra pegar `media_url` (URL da Whapi/Evolution, que expira).
- Baixa a mídia, faz upload no **MinIO** (bucket `igreen` / pasta `templates/{consultant}/{uuid}.{ext}`) — mesma estratégia do `compress-worker`/`adImageLibrary`. Áudio mantém `.ogg/.mp3`, vídeo `.mp4`, imagem `.jpg/.png`.
- Insere em `message_templates` com `media_type`, `media_url` (URL permanente do MinIO), `image_url` (caso vídeo/imagem), `content` (caption se houver) e `shortcut`.
- Retorna o template criado.

### 3. UI — `MessageBubble.tsx`

- Adicionar botão 3-pontos (`MoreVertical`) no hover/sempre visível em mobile, dentro do bubble (canto sup. direito).
- `DropdownMenu` com:
  - **Salvar como template** (abre diálogo)
  - **Salvar e criar atalho** (mesmo diálogo, foco no campo atalho)
  - **Copiar texto** (se tiver caption)
- Só aparece pra mensagens com `media_type in ('audio','video','image')` ou texto.

### 4. UI — `SaveMessageAsTemplateDialog.tsx` (novo)

- Campos: **Nome** (obrigatório), **Atalho** (opcional, prefixo `/` automático, valida regex `^\/[a-z0-9_-]{2,20}$`, mostra erro se já existe), **Legenda** (preenchido com caption atual, editável).
- Mostra preview da mídia.
- Botão "Salvar" → chama edge `save-message-as-template` → toast de sucesso → atualiza `useTemplates`.

### 5. UI — `MessageComposer.tsx`

- Quando o usuário digita `/`, abre popover com lista de atalhos do consultor (filtrada por prefixo).
- Setas ↑↓ + Enter selecionam; ao confirmar:
  - Substitui o texto pelo `content` do template (com placeholders aplicados via `applyTemplate`).
  - Anexa a mídia (`media_url` + `media_type`) ao envio, igual ao fluxo de templates já existente no `TemplateManager`/`BulkSend`.
- Atalho exato (`/oi` + Espaço/Enter) envia direto sem precisar selecionar.

### 6. UI — `TemplateManager.tsx`

- Adicionar coluna/campo **Atalho** na listagem e no form de edição. Permite editar/remover o atalho de templates antigos.

## Fora de escopo

- Categorias/pastas de templates.
- Compartilhar atalho entre consultores (cada um tem o próprio).
- Edição de áudio/vídeo (apenas salvar como está).

## Pergunta antes de implementar

Confirma: **MinIO** é o destino certo pro media dos templates (mesma estratégia dos vídeos do `/admin/fluxos`) minio  sim
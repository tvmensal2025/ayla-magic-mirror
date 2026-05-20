# Pré-visualizar antes de enviar (atalho do fluxo)

Hoje no botão ⚡ do composer você consegue disparar passos do fluxo, mas o texto/áudio/imagem/vídeo só é visto depois que cai no WhatsApp. Vou adicionar **preview real** antes de qualquer envio, em todos os 3 modos.

## O que muda

### 1. Modo "1 a 1" (ManualStepDialog) — preview inline em cada parte
Hoje cada item mostra só um ícone + nome do arquivo + botão Enviar. Vou trocar por um card com **preview de verdade** da mídia:

- **Texto** → caixa cinza com o texto completo (scroll se grande), igual a um balão do WhatsApp.
- **Áudio** → `<audio controls>` para ouvir antes (play/pause/scrub).
- **Imagem** → miniatura clicável (abre lightbox/zoom em modal).
- **Vídeo** → `<video controls>` 240px de largura, play inline.
- **Documento (PDF)** → link "Abrir em nova aba" + nome do arquivo.

Botão **Enviar** continua do lado, só que agora você ouviu/leu/viu antes de clicar.

### 2. Modo "Passo completo" (botão Send na lista do popover)
Hoje: 1 clique = envia tudo direto. Vou mudar para:
- 1 clique = abre **mini-modal de preview** mostrando, em ordem, todas as partes do passo (mesmos previews acima: áudio tocável, imagem, vídeo, texto).
- 2 botões no rodapé: **Cancelar** e **Confirmar e enviar tudo**.
- Memória opcional por sessão "não perguntar de novo neste passo" (checkbox), pra não atrapalhar quem já confirmou.

### 3. Modo "Daqui em diante" (FastForward)
Hoje: AlertDialog só com texto "vou enviar N passos". Vou enriquecer:
- Lista os passos que vão ser enviados (numerados, com título).
- Cada passo expansível (accordion) → abre os previews das partes daquele passo.
- Botões: **Cancelar** / **Enviar sequência**.

## Onde mexer (técnico)

- **`src/components/admin/AIAgentTab/ManualStepDialog.tsx`**
  - Substituir o conteúdo do `<Card>` de cada `part` por um componente `PartPreview` que renderiza por `kind` (text/audio/image/video/document) usando `part.media?.url` ou `part.text`.
  - Imagem: thumb 80×80 + clique abre Dialog com imagem full.
  - Áudio/vídeo: tags HTML5 nativas com `controls preload="metadata"`.

- **`src/components/whatsapp/FlowQuickBar.tsx`**
  - Novo state `previewStep: Step | null`.
  - Trocar `onClick={() => sendFull(s)}` por `onClick={() => setPreviewStep(s)}`.
  - Novo `<Dialog>` `StepPreviewDialog` que carrega `ai_media_library` igual ao `loadStepParts` do ManualStepDialog, renderiza os previews e tem botão "Confirmar e enviar tudo" → chama `sendFull(s)`.
  - Reaproveitar o mesmo `PartPreview` extraído como componente compartilhado (`src/components/whatsapp/StepPartPreview.tsx`) para não duplicar.
  - Trocar o `AlertDialog` do "Daqui em diante" por um Dialog maior com lista de passos + accordion (`@/components/ui/accordion`) usando o mesmo `PartPreview`.

- **Novo arquivo: `src/components/whatsapp/StepPartPreview.tsx`** — componente puro que recebe `{ kind, text?, url?, fileName? }` e renderiza o preview correto. Usado pelos 3 fluxos.

## Fora de escopo
- Editar texto/mídia antes de enviar (continua só preview).
- Mudar a ordem das partes na hora do envio.
- Reordenar passos.

Quer que eu inclua também um botão "Tocar tudo em sequência" no preview do passo completo (toca áudios/vídeos em ordem antes de mandar)? Posso adicionar se for útil.

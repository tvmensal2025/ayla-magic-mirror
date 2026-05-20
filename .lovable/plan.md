## Objetivo

Tornar o painel **Captação** mais útil no celular do consultor:
1. **Preview do conteúdo real** de cada variante (texto + áudio/imagem/vídeo) antes de enviar.
2. **Efeitos sortidos de celebração** ao capturar dados (balão, fogos, estrelas, emojis chovendo…) — variados a cada captura, sem repetir o mesmo confete sempre.
3. **Modo fullscreen mobile** para o sheet ocupar a tela toda no celular sem atrapalhar o input de mensagem.

## Mudanças

### 1) Preview do passo + variante

**Novo componente**: `src/components/captacao/CaptureStepPreview.tsx`
- Modal/Drawer disparado por um ícone 👁️ ao lado de cada chip A/B/C **e** no card do passo.
- Carrega de `consultant_media` por `slot_key + variant`:
  - texto formatado com `{{nome}}` resolvido pelo customer atual,
  - player nativo `<audio>` para áudios (mostra duração),
  - thumbnail/`<img>` para imagens,
  - `<video controls>` para vídeos.
- Botão "Enviar esta variante" no rodapé do preview (mesma ação do chip).

**Edição mínima** em `CaptureStepsList.tsx`:
- Adicionar ícone "olho" em cada chip A/B/C e no header do card → abre `CaptureStepPreview` com `{stepId, variant}`.
- Click simples no chip continua disparando o envio (já confirma via AlertDialog).

### 2) Efeitos variados de celebração

**Edição**: `src/lib/captureGame.ts`
- Adicionar 6 efeitos novos via `canvas-confetti` + pequenos emoji rains:
  - `fireBalloons` (sobem do rodapé),
  - `fireStars` (estrelas douradas explosão central),
  - `fireFireworks` (3 explosões espaçadas),
  - `fireEmojiRain` (🎉🎊✨💚⚡ chovendo do topo via `shapes:["text"]`),
  - `fireSideCannons` (canhões laterais),
  - `fireSpiral` (espiral colorida).
- Exportar `fireRandomCelebration()` que sorteia 1 dos 7 efeitos (incluindo o atual `fireBigConfetti`) sem repetir o último (guarda em `sessionStorage`).
- Sortear também **frase motivacional** extra (lista expandida ~15 frases) por captura.

**Edição**: `CaptureSheet.tsx`, `CaptureLeadCard.tsx`, `CaptureDocumentTiles.tsx`
- Trocar chamadas `fireBigConfetti()` e `fireMiniConfetti()` por `fireRandomCelebration()`.

### 3) Mobile fullscreen + UX

**Edição**: `src/components/captacao/CaptureSheet.tsx`
- No mobile (`< md`), o `Sheet`/`Dialog` passa a abrir em **fullscreen** (`h-[100dvh] w-screen rounded-none`) com header colapsável.
- Botão flutuante **"Minimizar"** (chevron down) que reduz a sheet para uma **barra inferior compacta** (50px) mostrando "Captação 3/10 ▴", liberando o input do chat sem fechar o modo.
- Toque na barra reabre fullscreen.
- Footer "FINALIZAR" sempre visível (`sticky bottom-0`) já existe — garantir `safe-area-inset-bottom`.

**Edição** em `ChatView.tsx`:
- Quando a sheet está minimizada, o input do WhatsApp fica acessível normalmente (overlay zero).

## Fora de escopo
- Mudar backend OCR / Whapi / manual-step-send.
- Mudar estrutura de variantes A/B/C.

## Validação
1. Mobile: abrir Captação → ocupa tela toda → botão "minimizar" deixa barra de 50px → input do chat livre.
2. Tocar 👁️ em "3. Pergunta valor da conta" variante B → preview mostra exatamente o texto sem áudio que será enviado.
3. Capturar nome → confete variado (cada captura um efeito diferente) + frase nova.
4. "Enviar" no preview age igual ao chip A/B/C.

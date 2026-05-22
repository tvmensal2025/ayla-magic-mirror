## Problema

Na aba **Captação** (`/admin`), os tiles de passos (Passo 2, Passo 3…) têm botão **Enviar** que dispara o envio direto, sem mostrar o que vai sair. Você quer ver o conteúdo (texto + áudio + imagem + vídeo, já com `{{nome}}`/`{{valor_conta}}` resolvidos) antes de confirmar, pra não se perder na ordem nem mandar o passo errado.

Boa notícia: já existe um componente pronto chamado `CaptureStepPreview` (modal estilo WhatsApp com bolha verde, player de áudio/vídeo, thumbnail de imagem e botão "Seguir fluxo / Só este passo"). Ele só não está conectado ao grid atual.

## O que vou fazer

1. **Wire do preview no clique do botão Enviar** em `src/components/captacao/CaptureStepsGrid.tsx`:
  - Clique em **Enviar** abre o `CaptureStepPreview` em vez de mandar direto.
  - O preview já busca `bot_flow_steps` + `ai_media_library`, aplica variáveis e mostra exatamente o que sai pro lead.
  - Botão "Só este passo" dentro do modal dispara o `manual-step-send` (mesma lógica atual, `continueFlow: false`).
  - Botão "Seguir fluxo (A/B/C)" mantém comportamento de encadear próximos passos automáticos.
2. **Mini-preview inline no próprio tile** (sem precisar abrir modal):
  - Mostrar as 2 primeiras linhas do `message_text` (com variáveis resolvidas) abaixo do título do passo.
  - Ícones de mídia (🎤 🖼 🎥) ficam **acesos** (cor) quando o passo tem aquela mídia configurada, e apagados quando não tem — hoje todos aparecem em cinza, gerando confusão.
3. **Atalho "👁 Ver"** ao lado do "Enviar" para abrir o preview sem disparar nada (caso queira só conferir).
4. Garantir que o preview respeite a **variante A/B/C** atual do lead (já suportado pelo componente).

## Escopo

- Só frontend, só no Modo Captação.
- Não muda lógica de envio (`manual-step-send`), não muda banco, não mexe em fluxo automático.
- Não afeta `/admin/whatsapp` nem envio em massa.

## Arquivos afetados

- `src/components/captacao/CaptureStepsGrid.tsx` — adicionar estado de "preview aberto", carregar mídias do passo selecionado, integrar `CaptureStepPreview`, mostrar mini-preview no tile.
- (Opcional) leve ajuste de tipagem no `CaptureStepPreview` se precisar passar mais variantes.

## Resultado esperado

Quando você clicar **Enviar** num tile de passo, um modal abre mostrando:

- 🟢 Bolha verde com o texto que vai sair (`Oi João, vi que sua conta é R$ 450,00…`)
- 🎤 Player do áudio que vai junto
- 🖼/🎥 Preview da imagem/vídeo
- Botões "Seguir fluxo" e "Só este passo" pra confirmar.

Assim você confere antes de mandar e não se perde na ordem. E preciso ver a resposta 
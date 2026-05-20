# Uploads de documentos + botão Finalizar no painel Captação

Hoje a aba **Ficha** mostra os 10 campos cadastrais, mas só tem 1 slot de "Documento" (mistura CNH/Doc Frente, Verso e Conta de Luz num único bloco) e o botão `CADASTRAR TUDO` só aparece quando `filledCount === 10`. O usuário pediu:

1. Slots separados para **CNH/Doc Frente**, **Doc Verso** e **Conta de Energia** com upload pelo celular.
2. Botão **Finalizar** sempre acessível no rodapé do painel, que dispara o portal worker (OTP + link de cadastro).

## 1. Bloco "Documentos" na Ficha — 3 slots com upload

Arquivo: `src/components/captacao/CaptureLeadCard.tsx`

- Remover o bloco atual de `isDoc` dentro do `.map(CAPTURE_FIELDS)`.
- Substituir o item `document_front_url` da lista `CAPTURE_FIELDS` (`src/hooks/useCaptureSession.ts`) por **um único marco** de "Documentos" no contador XP — mas internamente avaliar como preenchido quando os 3 URLs existirem (`document_front_url`, `document_back_url`, `electricity_bill_photo_url`). Mantém 10/10 como meta para não quebrar XP.
- Renderizar abaixo da lista de campos um bloco `<section>` "Documentos" com 3 tiles:
  ```text
  [RG-  CNH / Frente ]   [RG -  CNH / Verso ]   [ Conta de Energia ]
  ```
  Cada tile:
  - Mostra preview da imagem se a URL existir, com botão "Trocar".
  - Se vazia, mostra `<input type="file" accept="image/*,application/pdf" capture="environment">` estilizado como botão "📷 Enviar".
  - Ao selecionar arquivo: upload via `supabase.storage.from('whatsapp-media').upload(...)`, depois `getPublicUrl`, depois `updateField('document_front_url' | 'document_back_url' | 'electricity_bill_photo_url', url)`.
  - Dispara confetti pequeno por upload bem-sucedido.
- O `electricity_bill_value` (R$) continua como campo numérico próprio.

## 2. Botão "Finalizar Cadastro (Portal)" sempre visível

Arquivo: `src/components/captacao/CaptureSheet.tsx`

- No rodapé do `Sheet`, mostrar **duas** ações:
  1. **Finalizar (botão primário grande)** — sempre habilitado quando: `name && cpf && (document_front_url || electricity_bill_photo_url)` (mínimo para portal aceitar). Cor `bg-primary`, ícone `Trophy`/`Send`.
  2. **Sair do modo** (link discreto).
- Ao clicar Finalizar:
  - Confirma com `AlertDialog`: "Vou enviar pro portal e disparar o OTP. Confirma?" listando o que está faltando se houver (`filledCount/10`).
  - `update customers set conversation_step='finalizando', capture_mode='auto'`.
  - O webhook do whapi já intercepta `finalizando` (linha 4054 de `bot-flow.ts`) e dispara o portal worker → OTP → link de cadastro para o cliente. Não precisa criar nada novo no backend.
  - `fireBigConfetti()` + toast: "🚀 Portal acionado. Em segundos chega o OTP e o link no WhatsApp do cliente."
- Mostrar progresso em tempo real assistindo `customer.conversation_step` (`finalizando` → `portal_submitting` → `aguardando_otp` → `validando_otp`) com um chip de status acima do botão.

## 3. Manter o estado "game" ELE DA PARA DESATIVVAR OU DEIXAR ATIVADO

- Header do `CaptureSheet` continua igual (XP, frase motivacional, próximo dado).
- Contador "Passo X de 10 enviado" segue do `sentSteps.size`.
- O contador `filledCount` passa a considerar o **bloco Documentos completo** = 1 ponto (já era 1 ponto via `document_front_url`).

## Fora de escopo

- Sem mudanças em edge functions, RLS ou portal-worker.
- Sem mudanças no fluxo do WhatsApp / bot.
- Não removemos suggestions de IA — o slot de Documentos só não tem sugestão IA.

## Validação

1. Abrir Captação no chat → tab **Ficha** → ver 3 tiles (Frente / Verso / Conta) com botão de câmera.
2. Tirar foto da CNH frente → upload, preview aparece, XP sobe.
3. Mesmo com 5/10 campos, tocar **Finalizar** → modal "vai pro portal?" → confirmar → status muda para `portal_submitting`.
4. Cliente recebe OTP no WhatsApp e o link de cadastro.
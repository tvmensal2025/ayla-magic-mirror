# Captação mobile — fácil de mexer

Problema relatado: no celular a pílula "Captação 2/10 · 0/10 passos" é pequena, não dá pra arrastar pra baixo, e não acha o botão de expandir. Tem que ser óbvio e grande.

## O que muda

### 1. Pílula minimizada vira barra grande (mobile)
- Hoje: pílula pequena (h-11) centralizada, ícone minúsculo de chevron.
- Novo: **barra full-width fixa no rodapé**, altura confortável (h-14), com:
  - À esquerda: ícone Gamepad + "Captação 2/10 · 0/10 passos" (texto maior, legível)
  - À direita: **dois botões grandes lado a lado**:
    - `⤢ Abrir` (expande pra tela cheia)
    - `✕` (fecha)
  - Toque em qualquer lugar da barra também abre (igual hoje)
- Respeita `safe-area-inset-bottom` pra não colar no gesto do Android.

### 2. Painel aberto: sempre fullscreen no mobile
- Hoje no mobile abre em `38dvh` (compacto) e pra ver tudo precisa achar o botão Maximize2 minúsculo no header.
- Novo: no **mobile, abrir = fullscreen direto** (`expanded=true`). Sem estado intermediário confuso.
- Desktop continua com compacto + expandir (não muda).

### 3. Header com handle (drag) visível e botões grandes
- Handle (grabber) maior e clicável: toque nele → minimiza.
- Botões do header (minimizar/fechar) com área de toque ≥40px no mobile (hoje são w-5 h-5 = 20px, abaixo do mínimo recomendado).
- Remove o botão Maximize/Minimize do header no mobile (não faz sentido com fullscreen-only).

### 4. Gesto de arrastar pra baixo pra minimizar
- Adicionar swipe-down no handle do topo: arrastar pra baixo > 60px minimiza o painel.
- Usar listener simples de `touchstart`/`touchmove`/`touchend` no grabber — sem dependência nova.

### 5. Footer mobile compacto mas tocável
- Botão "CADASTRAR" continua dominante (já é grande).
- "Enviar tudo" e "Sair" com altura mínima h-10 no mobile (hoje h-7 = 28px, difícil de acertar).

## Arquivos afetados

- `src/components/captacao/CaptureSheet.tsx` — toda a mudança fica aqui:
  - Reescrever bloco da pílula minimizada (full-width bar com botões claros)
  - Forçar `expanded=true` quando `isMobile` ao abrir
  - Aumentar áreas de toque do header/footer no mobile
  - Adicionar handlers de swipe-down no grabber

Nenhuma outra parte do sistema é tocada (sem mudar chat, sem mudar lógica de captação, sem mudar backend).

## Verificação

- Viewport 429x853 (o atual do usuário):
  1. Abrir captação → deve abrir fullscreen direto
  2. Tocar no grabber ou no botão ✕/minimize → minimiza pra barra grande no rodapé
  3. Barra minimizada deve mostrar texto legível + botão "Abrir" óbvio
  4. Arrastar pílula/header pra baixo → minimiza

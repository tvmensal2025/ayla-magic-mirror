## Captação mobile — barra fina e meia-tela

Arquivo único: `src/components/captacao/CaptureSheet.tsx`.

### 1. Barra minimizada (substitui a barra grande atual)

Altura `h-11` (≈44px) full-width no rodapé, respeitando `safe-area-inset-bottom`.

Layout em 1 linha:
- Esquerda: bolinha verde pequena (`w-7 h-7`) com ícone Gamepad
- Centro: texto compacto numa linha só → `Captação 2/10 · 0/10 passos` (font `text-xs`, truncate)
- Direita: botão circular verde (`w-9 h-9 rounded-full`) com ícone `Maximize2` (abre)
- Sem botão "Sair/X" na barra (evita toque acidental; fechar usa o X do header expandido)

Toque em qualquer parte da barra abre o sheet. Visual: `bg-card/95 backdrop-blur`, borda superior verde fina, sombra suave.

### 2. Abertura em meia tela

Ao expandir no mobile, o sheet sobe até **50dvh** (não fullscreen). Chat continua visível em cima.

- `expanded=false` por padrão no mobile → altura `h-[50dvh]`
- Grabber arrasta pra **cima** (>60px) → vira fullscreen (`expanded=true`, `h-[100dvh]`)
- Grabber arrasta pra **baixo** (>60px) → minimiza pra barra fina
- Overlay continua transparente e sem bloquear o chat enquanto não estiver fullscreen

### 3. Header/footer compactos no modo meia-tela

Mantém o layout compacto já existente (header `py-1`, footer `px-2 py-1`) quando `expanded=false`. Quando vira fullscreen, usa o layout grande já presente.

Botões do header com área de toque mínima 40px (`h-10 w-10`) — apenas X (fechar) e ChevronDown (minimizar) no mobile; desktop mantém Minimize/Maximize.

### 4. Não muda

- Lógica de captura, passos, envio, scoreboard, combo, XP — intocado
- Desktop continua igual (sheet `38dvh` compacto / fullscreen via M)
- Chat, useMessages, scroll — intocado

### Verificação

Preview 429x853:
- Abre lead → barra fina de 44px no rodapé com "Captação 2/10 · 0/10 passos" + botão redondo Abrir
- Toca barra → sheet sobe a 50dvh, chat continua visível acima
- Arrasta grabber pra cima → fullscreen
- Arrasta grabber pra baixo → volta pra barra fina
